// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Grants} from "../src/Grants.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";
import {IOracleCommit} from "../src/interfaces/IOracleCommit.sol";

/// @notice Stateful fuzz handler exercising OracleCommit, NarrativeMarket, FeeRouter, and Grants together.
contract ProtocolHandler is Test {
    NTIRegistry public immutable registry;
    NTITestToken public immutable nti;
    Staking public immutable staking;
    ConfigRegistry public immutable configRegistry;
    OracleCommit public immutable oracle;
    InsuranceFund public immutable insurance;
    Grants public immutable grants;
    FeeRouter public immutable feeRouter;
    NarrativeMarket public immutable market;

    address public immutable operator;
    address public immutable keeper;
    uint256[3] internal valPks;
    bytes32 public immutable cfgHash;

    address[] public actors;
    uint32 public nextEpoch = 1;

    // Ghost accounting for invariants
    uint256 public ghostMarketDeposited;
    uint256 public ghostMarketClaimed;
    uint256 public ghostFeeRouterReceived;
    uint256 public ghostGrantsReceived;
    uint256 public ghostGrantsClaimed;
    uint256 public ghostLastBuybackAmount;

    // Oracle commit median bounds tracking
    mapping(uint32 => uint16) public ghostMinVal0;
    mapping(uint32 => uint16) public ghostMaxVal0;
    uint32[] public committedEpochs;

    constructor(
        NTIRegistry registry_,
        NTITestToken nti_,
        Staking staking_,
        ConfigRegistry configRegistry_,
        OracleCommit oracle_,
        InsuranceFund insurance_,
        Grants grants_,
        FeeRouter feeRouter_,
        NarrativeMarket market_,
        address operator_,
        address keeper_,
        uint256[3] memory valPks_,
        bytes32 cfgHash_
    ) {
        registry = registry_;
        nti = nti_;
        staking = staking_;
        configRegistry = configRegistry_;
        oracle = oracle_;
        insurance = insurance_;
        grants = grants_;
        feeRouter = feeRouter_;
        market = market_;
        operator = operator_;
        keeper = keeper_;
        valPks = valPks_;
        cfgHash = cfgHash_;

        actors.push(makeAddr("invActor0"));
        actors.push(makeAddr("invActor1"));
        actors.push(makeAddr("invActor2"));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function committedEpochCount() external view returns (uint256) {
        return committedEpochs.length;
    }

    function committedEpochAt(uint256 i) external view returns (uint32) {
        return committedEpochs[i];
    }

    // --- Oracle Actions ---

    function commitAndFinalizeNextEpoch(uint16 raw0, uint16 raw1, uint16 raw2) external {
        uint32 ep = nextEpoch;
        nextEpoch += 1;

        uint16 v0 = uint16(bound(uint256(raw0), 1000, 5000));
        uint16 v1 = uint16(bound(uint256(raw1), 1000, 5000));
        uint16 v2 = uint16(bound(uint256(raw2), 1000, 5000));

        // Sort to know median, min, max for narrative 0
        uint16 minV = v0 < v1 ? (v0 < v2 ? v0 : v2) : (v1 < v2 ? v1 : v2);
        uint16 maxV = v0 > v1 ? (v0 > v2 ? v0 : v2) : (v1 > v2 ? v1 : v2);
        uint16 medV = uint16(uint256(v0) + uint256(v1) + uint256(v2) - uint256(minV) - uint256(maxV));

        uint64 commitTime = oracle.epochBoundary(ep) + 60 minutes;
        if (block.timestamp < commitTime) vm.warp(commitTime);

        uint16[3] memory vals = [v0, v1, v2];
        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        bytes32 ds = keccak256(abi.encode("inv-ds", ep));
        int32[] memory vel = new int32[](2);

        for (uint256 k = 0; k < 3; k++) {
            uint16[] memory iv = new uint16[](2);
            iv[0] = vals[k];
            iv[1] = 10_000 - vals[k];
            bytes32 dig = oracle.hashAttestation(ep, ds, cfgHash, iv, vel);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(valPks[k], dig);
            atts[k] = IOracleCommit.Attestation(vm.addr(valPks[k]), iv, vel, abi.encodePacked(r, s, v));
        }

        uint16[] memory opI = new uint16[](2);
        opI[0] = medV;
        opI[1] = 10_000 - medV;

        vm.prank(operator);
        oracle.commit(ep, 1, ds, cfgHash, keccak256("ar"), opI, vel, atts);

        ghostMinVal0[ep] = minV;
        ghostMaxVal0[ep] = maxV;
        committedEpochs.push(ep);

        vm.warp(block.timestamp + 2 hours);
        oracle.finalize(ep);
    }

    // --- Market Actions ---

    function createMarket() external {
        uint32 baseEp = oracle.latestFinalEpoch();
        if (baseEp == 0) return;
        if (market.openMarketsCount() >= market.maxOpenMarkets()) return;
        market.createMarket(1, 2, baseEp + 6);
    }

    function betOnMarket(uint256 mSeed, uint256 actorSeed, uint8 sideSeed, uint64 rawEth) external {
        uint256 count = market.nextMarketId() - 1;
        if (count == 0) return;
        uint256 id = (mSeed % count) + 1;

        (
            ,,,
            uint32 settleEp,,
            ,,
            uint256 p0G,
            uint256 p1G,
            ,,
            bool settled
        ) = market.markets(id);
        if (settled) return;

        uint64 cutoff = oracle.epochBoundary(settleEp - 2);
        if (block.timestamp >= cutoff) return;

        uint256 roomMarket = market.maxPoolPerMarket() - (p0G + p1G);
        uint256 roomGlobal = market.maxGlobalTVL() - market.globalTVL();
        uint256 maxAmt = roomMarket < roomGlobal ? roomMarket : roomGlobal;
        if (maxAmt < market.minBet()) return;

        uint256 amt = bound(uint256(rawEth), market.minBet(), maxAmt > 1 ether ? 1 ether : maxAmt);
        address actor = actors[actorSeed % actors.length];
        vm.deal(actor, amt);

        vm.prank(actor);
        market.bet{value: amt}(id, sideSeed % 2);
        ghostMarketDeposited += amt;
    }

    function settleMarket(uint256 mSeed) external {
        uint256 count = market.nextMarketId() - 1;
        if (count == 0) return;
        uint256 id = (mSeed % count) + 1;
        (,,, uint32 settleEp,,,,,,,, bool settled) = market.markets(id);
        if (settled) return;

        uint8 st = oracle.epochStatus(settleEp);
        bool timedOut = st != oracle.STATUS_FINAL()
            && block.timestamp > uint256(oracle.epochBoundary(settleEp)) + market.SETTLE_TIMEOUT();
        if (st != oracle.STATUS_FINAL() && st != oracle.STATUS_INCOMPLETE() && !timedOut) return;

        uint256 frBefore = address(feeRouter).balance;
        market.settle(id);
        ghostFeeRouterReceived += (address(feeRouter).balance - frBefore);
    }

    function claimMarket(uint256 mSeed, uint256 actorSeed) external {
        uint256 count = market.nextMarketId() - 1;
        if (count == 0) return;
        uint256 id = (mSeed % count) + 1;
        address actor = actors[actorSeed % actors.length];

        uint256 preview = market.previewClaim(id, actor);
        if (preview == 0) return;

        vm.prank(actor);
        uint256 paid = market.claim(id);
        ghostMarketClaimed += paid;
    }

    // --- FeeRouter Actions ---

    function sendFeesAndDistribute(uint64 rawEth) external {
        uint256 amt = bound(uint256(rawEth), 10_000, 1 ether);
        vm.deal(address(this), amt);
        (bool ok,) = payable(address(feeRouter)).call{value: amt}("");
        if (!ok) return;
        ghostFeeRouterReceived += amt;

        uint256 grantsBefore = address(grants).balance;
        feeRouter.distribute();
        ghostGrantsReceived += (address(grants).balance - grantsBefore);
    }

    // --- Grants Actions ---

    function runGrantRoundCycle(uint64 rawTopUp) external {
        uint256 topUp = bound(uint256(rawTopUp), 0.01 ether, 1 ether);
        vm.deal(address(this), topUp);
        (bool ok,) = payable(address(grants)).call{value: topUp}("");
        if (!ok) return;
        ghostGrantsReceived += topUp;

        uint256 cur = grants.currentRoundId();
        if (cur > 0) {
            (,,,,,, bool fin) = grants.rounds(cur);
            if (!fin) {
                (,,, uint64 endsAt,,,) = grants.rounds(cur);
                if (block.timestamp < endsAt) vm.warp(endsAt);
                grants.finalizeRound(cur);
            }
        }

        vm.roll(block.number + 2);
        vm.prank(keeper);
        uint256 rid = grants.startRound(1 days);

        vm.prank(actors[0]);
        uint256 pid = grants.submitProposal(keccak256(abi.encode("g", rid)), actors[1]);

        uint256[] memory ids = new uint256[](1);
        ids[0] = pid;
        uint256[] memory w = new uint256[](1);
        w[0] = 100_000e18;
        vm.prank(actors[0]);
        grants.vote(rid, ids, w);

        vm.warp(block.timestamp + 1 days);
        grants.finalizeRound(rid);

        (,,,, uint256 alloc, bool claimed) = grants.proposals(rid, pid);
        if (alloc > 0 && !claimed) {
            vm.prank(actors[1]);
            uint256 paid = grants.claim(rid, pid);
            ghostGrantsClaimed += paid;
        }
    }
}

contract ProtocolInvariantsTest is StdInvariant, Test {
    ProtocolHandler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        address pauser = makeAddr("pauser");
        address operator = makeAddr("operator");
        address keeper = makeAddr("keeper");
        uint256[3] memory pks = [uint256(0xA1), uint256(0xB2), uint256(0xC3)];
        bytes32 cfgHash = keccak256("inv-cfg");

        vm.roll(10);
        vm.startPrank(admin);
        NTIRegistry registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, makeAddr("weth"))))));
        NTITestToken nti = new NTITestToken(admin);
        Staking staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        ConfigRegistry configRegistry = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin)))));
        OracleCommit oracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(configRegistry), 0, admin, pauser)))));
        InsuranceFund insurance = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (admin)))));
        Grants grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), admin, keeper, pauser)))));
        FeeRouter feeRouter = FeeRouter(payable(deployProxy(address(new FeeRouter()), abi.encodeCall(FeeRouter.initialize, (address(registry), address(staking), address(grants), address(insurance), admin, keeper, pauser)))));
        NarrativeMarket market = NarrativeMarket(payable(deployProxy(address(new NarrativeMarket()), abi.encodeCall(NarrativeMarket.initialize, (address(oracle), address(staking), address(feeRouter), admin, pauser)))));

        registry.setStaking(address(staking));
        registry.setNti(address(nti));
        configRegistry.setConfig(cfgHash, 2, 1);

        oracle.grantRole(oracle.OPERATOR_ROLE(), operator);
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(pks[0]));
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(pks[1]));
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(pks[2]));

        handler = new ProtocolHandler(
            registry,
            nti,
            staking,
            configRegistry,
            oracle,
            insurance,
            grants,
            feeRouter,
            market,
            operator,
            keeper,
            pks,
            cfgHash
        );

        // Give actor0 1M NTI and stake so Grants proposals/votes meet quorum
        nti.transfer(handler.actorAt(0), 1_000_000e18);
        vm.stopPrank();

        vm.startPrank(handler.actorAt(0));
        nti.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        vm.stopPrank();

        vm.roll(20);
        targetContract(address(handler));
    }

    /// @notice NarrativeMarket: payouts never exceed total deposited ETH, and contract stays solvent.
    function invariant_NarrativeMarketSolvency() public view {
        assertLe(handler.ghostMarketClaimed(), handler.ghostMarketDeposited());
        assertGe(
            address(handler.market()).balance + handler.ghostMarketClaimed() + handler.ghostFeeRouterReceived(),
            handler.ghostMarketDeposited()
        );
    }

    /// @notice FeeRouter: buybackPool + pendingStakingETH never exceed contract ETH balance.
    function invariant_FeeRouterAccountingSolvency() public view {
        FeeRouter fr = handler.feeRouter();
        assertLe(fr.buybackPool() + fr.pendingStakingETH(), address(fr).balance);
    }

    /// @notice Grants: totalReservedUnclaimed <= contract balance and total claimed <= total received.
    function invariant_GrantsReserveAndPayoutBounds() public view {
        Grants g = handler.grants();
        assertLe(g.totalReservedUnclaimed(), address(g).balance);
        assertLe(handler.ghostGrantsClaimed(), handler.ghostGrantsReceived());
    }

    /// @notice OracleCommit: finalized median always lies within [min, max] of validator vectors.
    function invariant_OracleMedianWithinValidatorBounds() public view {
        OracleCommit oc = handler.oracle();
        uint256 len = handler.committedEpochCount();
        for (uint256 i = 0; i < len; i++) {
            uint32 ep = handler.committedEpochAt(i);
            assertTrue(oc.isFinal(ep));
            uint16 val = oc.finalIndex(ep, 1);
            assertGe(val, handler.ghostMinVal0(ep));
            assertLe(val, handler.ghostMaxVal0(ep));
        }
    }
}
