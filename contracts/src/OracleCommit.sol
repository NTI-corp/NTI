// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

import {IConfigRegistry} from "./interfaces/IConfigRegistry.sol";
import {IOracleCommit} from "./interfaces/IOracleCommit.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {MedianMath} from "./libraries/MedianMath.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title OracleCommit
/// @notice On-chain oracle storing 4-hour narrative index vectors (I_n, V_n) committed by
///         OPERATOR_ROLE with >= 3 EIP-712 validator attestations, median aggregation,
///         2-hour dispute window, and bootstrap -> permissionless validator mode.
contract OracleCommit is IOracleCommit, Initializable, AccessControlUpgradeable, PausableUpgradeable, EIP712Upgradeable, UUPSUpgradeable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");

    uint8 public constant MAX_NARRATIVES = 32;
    uint8 public constant override STATUS_NONE = 0;
    uint8 public constant override STATUS_COMMITTED = 1;
    uint8 public constant override STATUS_DISPUTED = 2;
    uint8 public constant override STATUS_FINAL = 3;
    uint8 public constant override STATUS_INCOMPLETE = 4;

    uint64 public constant override EPOCH_DURATION = 4 hours;
    uint64 public constant MAX_TIMING = 7 days;

    // Timing parameters. Production values are the defaults; testnet shortens them with setTimings(),
    // and mainnet freezes them with lockTimings() right after deployment.
    uint64 public COMMIT_DELAY;
    uint64 public override DISPUTE_WINDOW;
    uint64 public INCOMPLETE_DELAY;
    bool public timingsLocked;
    uint16 public constant MAX_DEVIATION_BPS = 100;
    uint256 public constant MIN_VALIDATORS = 3;
    uint32 public constant MAX_AUTO_SKIP = 100;

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint32 epochId,bytes32 datasetHash,bytes32 configHash,bytes32 vectorHash)"
    );

    struct EpochRecord {
        uint32 seriesId;
        bytes32 datasetHash;
        bytes32 configHash;
        bytes32 arweaveTx;
        uint16[] i;
        int32[] v;
        address operator;
        uint64 committedAt;
        uint8 status;
    }

    struct StoredAttestation {
        address validator;
        uint16[] i;
    }

    IStaking public staking;
    IConfigRegistry public configRegistry;
    uint64 public genesisTimestamp;

    bool public permissionless;
    uint256 public minValidatorStake;

    uint32 public firstEpoch;
    uint32 public override lastProcessedEpoch;
    uint32 public override latestFinalEpoch;

    mapping(uint32 => EpochRecord) private _epochs;
    mapping(uint32 => StoredAttestation[]) private _epochAttestations;

    error ZeroAddress();
    error InvalidEpoch(uint32 epochId);
    error EpochNotReady(uint64 availableAt);
    error EpochAlreadyProcessed(uint32 epochId);
    error TooManySkippedEpochs(uint32 gap);
    error ConfigHashMismatch(bytes32 expected, bytes32 provided);
    error InvalidVectorLength(uint256 expected, uint256 provided);
    error InsufficientValidators(uint256 count);
    error InactiveValidator(address validator);
    error DuplicateValidator(address validator);
    error InvalidSignature(address validator);
    error OperatorDeviationExceeded(uint8 narrativeIndex, uint16 operatorVal, uint16 medianVal);
    error InvalidEpochStatus(uint8 expected, uint8 actual);
    error DisputeWindowActive(uint64 endsAt);
    error InvalidNarrativeId(uint8 narrativeId);
    error PermissionlessDisabled();
    error InsufficientValidatorStake(uint256 current, uint256 required);
    error TimingsAreLocked();
    error InvalidTimings();

    event EpochCommitted(
        uint32 indexed epochId,
        uint32 indexed seriesId,
        bytes32 datasetHash,
        bytes32 configHash,
        bytes32 arweaveTx,
        address indexed operator
    );
    event EpochFinalized(uint32 indexed epochId);
    event EpochMarkedIncomplete(uint32 indexed epochId);
    event EpochDisputed(uint32 indexed epochId);
    event EpochDisputeResolved(uint32 indexed epochId, bool challengerWon);
    event PermissionlessUpdated(bool enabled);
    event MinValidatorStakeUpdated(uint256 newMinStake);
    event ValidatorJoined(address indexed validator);
    event TimingsUpdated(uint64 commitDelay, uint64 disputeWindow, uint64 incompleteDelay);
    event TimingsFrozen();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address staking_,
        address configRegistry_,
        uint64 genesisTimestamp_,
        address admin_,
        address pauser_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __EIP712_init("NTIOracleCommit", "1");
        COMMIT_DELAY = 60 minutes;
        DISPUTE_WINDOW = 2 hours;
        INCOMPLETE_DELAY = 4 hours;
        minValidatorStake = 5_000_000e18;
        if (
            staking_ == address(0) || configRegistry_ == address(0) || admin_ == address(0)
                || pauser_ == address(0)
        ) revert ZeroAddress();
        staking = IStaking(staking_);
        configRegistry = IConfigRegistry(configRegistry_);
        genesisTimestamp = genesisTimestamp_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    // --- Pause Controls (only gates commit) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Validator Governance ---

    function setPermissionless(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        permissionless = enabled;
        emit PermissionlessUpdated(enabled);
    }

    function setTimings(uint64 commitDelay_, uint64 disputeWindow_, uint64 incompleteDelay_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (timingsLocked) revert TimingsAreLocked();
        if (
            commitDelay_ == 0 || disputeWindow_ == 0 || incompleteDelay_ == 0
                || commitDelay_ > MAX_TIMING || disputeWindow_ > MAX_TIMING
                || incompleteDelay_ > MAX_TIMING || incompleteDelay_ <= commitDelay_
        ) revert InvalidTimings();
        COMMIT_DELAY = commitDelay_;
        DISPUTE_WINDOW = disputeWindow_;
        INCOMPLETE_DELAY = incompleteDelay_;
        emit TimingsUpdated(commitDelay_, disputeWindow_, incompleteDelay_);
    }

    /// @notice Permanently freezes the timing parameters at their current values.
    function lockTimings() external onlyRole(DEFAULT_ADMIN_ROLE) {
        timingsLocked = true;
        emit TimingsFrozen();
    }

    function setMinValidatorStake(uint256 newMinStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minValidatorStake = newMinStake;
        emit MinValidatorStakeUpdated(newMinStake);
    }

    function joinAsValidator() external {
        if (!permissionless) revert PermissionlessDisabled();
        uint256 s = staking.stakeOf(msg.sender);
        if (s < minValidatorStake) revert InsufficientValidatorStake(s, minValidatorStake);
        _grantRole(VALIDATOR_ROLE, msg.sender);
        emit ValidatorJoined(msg.sender);
    }

    function isActiveValidator(address account) public view override returns (bool) {
        if (!hasRole(VALIDATOR_ROLE, account)) return false;
        if (permissionless && staking.stakeOf(account) < minValidatorStake) return false;
        return true;
    }

    // --- Timing & EIP-712 Helpers ---

    function epochBoundary(uint32 epochId) public view override returns (uint64) {
        return genesisTimestamp + uint64(epochId) * EPOCH_DURATION;
    }

    function hashAttestation(
        uint32 epochId,
        bytes32 datasetHash,
        bytes32 configHash,
        uint16[] calldata iVec,
        int32[] calldata vVec
    ) public view returns (bytes32) {
        bytes32 vectorHash = keccak256(abi.encode(iVec, vVec));
        bytes32 structHash = keccak256(
            abi.encode(ATTESTATION_TYPEHASH, epochId, datasetHash, configHash, vectorHash)
        );
        return _hashTypedDataV4(structHash);
    }

    // --- Core Oracle Lifecycle ---

    function commit(
        uint32 epochId,
        uint32 seriesId,
        bytes32 datasetHash,
        bytes32 configHash,
        bytes32 arweaveTx,
        uint16[] calldata iVec,
        int32[] calldata vVec,
        Attestation[] calldata atts
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (epochId == 0) revert InvalidEpoch(epochId);
        if (_epochs[epochId].status != STATUS_NONE) revert EpochAlreadyProcessed(epochId);
        if (epochId <= lastProcessedEpoch) revert EpochAlreadyProcessed(epochId);

        uint64 readyAt = epochBoundary(epochId) + COMMIT_DELAY;
        if (block.timestamp < readyAt) revert EpochNotReady(readyAt);

        // Auto-mark skipped earlier epochs as incomplete so commits can never deadlock.
        if (lastProcessedEpoch != 0 && epochId > lastProcessedEpoch + 1) {
            uint32 gap = epochId - lastProcessedEpoch - 1;
            if (gap > MAX_AUTO_SKIP) revert TooManySkippedEpochs(gap);
            for (uint32 e = lastProcessedEpoch + 1; e < epochId; e++) {
                if (_epochs[e].status == STATUS_NONE) {
                    _epochs[e].status = STATUS_INCOMPLETE;
                    emit EpochMarkedIncomplete(e);
                }
            }
        }

        (bytes32 expectedConfig, uint8 narrativeCount) = configRegistry.active(epochId);
        if (configHash != expectedConfig) revert ConfigHashMismatch(expectedConfig, configHash);
        if (iVec.length != narrativeCount) revert InvalidVectorLength(narrativeCount, iVec.length);
        if (vVec.length != narrativeCount) revert InvalidVectorLength(narrativeCount, vVec.length);
        if (atts.length < MIN_VALIDATORS) revert InsufficientValidators(atts.length);

        uint16[][] memory valIVectors = new uint16[][](atts.length);
        int32[][] memory valVVectors = new int32[][](atts.length);

        for (uint256 k = 0; k < atts.length; k++) {
            Attestation calldata att = atts[k];
            if (!isActiveValidator(att.validator)) revert InactiveValidator(att.validator);
            for (uint256 j = 0; j < k; j++) {
                if (atts[j].validator == att.validator) revert DuplicateValidator(att.validator);
            }
            if (att.i.length != narrativeCount) revert InvalidVectorLength(narrativeCount, att.i.length);
            if (att.v.length != narrativeCount) revert InvalidVectorLength(narrativeCount, att.v.length);

            bytes32 digest = hashAttestation(epochId, datasetHash, configHash, att.i, att.v);
            address recovered = ECDSA.recover(digest, att.sig);
            if (recovered != att.validator) revert InvalidSignature(att.validator);

            valIVectors[k] = att.i;
            valVVectors[k] = att.v;
        }

        uint16[] memory medianI = MedianMath.medianUint16Vectors(valIVectors, narrativeCount);
        int32[] memory medianV = MedianMath.medianInt32Vectors(valVVectors, narrativeCount);

        for (uint8 n = 0; n < narrativeCount; n++) {
            if (MedianMath.absDiffUint16(iVec[n], medianI[n]) > MAX_DEVIATION_BPS) {
                revert OperatorDeviationExceeded(n, iVec[n], medianI[n]);
            }
        }

        EpochRecord storage rec = _epochs[epochId];
        rec.seriesId = seriesId;
        rec.datasetHash = datasetHash;
        rec.configHash = configHash;
        rec.arweaveTx = arweaveTx;
        rec.i = medianI;
        rec.v = medianV;
        rec.operator = msg.sender;
        rec.committedAt = uint64(block.timestamp);
        rec.status = STATUS_COMMITTED;

        // Store validator attestations until finalization so Dispute.resolve can slash deviators.
        StoredAttestation[] storage stored = _epochAttestations[epochId];
        for (uint256 k = 0; k < atts.length; k++) {
            stored.push(StoredAttestation({validator: atts[k].validator, i: atts[k].i}));
        }

        if (firstEpoch == 0) firstEpoch = epochId;
        lastProcessedEpoch = epochId;

        emit EpochCommitted(epochId, seriesId, datasetHash, configHash, arweaveTx, msg.sender);
    }

    function finalize(uint32 epochId) external {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_COMMITTED) revert InvalidEpochStatus(STATUS_COMMITTED, rec.status);

        uint64 endsAt = rec.committedAt + DISPUTE_WINDOW;
        if (block.timestamp < endsAt) revert DisputeWindowActive(endsAt);

        rec.status = STATUS_FINAL;
        if (epochId > latestFinalEpoch) latestFinalEpoch = epochId;
        delete _epochAttestations[epochId];

        emit EpochFinalized(epochId);
    }

    function markIncomplete(uint32 epochId) external {
        if (epochId == 0) revert InvalidEpoch(epochId);
        if (firstEpoch != 0 && epochId < firstEpoch) revert InvalidEpoch(epochId);
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_NONE) revert EpochAlreadyProcessed(epochId);

        uint64 readyAt = epochBoundary(epochId) + INCOMPLETE_DELAY;
        if (block.timestamp < readyAt) revert EpochNotReady(readyAt);

        if (lastProcessedEpoch != 0 && epochId > lastProcessedEpoch + 1) {
            uint32 gap = epochId - lastProcessedEpoch - 1;
            if (gap > MAX_AUTO_SKIP) revert TooManySkippedEpochs(gap);
            for (uint32 e = lastProcessedEpoch + 1; e < epochId; e++) {
                if (_epochs[e].status == STATUS_NONE) {
                    _epochs[e].status = STATUS_INCOMPLETE;
                    emit EpochMarkedIncomplete(e);
                }
            }
        }

        rec.status = STATUS_INCOMPLETE;
        if (firstEpoch == 0) firstEpoch = epochId;
        if (epochId > lastProcessedEpoch) lastProcessedEpoch = epochId;

        emit EpochMarkedIncomplete(epochId);
    }

    // --- Dispute Hooks ---

    function markDisputed(uint32 epochId) external override onlyRole(DISPUTE_ROLE) {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_COMMITTED) revert InvalidEpochStatus(STATUS_COMMITTED, rec.status);
        rec.status = STATUS_DISPUTED;
        emit EpochDisputed(epochId);
    }

    function resolveDispute(
        uint32 epochId,
        bool challengerWon,
        uint16[] calldata newI,
        int32[] calldata newV
    ) external override onlyRole(DISPUTE_ROLE) {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_DISPUTED) revert InvalidEpochStatus(STATUS_DISPUTED, rec.status);

        if (challengerWon) {
            uint256 len = rec.i.length;
            if (newI.length != len) revert InvalidVectorLength(len, newI.length);
            if (newV.length != len) revert InvalidVectorLength(len, newV.length);
            rec.i = newI;
            rec.v = newV;
        }

        rec.status = STATUS_FINAL;
        if (epochId > latestFinalEpoch) latestFinalEpoch = epochId;
        delete _epochAttestations[epochId];

        emit EpochDisputeResolved(epochId, challengerWon);
        emit EpochFinalized(epochId);
    }

    function expireDispute(uint32 epochId) external override onlyRole(DISPUTE_ROLE) {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_DISPUTED) revert InvalidEpochStatus(STATUS_DISPUTED, rec.status);

        rec.status = STATUS_INCOMPLETE;
        delete _epochAttestations[epochId];

        emit EpochMarkedIncomplete(epochId);
    }

    // --- Views ---

    function isFinal(uint32 epochId) external view override returns (bool) {
        return _epochs[epochId].status == STATUS_FINAL;
    }

    function finalIndex(uint32 epochId, uint8 narrativeId) external view override returns (uint16) {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_FINAL) revert InvalidEpochStatus(STATUS_FINAL, rec.status);
        if (narrativeId == 0 || narrativeId > rec.i.length) revert InvalidNarrativeId(narrativeId);
        return rec.i[narrativeId - 1];
    }

    function finalVelocity(uint32 epochId, uint8 narrativeId) external view override returns (int32) {
        EpochRecord storage rec = _epochs[epochId];
        if (rec.status != STATUS_FINAL) revert InvalidEpochStatus(STATUS_FINAL, rec.status);
        if (narrativeId == 0 || narrativeId > rec.v.length) revert InvalidNarrativeId(narrativeId);
        return rec.v[narrativeId - 1];
    }

    function epochSeries(uint32 epochId) external view override returns (uint32) {
        return _epochs[epochId].seriesId;
    }

    function epochStatus(uint32 epochId) external view override returns (uint8) {
        return _epochs[epochId].status;
    }

    function epochNarrativeCount(uint32 epochId) external view override returns (uint8) {
        return uint8(_epochs[epochId].i.length);
    }

    function epochCommittedAt(uint32 epochId) external view override returns (uint64) {
        return _epochs[epochId].committedAt;
    }

    function epochOperator(uint32 epochId) external view override returns (address) {
        return _epochs[epochId].operator;
    }

    function epochMeta(uint32 epochId)
        external
        view
        override
        returns (
            uint32 seriesId,
            bytes32 datasetHash,
            bytes32 configHash,
            bytes32 arweaveTx,
            address operator,
            uint64 committedAt,
            uint8 status
        )
    {
        EpochRecord storage rec = _epochs[epochId];
        return (
            rec.seriesId,
            rec.datasetHash,
            rec.configHash,
            rec.arweaveTx,
            rec.operator,
            rec.committedAt,
            rec.status
        );
    }

    function epochVector(uint32 epochId)
        external
        view
        override
        returns (uint16[] memory iVec, int32[] memory vVec)
    {
        EpochRecord storage rec = _epochs[epochId];
        return (rec.i, rec.v);
    }

    function getEpochAttestations(uint32 epochId)
        external
        view
        override
        returns (address[] memory validators, uint16[][] memory iVectors)
    {
        StoredAttestation[] storage stored = _epochAttestations[epochId];
        uint256 len = stored.length;
        validators = new address[](len);
        iVectors = new uint16[][](len);
        for (uint256 k = 0; k < len; k++) {
            validators[k] = stored[k].validator;
            iVectors[k] = stored[k].i;
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
