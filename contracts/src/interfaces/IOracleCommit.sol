// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IOracleCommit
/// @notice On-chain NTI narrative index oracle with validator quorum, median aggregation, and dispute hooks.
interface IOracleCommit {
    struct Attestation {
        address validator;
        uint16[] i;
        int32[] v;
        bytes sig;
    }

    function STATUS_NONE() external view returns (uint8);
    function STATUS_COMMITTED() external view returns (uint8);
    function STATUS_DISPUTED() external view returns (uint8);
    function STATUS_FINAL() external view returns (uint8);
    function STATUS_INCOMPLETE() external view returns (uint8);

    function DISPUTE_WINDOW() external view returns (uint64);
    function EPOCH_DURATION() external view returns (uint64);

    function latestFinalEpoch() external view returns (uint32);
    function lastProcessedEpoch() external view returns (uint32);
    function epochBoundary(uint32 epochId) external view returns (uint64);

    function isActiveValidator(address account) external view returns (bool);
    function isFinal(uint32 epochId) external view returns (bool);
    function finalIndex(uint32 epochId, uint8 narrativeId) external view returns (uint16);
    function finalVelocity(uint32 epochId, uint8 narrativeId) external view returns (int32);
    function epochSeries(uint32 epochId) external view returns (uint32);
    function epochStatus(uint32 epochId) external view returns (uint8);
    function epochNarrativeCount(uint32 epochId) external view returns (uint8);
    function epochCommittedAt(uint32 epochId) external view returns (uint64);
    function epochOperator(uint32 epochId) external view returns (address);

    function epochMeta(uint32 epochId)
        external
        view
        returns (
            uint32 seriesId,
            bytes32 datasetHash,
            bytes32 configHash,
            bytes32 arweaveTx,
            address operator,
            uint64 committedAt,
            uint8 status
        );

    function epochVector(uint32 epochId) external view returns (uint16[] memory i, int32[] memory v);

    function getEpochAttestations(uint32 epochId)
        external
        view
        returns (address[] memory validators, uint16[][] memory iVectors);

    function markDisputed(uint32 epochId) external;
    function resolveDispute(
        uint32 epochId,
        bool challengerWon,
        uint16[] calldata newI,
        int32[] calldata newV
    ) external;
    function expireDispute(uint32 epochId) external;
}
