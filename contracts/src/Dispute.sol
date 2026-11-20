// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {INTIRegistry} from "./interfaces/INTIRegistry.sol";
import {IOracleCommit} from "./interfaces/IOracleCommit.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {MedianMath} from "./libraries/MedianMath.sol";

/// @title Dispute
/// @notice Bonded oracle dispute mechanism with fee-on-transfer safe $NTI bond escrow,
///         6-hour validator resolution, slashing of operator & deviating validators, and expiry refund.
contract Dispute is AccessControl, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint8 public constant STATE_NONE = 0;
    uint8 public constant STATE_OPEN = 1;
    uint8 public constant STATE_WON = 2;
    uint8 public constant STATE_LOST = 3;
    uint8 public constant STATE_EXPIRED = 4;

    uint64 public constant MAX_TIMING = 7 days;
    uint64 public RESOLUTION_WINDOW = 6 hours;
    bool public timingsLocked;
    uint16 public constant DEVIATION_THRESHOLD_BPS = 100;
    uint256 public constant MIN_VALIDATORS = 3;

    bytes32 public constant RESOLUTION_TYPEHASH = keccak256(
        "ResolutionAttestation(uint256 disputeId,uint32 epochId,bytes32 datasetHash,bytes32 configHash,bytes32 vectorHash)"
    );

    struct DisputeRecord {
        uint32 epochId;
        uint8 narrativeId;
        uint16 claimedI;
        bytes32 evidenceHash;
        address challenger;
        uint256 bondReceived;
        uint64 openedAt;
        uint8 state;
    }

    INTIRegistry public immutable registry;
    IOracleCommit public immutable oracleCommit;
    IStaking public immutable staking;

    uint256 public disputeBond = 50_000e18;
    uint256 public operatorSlashAmount = 500_000e18;
    uint256 public validatorSlashAmount = 250_000e18;

    uint256 public nextDisputeId = 1;
    mapping(uint256 => DisputeRecord) public disputes;
    mapping(uint32 => uint256) public disputeOfEpoch;

    error ZeroAddress();
    error ZeroAmount();
    error NtiNotConfigured();
    error EpochNotCommitted();
    error EpochAlreadyDisputed(uint32 epochId);
    error DisputeWindowClosed();
    error InvalidNarrativeId(uint8 narrativeId);
    error DisputeNotOpen(uint256 disputeId);
    error ResolutionWindowClosed();
    error ResolutionWindowActive(uint64 endsAt);
    error InsufficientValidators(uint256 count);
    error InactiveValidator(address validator);
    error DuplicateValidator(address validator);
    error InvalidVectorLength(uint256 expected, uint256 provided);
    error InvalidSignature(address validator);
    error TimingsAreLocked();
    error InvalidTimings();

    event DisputeOpened(
        uint256 indexed disputeId,
        uint32 indexed epochId,
        uint8 narrativeId,
        address indexed challenger,
        uint16 claimedI,
        uint256 bondReceived,
        bytes32 evidenceHash
    );
    event DisputeResolved(uint256 indexed disputeId, uint32 indexed epochId, bool challengerWon);
    event DisputeExpired(uint256 indexed disputeId, uint32 indexed epochId);
    event DisputeParamsUpdated(uint256 bond, uint256 operatorSlash, uint256 validatorSlash);
    event ResolutionWindowUpdated(uint64 window);
    event TimingsFrozen();

    constructor(
        address registry_,
        address oracleCommit_,
        address staking_,
        address admin_,
        address pauser_
    ) EIP712("NTIDispute", "1") {
        if (
            registry_ == address(0) || oracleCommit_ == address(0) || staking_ == address(0)
                || admin_ == address(0) || pauser_ == address(0)
        ) revert ZeroAddress();

        registry = INTIRegistry(registry_);
        oracleCommit = IOracleCommit(oracleCommit_);
        staking = IStaking(staking_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    // --- Pause Controls (only gates openDispute; resolve and expire stay open) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Governance ---

    function setParams(uint256 bond_, uint256 operatorSlash_, uint256 validatorSlash_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (bond_ == 0) revert ZeroAmount();
        disputeBond = bond_;
        operatorSlashAmount = operatorSlash_;
        validatorSlashAmount = validatorSlash_;
        emit DisputeParamsUpdated(bond_, operatorSlash_, validatorSlash_);
    }

    function setResolutionWindow(uint64 window_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (timingsLocked) revert TimingsAreLocked();
        if (window_ == 0 || window_ > MAX_TIMING) revert InvalidTimings();
        RESOLUTION_WINDOW = window_;
        emit ResolutionWindowUpdated(window_);
    }

    /// @notice Permanently freezes the resolution window at its current value.
    function lockTimings() external onlyRole(DEFAULT_ADMIN_ROLE) {
        timingsLocked = true;
        emit TimingsFrozen();
    }

    // --- EIP-712 Helper ---

    function hashResolution(
        uint256 disputeId,
        uint32 epochId,
        bytes32 datasetHash,
        bytes32 configHash,
        uint16[] calldata iVec,
        int32[] calldata vVec
    ) public view returns (bytes32) {
        bytes32 vectorHash = keccak256(abi.encode(iVec, vVec));
        bytes32 structHash = keccak256(
            abi.encode(RESOLUTION_TYPEHASH, disputeId, epochId, datasetHash, configHash, vectorHash)
        );
        return _hashTypedDataV4(structHash);
    }

    // --- Core Dispute Flow ---

    function openDispute(uint32 epochId, uint8 narrativeId, uint16 claimedI, bytes32 evidenceHash)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 disputeId)
    {
        if (disputeOfEpoch[epochId] != 0) revert EpochAlreadyDisputed(epochId);
        if (oracleCommit.epochStatus(epochId) != oracleCommit.STATUS_COMMITTED()) {
            revert EpochNotCommitted();
        }
        uint64 committedAt = oracleCommit.epochCommittedAt(epochId);
        if (block.timestamp >= uint256(committedAt) + oracleCommit.DISPUTE_WINDOW()) {
            revert DisputeWindowClosed();
        }
        uint8 count = oracleCommit.epochNarrativeCount(epochId);
        if (narrativeId == 0 || narrativeId > count) revert InvalidNarrativeId(narrativeId);

        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();

        // Balance-before/after delta for fee-on-transfer safety (Pons creator tax).
        IERC20 token = IERC20(ntiAddr);
        uint256 balBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), disputeBond);
        uint256 actualBond = token.balanceOf(address(this)) - balBefore;
        if (actualBond == 0) revert ZeroAmount();

        disputeId = nextDisputeId++;
        disputeOfEpoch[epochId] = disputeId;
        disputes[disputeId] = DisputeRecord({
            epochId: epochId,
            narrativeId: narrativeId,
            claimedI: claimedI,
            evidenceHash: evidenceHash,
            challenger: msg.sender,
            bondReceived: actualBond,
            openedAt: uint64(block.timestamp),
            state: STATE_OPEN
        });

        oracleCommit.markDisputed(epochId);

        emit DisputeOpened(
            disputeId, epochId, narrativeId, msg.sender, claimedI, actualBond, evidenceHash
        );
    }

    function resolve(uint256 disputeId, IOracleCommit.Attestation[] calldata atts) external nonReentrant {
        DisputeRecord storage d = disputes[disputeId];
        if (d.state != STATE_OPEN) revert DisputeNotOpen(disputeId);
        if (block.timestamp > uint256(d.openedAt) + RESOLUTION_WINDOW) {
            revert ResolutionWindowClosed();
        }
        if (atts.length < MIN_VALIDATORS) revert InsufficientValidators(atts.length);

        (, bytes32 datasetHash, bytes32 configHash,, address operator,,) =
            oracleCommit.epochMeta(d.epochId);
        (uint16[] memory oldI,) = oracleCommit.epochVector(d.epochId);
        uint8 narrativeCount = uint8(oldI.length);

        uint16[][] memory valIVectors = new uint16[][](atts.length);
        int32[][] memory valVVectors = new int32[][](atts.length);

        for (uint256 k = 0; k < atts.length; k++) {
            IOracleCommit.Attestation calldata att = atts[k];
            if (!oracleCommit.isActiveValidator(att.validator)) {
                revert InactiveValidator(att.validator);
            }
            for (uint256 j = 0; j < k; j++) {
                if (atts[j].validator == att.validator) revert DuplicateValidator(att.validator);
            }
            if (att.i.length != narrativeCount) revert InvalidVectorLength(narrativeCount, att.i.length);
            if (att.v.length != narrativeCount) revert InvalidVectorLength(narrativeCount, att.v.length);

            bytes32 digest = hashResolution(disputeId, d.epochId, datasetHash, configHash, att.i, att.v);
            address recovered = ECDSA.recover(digest, att.sig);
            if (recovered != att.validator) revert InvalidSignature(att.validator);

            valIVectors[k] = att.i;
            valVVectors[k] = att.v;
        }

        uint16[] memory newMedianI = MedianMath.medianUint16Vectors(valIVectors, narrativeCount);
        int32[] memory newMedianV = MedianMath.medianInt32Vectors(valVVectors, narrativeCount);

        uint8 idx = d.narrativeId - 1;
        bool challengerWon =
            MedianMath.absDiffUint16(newMedianI[idx], oldI[idx]) > DEVIATION_THRESHOLD_BPS;

        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();
        IERC20 token = IERC20(ntiAddr);

        if (challengerWon) {
            d.state = STATE_WON;

            // Read original validator attestations BEFORE OracleCommit clears them on resolve.
            (address[] memory origValidators, uint16[][] memory origIVectors) =
                oracleCommit.getEpochAttestations(d.epochId);

            oracleCommit.resolveDispute(d.epochId, true, newMedianI, newMedianV);

            // Slash operator and any original validator that deviated > 100 bps from resolved median.
            if (operator != address(0) && operatorSlashAmount > 0) {
                staking.slash(operator, operatorSlashAmount, d.challenger);
            }
            if (validatorSlashAmount > 0) {
                for (uint256 k = 0; k < origValidators.length; k++) {
                    if (
                        MedianMath.absDiffUint16(origIVectors[k][idx], newMedianI[idx])
                            > DEVIATION_THRESHOLD_BPS
                    ) {
                        staking.slash(origValidators[k], validatorSlashAmount, d.challenger);
                    }
                }
            }

            // Refund actual received bond to challenger.
            token.safeTransfer(d.challenger, d.bondReceived);
        } else {
            d.state = STATE_LOST;

            oracleCommit.resolveDispute(d.epochId, false, newMedianI, newMedianV);

            // 50% split among resolving validators, 50% (+ rounding dust) burned.
            uint256 valPool = d.bondReceived / 2;
            uint256 perValidator = valPool / atts.length;
            uint256 totalValPaid = perValidator * atts.length;
            uint256 toBurn = d.bondReceived - totalValPaid;

            if (perValidator > 0) {
                for (uint256 k = 0; k < atts.length; k++) {
                    token.safeTransfer(atts[k].validator, perValidator);
                }
            }
            if (toBurn > 0) {
                token.safeTransfer(registry.burnAddress(), toBurn);
            }
        }

        emit DisputeResolved(disputeId, d.epochId, challengerWon);
    }

    function expire(uint256 disputeId) external nonReentrant {
        DisputeRecord storage d = disputes[disputeId];
        if (d.state != STATE_OPEN) revert DisputeNotOpen(disputeId);

        uint64 endsAt = d.openedAt + RESOLUTION_WINDOW;
        if (block.timestamp <= endsAt) revert ResolutionWindowActive(endsAt);

        d.state = STATE_EXPIRED;
        oracleCommit.expireDispute(d.epochId);

        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();
        IERC20(ntiAddr).safeTransfer(d.challenger, d.bondReceived);

        emit DisputeExpired(disputeId, d.epochId);
    }
}
