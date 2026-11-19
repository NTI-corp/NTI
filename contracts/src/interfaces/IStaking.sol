// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IERC6372} from "@openzeppelin/contracts/interfaces/IERC6372.sol";

/// @title IStaking
/// @notice Interface for NTI $NTI staking, ETH yield sharing, slashing, tiers, and voting checkpoints.
interface IStaking is IVotes, IERC6372 {
    function stake(uint256 amount) external;
    function requestUnstake(uint256 amount) external;
    function withdraw() external;
    function claim() external returns (uint256 ethReward);
    function notifyReward() external payable;

    function stakeOf(address account) external view returns (uint256);
    function cooldownOf(address account) external view returns (uint256 amount, uint64 unlockAt);
    function totalActiveStaked() external view returns (uint256);
    function totalLocked() external view returns (uint256);
    function hasRadarAccess(address account) external view returns (bool);
    function discountBps(address account) external view returns (uint16);
    function pendingReward(address account) external view returns (uint256);

    function slash(address account, uint256 amount, address rewardTo) external returns (uint256 actualSlashed);
}
