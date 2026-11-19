// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title NTITimelock
/// @notice Governance timelock enforcing a 48-hour execution delay on all NTI protocol changes.
contract NTITimelock is TimelockController {
    uint256 public constant TIMELOCK_DELAY = 48 hours; // 172,800 seconds

    constructor(address[] memory proposers, address[] memory executors, address admin)
        TimelockController(TIMELOCK_DELAY, proposers, executors, admin)
    {}
}
