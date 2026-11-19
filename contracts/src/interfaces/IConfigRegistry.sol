// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IConfigRegistry
/// @notice Governance-controlled oracle configuration hashes and narrative counts per epoch.
interface IConfigRegistry {
    struct ConfigVersion {
        bytes32 configHash;
        uint8 narrativeCount;
        uint32 effectiveEpoch;
    }

    function MAX_NARRATIVES() external view returns (uint8);
    function kolSetHash() external view returns (bytes32);
    function setConfig(bytes32 configHash, uint8 narrativeCount, uint32 effectiveEpoch) external;
    function setKolSetHash(bytes32 newKolSetHash) external;
    function active(uint32 epochId) external view returns (bytes32 configHash, uint8 narrativeCount);
    function versionCount() external view returns (uint256);
    function versionAt(uint256 index) external view returns (ConfigVersion memory);
}
