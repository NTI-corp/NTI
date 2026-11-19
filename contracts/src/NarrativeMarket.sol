// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IOracleCommit} from "./interfaces/IOracleCommit.sol";
import {IStaking} from "./interfaces/IStaking.sol";

/// @title NarrativeMarket
/// @notice Fixed-horizon (24h / 7d) parimutuel narrative pair market settled from OracleCommit.
///         Pausing only gates market creation and betting; settle() and claim() always remain open.
contract NarrativeMarket is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint32 public constant HORIZON_SHORT = 6; // 6 epochs = 24 hours
    uint32 public constant HORIZON_LONG = 42; // 42 epochs = 7 days
    uint32 public constant BET_CUTOFF_EPOCHS = 2; // 8 hours before settleEpoch boundary
    uint64 public constant SETTLE_TIMEOUT = 48 hours;
    uint16 public constant BASE_FEE_BPS = 10; // 0.1%

    uint8 public constant OUTCOME_OPEN = 0;
    uint8 public constant OUTCOME_SIDE0 = 1;
    uint8 public constant OUTCOME_SIDE1 = 2;
    uint8 public constant OUTCOME_REFUND = 3;

    struct Market {
        uint8 narrativeA;
        uint8 narrativeB; // 0 = equal-weighted average of active narratives with I(base) > 0
        uint32 baseEpoch;
        uint32 settleEpoch;
        uint32 baseSeriesId;
        uint256 pool0Net;
        uint256 pool1Net;
        uint256 pool0Gross;
        uint256 pool1Gross;
        uint256 escrowedFees;
        uint8 outcome;
        bool settled;
    }

    struct Position {
        uint256 gross0;
        uint256 net0;
        uint256 gross1;
        uint256 net1;
        bool claimed;
    }

    IOracleCommit public immutable oracleCommit;
    IStaking public immutable staking;
    address public immutable feeRouter;

    uint256 public minBet = 0.001 ether;
    uint256 public maxPoolPerMarket = 5 ether;
    uint256 public maxOpenMarkets = 20;
    uint256 public maxGlobalTVL = 50 ether;

    uint256 public nextMarketId = 1;
    uint256 public openMarketsCount;
    uint256 public globalTVL;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    error ZeroAddress();
    error InvalidMarket(uint256 marketId);
    error MarketAlreadySettled(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error NoFinalBaseEpoch();
    error InvalidHorizon(uint32 baseEpoch, uint32 settleEpoch);
    error InvalidNarrativePair(uint8 narrativeA, uint8 narrativeB);
    error ZeroBaseIndex(uint8 narrativeId);
    error MaxOpenMarketsReached();
    error InvalidSide(uint8 side);
    error BetBelowMinimum(uint256 provided, uint256 minimum);
    error BettingClosed(uint64 cutoffAt);
    error MarketPoolCapExceeded();
    error GlobalTVLCapExceeded();
    error SettlementNotReady();
    error AlreadyClaimed();
    error NothingToClaim();
    error EthTransferFailed();
    error InvalidParams();

    event MarketCreated(
        uint256 indexed marketId,
        uint8 narrativeA,
        uint8 narrativeB,
        uint32 baseEpoch,
        uint32 settleEpoch,
        uint32 baseSeriesId
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        uint8 side,
        uint256 grossAmount,
        uint256 netAmount,
        uint256 feeAmount
    );
    event MarketSettled(uint256 indexed marketId, uint8 outcome, uint256 feesSent);
    event Claimed(uint256 indexed marketId, address indexed bettor, uint256 payout);
    event RiskParamsUpdated(uint256 minBet, uint256 maxPoolPerMarket, uint256 maxOpenMarkets, uint256 maxGlobalTVL);

    constructor(
        address oracleCommit_,
        address staking_,
        address feeRouter_,
        address admin_,
        address pauser_
    ) {
        if (
            oracleCommit_ == address(0) || staking_ == address(0) || feeRouter_ == address(0)
                || admin_ == address(0) || pauser_ == address(0)
        ) revert ZeroAddress();

        oracleCommit = IOracleCommit(oracleCommit_);
        staking = IStaking(staking_);
        feeRouter = feeRouter_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    // --- Pause Controls (only gate createMarket and bet; settle and claim stay open) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Governance ---

    function setRiskParams(
        uint256 minBet_,
        uint256 maxPoolPerMarket_,
        uint256 maxOpenMarkets_,
        uint256 maxGlobalTVL_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minBet_ == 0 || maxPoolPerMarket_ == 0 || maxOpenMarkets_ == 0 || maxGlobalTVL_ == 0) {
            revert InvalidParams();
        }
        minBet = minBet_;
        maxPoolPerMarket = maxPoolPerMarket_;
        maxOpenMarkets = maxOpenMarkets_;
        maxGlobalTVL = maxGlobalTVL_;
        emit RiskParamsUpdated(minBet_, maxPoolPerMarket_, maxOpenMarkets_, maxGlobalTVL_);
    }

    // --- Core Market Lifecycle ---

    function createMarket(uint8 narrativeA, uint8 narrativeB, uint32 settleEpoch)
        external
        whenNotPaused
        returns (uint256 id)
    {
        if (openMarketsCount >= maxOpenMarkets) revert MaxOpenMarketsReached();

        uint32 baseEpoch = oracleCommit.latestFinalEpoch();
        if (baseEpoch == 0 || !oracleCommit.isFinal(baseEpoch)) revert NoFinalBaseEpoch();
        if (settleEpoch != baseEpoch + HORIZON_SHORT && settleEpoch != baseEpoch + HORIZON_LONG) {
            revert InvalidHorizon(baseEpoch, settleEpoch);
        }

        uint8 count = oracleCommit.epochNarrativeCount(baseEpoch);
        if (narrativeA == 0 || narrativeA > count) {
            revert InvalidNarrativePair(narrativeA, narrativeB);
        }
        if (narrativeB != 0 && (narrativeB > count || narrativeB == narrativeA)) {
            revert InvalidNarrativePair(narrativeA, narrativeB);
        }

        if (oracleCommit.finalIndex(baseEpoch, narrativeA) == 0) revert ZeroBaseIndex(narrativeA);
        if (narrativeB != 0 && oracleCommit.finalIndex(baseEpoch, narrativeB) == 0) {
            revert ZeroBaseIndex(narrativeB);
        }

        uint32 baseSeriesId = oracleCommit.epochSeries(baseEpoch);

        id = nextMarketId++;
        markets[id] = Market({
            narrativeA: narrativeA,
            narrativeB: narrativeB,
            baseEpoch: baseEpoch,
            settleEpoch: settleEpoch,
            baseSeriesId: baseSeriesId,
            pool0Net: 0,
            pool1Net: 0,
            pool0Gross: 0,
            pool1Gross: 0,
            escrowedFees: 0,
            outcome: OUTCOME_OPEN,
            settled: false
        });
        openMarketsCount += 1;

        emit MarketCreated(id, narrativeA, narrativeB, baseEpoch, settleEpoch, baseSeriesId);
    }

    function bet(uint256 id, uint8 side) external payable whenNotPaused nonReentrant {
        if (id == 0 || id >= nextMarketId) revert InvalidMarket(id);
        if (side > 1) revert InvalidSide(side);
        if (msg.value < minBet) revert BetBelowMinimum(msg.value, minBet);

        Market storage m = markets[id];
        if (m.settled) revert MarketAlreadySettled(id);

        uint64 cutoffAt = oracleCommit.epochBoundary(m.settleEpoch - BET_CUTOFF_EPOCHS);
        if (block.timestamp >= cutoffAt) revert BettingClosed(cutoffAt);

        if (m.pool0Gross + m.pool1Gross + msg.value > maxPoolPerMarket) {
            revert MarketPoolCapExceeded();
        }
        if (globalTVL + msg.value > maxGlobalTVL) revert GlobalTVLCapExceeded();

        uint16 discount = staking.discountBps(msg.sender);
        uint256 rawFee = (msg.value * BASE_FEE_BPS) / 10_000;
        uint256 fee = (rawFee * (10_000 - discount)) / 10_000;
        uint256 net = msg.value - fee;

        Position storage pos = positions[id][msg.sender];
        if (side == 0) {
            m.pool0Gross += msg.value;
            m.pool0Net += net;
            pos.gross0 += msg.value;
            pos.net0 += net;
        } else {
            m.pool1Gross += msg.value;
            m.pool1Net += net;
            pos.gross1 += msg.value;
            pos.net1 += net;
        }

        m.escrowedFees += fee;
        globalTVL += msg.value;

        emit BetPlaced(id, msg.sender, side, msg.value, net, fee);
    }

    function settle(uint256 id) external nonReentrant {
        if (id == 0 || id >= nextMarketId) revert InvalidMarket(id);
        Market storage m = markets[id];
        if (m.settled) revert MarketAlreadySettled(id);

        uint8 st = oracleCommit.epochStatus(m.settleEpoch);
        uint8 statusFinal = oracleCommit.STATUS_FINAL();
        uint8 statusIncomplete = oracleCommit.STATUS_INCOMPLETE();
        bool timedOut = st != statusFinal
            && block.timestamp > uint256(oracleCommit.epochBoundary(m.settleEpoch)) + SETTLE_TIMEOUT;

        if (st != statusFinal && st != statusIncomplete && !timedOut) {
            revert SettlementNotReady();
        }

        m.settled = true;
        openMarketsCount -= 1;
        globalTVL -= (m.pool0Gross + m.pool1Gross);

        uint8 outcome = _determineOutcome(m, st == statusFinal);
        m.outcome = outcome;

        uint256 feesToSend = 0;
        if (outcome == OUTCOME_SIDE0 || outcome == OUTCOME_SIDE1) {
            feesToSend = m.escrowedFees;
            if (feesToSend > 0) {
                (bool ok,) = payable(feeRouter).call{value: feesToSend}("");
                if (!ok) revert EthTransferFailed();
            }
        }

        emit MarketSettled(id, outcome, feesToSend);
    }

    function claim(uint256 id) external nonReentrant returns (uint256 payout) {
        if (id == 0 || id >= nextMarketId) revert InvalidMarket(id);
        Market storage m = markets[id];
        if (!m.settled) revert MarketNotSettled(id);

        Position storage pos = positions[id][msg.sender];
        if (pos.claimed) revert AlreadyClaimed();

        payout = _previewClaim(m, pos);
        if (payout == 0) revert NothingToClaim();

        pos.claimed = true;

        (bool ok,) = payable(msg.sender).call{value: payout}("");
        if (!ok) revert EthTransferFailed();

        emit Claimed(id, msg.sender, payout);
    }

    function previewClaim(uint256 id, address account) external view returns (uint256) {
        if (id == 0 || id >= nextMarketId) return 0;
        Market storage m = markets[id];
        if (!m.settled) return 0;
        Position storage pos = positions[id][account];
        if (pos.claimed) return 0;
        return _previewClaim(m, pos);
    }

    // --- Internal Helpers ---

    function _determineOutcome(Market storage m, bool settleIsFinal) internal view returns (uint8) {
        if (!settleIsFinal) return OUTCOME_REFUND;
        if (m.pool0Net == 0 || m.pool1Net == 0) return OUTCOME_REFUND;
        if (oracleCommit.epochSeries(m.settleEpoch) != m.baseSeriesId) return OUTCOME_REFUND;

        uint8 baseCount = oracleCommit.epochNarrativeCount(m.baseEpoch);
        if (oracleCommit.epochNarrativeCount(m.settleEpoch) != baseCount) return OUTCOME_REFUND;

        uint16 iABase = oracleCommit.finalIndex(m.baseEpoch, m.narrativeA);
        uint16 iASettle = oracleCommit.finalIndex(m.settleEpoch, m.narrativeA);

        if (m.narrativeB != 0) {
            uint16 iBBase = oracleCommit.finalIndex(m.baseEpoch, m.narrativeB);
            uint16 iBSettle = oracleCommit.finalIndex(m.settleEpoch, m.narrativeB);

            uint256 lhs = uint256(iASettle) * uint256(iBBase);
            uint256 rhs = uint256(iBSettle) * uint256(iABase);
            if (lhs > rhs) return OUTCOME_SIDE0;
            if (lhs < rhs) return OUTCOME_SIDE1;
            return OUTCOME_REFUND;
        } else {
            // Equal-weighted average growth across all narratives with I_n(base) > 0.
            uint256 ratioA = Math.mulDiv(uint256(iASettle), 1e18, uint256(iABase));
            uint256 sumRatio = 0;
            uint256 activeCount = 0;
            for (uint8 n = 1; n <= baseCount; n++) {
                uint16 baseVal = oracleCommit.finalIndex(m.baseEpoch, n);
                if (baseVal > 0) {
                    uint16 settleVal = oracleCommit.finalIndex(m.settleEpoch, n);
                    sumRatio += Math.mulDiv(uint256(settleVal), 1e18, uint256(baseVal));
                    activeCount++;
                }
            }
            if (activeCount == 0) return OUTCOME_REFUND;
            uint256 avgRatioB = sumRatio / activeCount;
            if (ratioA > avgRatioB) return OUTCOME_SIDE0;
            if (ratioA < avgRatioB) return OUTCOME_SIDE1;
            return OUTCOME_REFUND;
        }
    }

    function _previewClaim(Market storage m, Position storage pos) internal view returns (uint256) {
        if (m.outcome == OUTCOME_REFUND) {
            return pos.gross0 + pos.gross1;
        }
        uint256 totalNet = m.pool0Net + m.pool1Net;
        if (m.outcome == OUTCOME_SIDE0) {
            return pos.net0 == 0 ? 0 : Math.mulDiv(pos.net0, totalNet, m.pool0Net);
        }
        if (m.outcome == OUTCOME_SIDE1) {
            return pos.net1 == 0 ? 0 : Math.mulDiv(pos.net1, totalNet, m.pool1Net);
        }
        return 0;
    }
}
