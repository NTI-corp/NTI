// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Basket} from "./Basket.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title BasketFactory
/// @notice Deploys and indexes one Basket vault per narrativeId (1..32).
contract BasketFactory is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    uint8 public constant MAX_NARRATIVES = 32;

    address public registry;
    address public swapRouter02;
    address public feeRouter;
    UpgradeableBeacon public basketBeacon;

    mapping(uint8 => address) public basketOf;
    address[] private _allBaskets;

    error ZeroAddress();
    error InvalidNarrativeId(uint8 narrativeId);
    error BasketAlreadyExists(uint8 narrativeId);

    event BasketCreated(uint8 indexed narrativeId, address indexed basket, string name, string symbol);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address registry_,
        address swapRouter02_,
        address feeRouter_,
        address admin_,
        address basketImplementation_
    ) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        if (
            registry_ == address(0) || swapRouter02_ == address(0) || feeRouter_ == address(0)
                || admin_ == address(0)
        ) revert ZeroAddress();

        registry = registry_;
        swapRouter02 = swapRouter02_;
        feeRouter = feeRouter_;
        if (basketImplementation_.code.length == 0) revert ZeroAddress();
        basketBeacon = new UpgradeableBeacon(basketImplementation_, address(this));
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    function createBasket(
        uint8 narrativeId,
        string calldata name,
        string calldata symbol,
        address admin,
        address keeper,
        address pauser
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (address basket) {
        if (narrativeId == 0 || narrativeId > MAX_NARRATIVES) revert InvalidNarrativeId(narrativeId);
        if (basketOf[narrativeId] != address(0)) revert BasketAlreadyExists(narrativeId);

        // Every basket is a beacon proxy: upgradeBasketImplementation() upgrades all of them at once.
        basket = address(
            new BeaconProxy(
                address(basketBeacon),
                abi.encodeCall(
                    Basket.initialize,
                    (narrativeId, name, symbol, registry, swapRouter02, feeRouter, admin, keeper, pauser)
                )
            )
        );
        basketOf[narrativeId] = basket;
        _allBaskets.push(basket);

        emit BasketCreated(narrativeId, basket, name, symbol);
    }

    /// @notice Points every existing and future basket at a new implementation.
    function upgradeBasketImplementation(address newImplementation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newImplementation.code.length == 0) revert ZeroAddress();
        basketBeacon.upgradeTo(newImplementation);
    }

    function basketImplementation() external view returns (address) {
        return basketBeacon.implementation();
    }

    function allBaskets() external view returns (address[] memory) {
        return _allBaskets;
    }

    function basketCount() external view returns (uint256) {
        return _allBaskets.length;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
