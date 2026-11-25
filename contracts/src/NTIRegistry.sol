// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import {INTIRegistry} from "./interfaces/INTIRegistry.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title NTIRegistry
/// @notice Single source of truth for the $NTI token address, WETH, burn sink, and buyback adapter.
///         Before freeze(), owner may switch from NTITestToken to the live $NTI CA only when
///         IStaking.totalLocked() == 0 (no active or cooldown test tokens left in Staking).
contract NTIRegistry is INTIRegistry, Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    address public override nti;
    address public override weth;
    address public override buybackAdapter;
    address public override staking;
    bool public override frozen;

    error ZeroAddress();
    error RegistryIsFrozen();
    error StakeNotEmpty();
    error NtiNotSet();

    event NtiUpdated(address indexed token);
    event StakingUpdated(address indexed stakingContract);
    event BuybackAdapterUpdated(address indexed adapter);
    event RegistryFrozen(address indexed ntiToken);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address weth_) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(initialOwner);
        __Ownable2Step_init();
        if (weth_ == address(0)) revert ZeroAddress();
        weth = weth_;
    }

    function burnAddress() external pure override returns (address) {
        return BURN_ADDRESS;
    }

    function setStaking(address staking_) external onlyOwner {
        if (frozen) revert RegistryIsFrozen();
        if (staking_ == address(0)) revert ZeroAddress();
        staking = staking_;
        emit StakingUpdated(staking_);
    }

    function setNti(address token) external onlyOwner {
        if (frozen) revert RegistryIsFrozen();
        if (token == address(0)) revert ZeroAddress();
        if (staking != address(0) && IStaking(staking).totalLocked() != 0) {
            revert StakeNotEmpty();
        }
        nti = token;
        emit NtiUpdated(token);
    }

    function setBuybackAdapter(address adapter) external onlyOwner {
        // adapter may be address(0) while token is on bonding curve or buybacks are held.
        buybackAdapter = adapter;
        emit BuybackAdapterUpdated(adapter);
    }

    function freeze() external onlyOwner {
        if (frozen) revert RegistryIsFrozen();
        if (nti == address(0)) revert NtiNotSet();
        frozen = true;
        emit RegistryFrozen(nti);
    }

    function buybackReady() external view override returns (bool) {
        return buybackAdapter != address(0) && nti != address(0);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
