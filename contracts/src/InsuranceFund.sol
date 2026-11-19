// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title InsuranceFund
/// @notice Holds 10% of protocol ETH fees as an insurance reserve.
///         Withdrawals are restricted exclusively to DEFAULT_ADMIN_ROLE (Timelock).
contract InsuranceFund is AccessControl, ReentrancyGuard {
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error EthTransferFailed();

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 bal = address(this).balance;
        if (amount > bal) revert InsufficientBalance(amount, bal);

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit Withdrawn(to, amount);
    }
}
