// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IConfigRegistry} from "./interfaces/IConfigRegistry.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title ConfigRegistry
/// @notice Stores governance-approved oracle configuration hashes, narrative counts (<= 32),
///         effective epochs, and the approved KOL universe hash.
contract ConfigRegistry is IConfigRegistry, Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    uint8 public constant override MAX_NARRATIVES = 32;

    bytes32 public override kolSetHash;
    ConfigVersion[] private _versions;

    error ZeroAddress();
    error InvalidConfigHash();
    error InvalidNarrativeCount(uint8 count);
    error NonMonotonicEpoch(uint32 provided, uint32 previous);
    error NoActiveConfig(uint32 epochId);

    event ConfigSet(bytes32 indexed configHash, uint8 narrativeCount, uint32 indexed effectiveEpoch);
    event KolSetHashUpdated(bytes32 indexed kolSetHash);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        if (admin_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    function setConfig(bytes32 configHash, uint8 narrativeCount, uint32 effectiveEpoch)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (configHash == bytes32(0)) revert InvalidConfigHash();
        if (narrativeCount == 0 || narrativeCount > MAX_NARRATIVES) {
            revert InvalidNarrativeCount(narrativeCount);
        }
        uint256 len = _versions.length;
        if (len > 0) {
            uint32 prevEpoch = _versions[len - 1].effectiveEpoch;
            if (effectiveEpoch <= prevEpoch) {
                revert NonMonotonicEpoch(effectiveEpoch, prevEpoch);
            }
        }
        _versions.push(
            ConfigVersion({
                configHash: configHash,
                narrativeCount: narrativeCount,
                effectiveEpoch: effectiveEpoch
            })
        );
        emit ConfigSet(configHash, narrativeCount, effectiveEpoch);
    }

    function setKolSetHash(bytes32 newKolSetHash) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newKolSetHash == bytes32(0)) revert InvalidConfigHash();
        kolSetHash = newKolSetHash;
        emit KolSetHashUpdated(newKolSetHash);
    }

    function active(uint32 epochId) external view override returns (bytes32 configHash, uint8 narrativeCount) {
        uint256 len = _versions.length;
        for (uint256 i = len; i > 0; i--) {
            ConfigVersion storage v = _versions[i - 1];
            if (v.effectiveEpoch <= epochId) {
                return (v.configHash, v.narrativeCount);
            }
        }
        revert NoActiveConfig(epochId);
    }

    function versionCount() external view override returns (uint256) {
        return _versions.length;
    }

    function versionAt(uint256 index) external view override returns (ConfigVersion memory) {
        return _versions[index];
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
