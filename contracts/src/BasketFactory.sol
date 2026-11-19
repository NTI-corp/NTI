// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Basket} from "./Basket.sol";

/// @title BasketFactory
/// @notice Deploys and indexes one Basket vault per narrativeId (1..32).
contract BasketFactory is AccessControl {
    uint8 public constant MAX_NARRATIVES = 32;

    address public immutable registry;
    address public immutable swapRouter02;
    address public immutable feeRouter;

    mapping(uint8 => address) public basketOf;
    address[] private _allBaskets;

    error ZeroAddress();
    error InvalidNarrativeId(uint8 narrativeId);
    error BasketAlreadyExists(uint8 narrativeId);

    event BasketCreated(uint8 indexed narrativeId, address indexed basket, string name, string symbol);

    constructor(address registry_, address swapRouter02_, address feeRouter_, address admin_) {
        if (
            registry_ == address(0) || swapRouter02_ == address(0) || feeRouter_ == address(0)
                || admin_ == address(0)
        ) revert ZeroAddress();

        registry = registry_;
        swapRouter02 = swapRouter02_;
        feeRouter = feeRouter_;
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

        basket = address(
            new Basket(
                narrativeId, name, symbol, registry, swapRouter02, feeRouter, admin, keeper, pauser
            )
        );
        basketOf[narrativeId] = basket;
        _allBaskets.push(basket);

        emit BasketCreated(narrativeId, basket, name, symbol);
    }

    function allBaskets() external view returns (address[] memory) {
        return _allBaskets;
    }

    function basketCount() external view returns (uint256) {
        return _allBaskets.length;
    }
}
