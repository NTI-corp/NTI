// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

import {INTIRegistry} from "./interfaces/INTIRegistry.sol";
import {IStaking} from "./interfaces/IStaking.sol";

/// @title Staking
/// @notice $NTI staking contract providing:
///         - Fee-on-transfer safe staking (measures exact received delta)
///         - 7-day unstake cooldown (no voting power / no ETH yield while cooling down)
///         - Slashing across BOTH active stake and cooldown balance (bootstrap 0-stake safe)
///         - Pro-rata ETH reward distribution from FeeRouter (30% of market fees)
///         - Block-number voting checkpoints implementing OZ IVotes + IERC6372
///         - Pause only halts new stakes; claim, requestUnstake, and withdraw stay open
contract Staking is IStaking, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Checkpoints for Checkpoints.Trace208;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public constant COOLDOWN_DURATION = 7 days;
    uint256 public constant REWARD_PRECISION = 1e18;

    struct Cooldown {
        uint256 amount;
        uint64 unlockAt;
    }

    INTIRegistry public immutable registry;

    uint256 public override totalActiveStaked;
    uint256 public totalCooldown;

    uint256 public rewardPerShare;
    uint256 public undistributedRewards;

    // Configurable tier thresholds (updated via DEFAULT_ADMIN_ROLE / Timelock)
    uint256 public radarMinStake = 100_000e18;
    uint256 public tier1Stake = 100_000e18;
    uint256 public tier2Stake = 1_000_000e18;
    uint256 public tier3Stake = 5_000_000e18;
    uint16 public tier1DiscountBps = 1000; // 10%
    uint16 public tier2DiscountBps = 2500; // 25%
    uint16 public tier3DiscountBps = 5000; // 50%

    mapping(address => uint256) private _activeStake;
    mapping(address => Cooldown) private _cooldowns;
    mapping(address => uint256) private _userRewardPerSharePaid;
    mapping(address => uint256) private _accruedRewards;

    mapping(address => Checkpoints.Trace208) private _voteCheckpoints;
    Checkpoints.Trace208 private _totalSupplyCheckpoints;

    error ZeroAddress();
    error ZeroAmount();
    error NtiNotConfigured();
    error InsufficientStake();
    error CooldownNotElapsed(uint64 unlockAt);
    error NothingToWithdraw();
    error EthTransferFailed();
    error FutureLookup(uint256 timepoint, uint48 currentClock);
    error ExternalDelegationDisabled();
    error InvalidTierConfig();

    event Staked(address indexed account, uint256 receivedAmount);
    event UnstakeRequested(address indexed account, uint256 amount, uint64 unlockAt);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardNotified(uint256 ethAdded, uint256 distributed, uint256 buffered);
    event RewardClaimed(address indexed account, uint256 ethReward);
    event Slashed(
        address indexed account,
        uint256 requestedAmount,
        uint256 actualSlashed,
        uint256 toReward,
        uint256 toBurn,
        address indexed rewardTo
    );
    event TiersUpdated(
        uint256 radarMin,
        uint256 t1Stake,
        uint256 t2Stake,
        uint256 t3Stake,
        uint16 t1Bps,
        uint16 t2Bps,
        uint16 t3Bps
    );

    constructor(address registry_, address admin_, address pauser_) {
        if (registry_ == address(0) || admin_ == address(0) || pauser_ == address(0)) {
            revert ZeroAddress();
        }
        registry = INTIRegistry(registry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    // --- Pause Controls (only gate stake()) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Governance Tier Config ---

    function setTiers(
        uint256 radarMin_,
        uint256 t1Stake_,
        uint256 t2Stake_,
        uint256 t3Stake_,
        uint16 t1Bps_,
        uint16 t2Bps_,
        uint16 t3Bps_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (t1Stake_ > t2Stake_ || t2Stake_ > t3Stake_) revert InvalidTierConfig();
        if (t1Bps_ > t2Bps_ || t2Bps_ > t3Bps_ || t3Bps_ > 10_000) revert InvalidTierConfig();
        radarMinStake = radarMin_;
        tier1Stake = t1Stake_;
        tier2Stake = t2Stake_;
        tier3Stake = t3Stake_;
        tier1DiscountBps = t1Bps_;
        tier2DiscountBps = t2Bps_;
        tier3DiscountBps = t3Bps_;
        emit TiersUpdated(radarMin_, t1Stake_, t2Stake_, t3Stake_, t1Bps_, t2Bps_, t3Bps_);
    }

    // --- Core Staking Lifecycle ---

    function stake(uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();

        _updateReward(msg.sender);

        IERC20 token = IERC20(ntiAddr);
        uint256 balBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();

        uint256 newActive = _activeStake[msg.sender] + received;
        _activeStake[msg.sender] = newActive;
        uint256 newTotal = totalActiveStaked + received;
        totalActiveStaked = newTotal;

        _writeCheckpoints(msg.sender, newActive, newTotal);
        emit Staked(msg.sender, received);
    }

    function requestUnstake(uint256 amount) external override nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 active = _activeStake[msg.sender];
        if (amount > active) revert InsufficientStake();

        _updateReward(msg.sender);

        uint256 newActive = active - amount;
        _activeStake[msg.sender] = newActive;
        uint256 newTotal = totalActiveStaked - amount;
        totalActiveStaked = newTotal;

        Cooldown storage cd = _cooldowns[msg.sender];
        cd.amount += amount;
        uint64 unlockAt = uint64(block.timestamp) + COOLDOWN_DURATION;
        cd.unlockAt = unlockAt;
        totalCooldown += amount;

        _writeCheckpoints(msg.sender, newActive, newTotal);
        emit UnstakeRequested(msg.sender, amount, unlockAt);
    }

    function withdraw() external override nonReentrant {
        Cooldown storage cd = _cooldowns[msg.sender];
        uint256 amount = cd.amount;
        if (amount == 0) revert NothingToWithdraw();
        if (block.timestamp < cd.unlockAt) revert CooldownNotElapsed(cd.unlockAt);

        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();

        cd.amount = 0;
        cd.unlockAt = 0;
        totalCooldown -= amount;

        IERC20(ntiAddr).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function notifyReward() external payable override {
        if (msg.value == 0) return;

        if (totalActiveStaked == 0) {
            undistributedRewards += msg.value;
            emit RewardNotified(msg.value, 0, undistributedRewards);
            return;
        }

        uint256 toDistribute = msg.value + undistributedRewards;
        undistributedRewards = 0;
        rewardPerShare += Math.mulDiv(toDistribute, REWARD_PRECISION, totalActiveStaked);
        emit RewardNotified(msg.value, toDistribute, 0);
    }

    function claim() external override nonReentrant returns (uint256 ethReward) {
        _updateReward(msg.sender);
        ethReward = _accruedRewards[msg.sender];
        if (ethReward == 0) return 0;

        _accruedRewards[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: ethReward}("");
        if (!ok) revert EthTransferFailed();
        emit RewardClaimed(msg.sender, ethReward);
    }

    /// @notice Slashes active stake first, then cooldown balance, clamping to available locked tokens.
    ///         50% sent to rewardTo (if non-zero), remainder sent to registry.burnAddress().
    function slash(
        address account,
        uint256 amount,
        address rewardTo
    ) external override onlyRole(SLASHER_ROLE) nonReentrant returns (uint256 actualSlashed) {
        if (amount == 0) return 0;

        _updateReward(account);

        uint256 active = _activeStake[account];
        Cooldown storage cd = _cooldowns[account];
        uint256 cdAmt = cd.amount;
        uint256 available = active + cdAmt;
        if (available == 0) return 0;

        actualSlashed = amount > available ? available : amount;

        uint256 fromActive = actualSlashed > active ? active : actualSlashed;
        uint256 fromCooldown = actualSlashed - fromActive;

        if (fromActive > 0) {
            uint256 newActive = active - fromActive;
            _activeStake[account] = newActive;
            uint256 newTotal = totalActiveStaked - fromActive;
            totalActiveStaked = newTotal;
            _writeCheckpoints(account, newActive, newTotal);
        }

        if (fromCooldown > 0) {
            cd.amount = cdAmt - fromCooldown;
            if (cd.amount == 0) cd.unlockAt = 0;
            totalCooldown -= fromCooldown;
        }

        address ntiAddr = registry.nti();
        if (ntiAddr == address(0)) revert NtiNotConfigured();

        uint256 toReward = rewardTo == address(0) ? 0 : actualSlashed / 2;
        uint256 toBurn = actualSlashed - toReward;

        if (toReward > 0) {
            IERC20(ntiAddr).safeTransfer(rewardTo, toReward);
        }
        if (toBurn > 0) {
            IERC20(ntiAddr).safeTransfer(registry.burnAddress(), toBurn);
        }

        emit Slashed(account, amount, actualSlashed, toReward, toBurn, rewardTo);
    }

    // --- Views ---

    function stakeOf(address account) external view override returns (uint256) {
        return _activeStake[account];
    }

    function cooldownOf(address account) external view override returns (uint256 amount, uint64 unlockAt) {
        Cooldown storage cd = _cooldowns[account];
        return (cd.amount, cd.unlockAt);
    }

    function totalLocked() external view override returns (uint256) {
        return totalActiveStaked + totalCooldown;
    }

    function hasRadarAccess(address account) external view override returns (bool) {
        return _activeStake[account] >= radarMinStake;
    }

    function discountBps(address account) external view override returns (uint16) {
        uint256 s = _activeStake[account];
        if (s >= tier3Stake) return tier3DiscountBps;
        if (s >= tier2Stake) return tier2DiscountBps;
        if (s >= tier1Stake) return tier1DiscountBps;
        return 0;
    }

    function pendingReward(address account) external view override returns (uint256) {
        uint256 delta = rewardPerShare - _userRewardPerSharePaid[account];
        return _accruedRewards[account] + Math.mulDiv(_activeStake[account], delta, REWARD_PRECISION);
    }

    // --- IERC6372 + IVotes ---

    function clock() public view override returns (uint48) {
        return SafeCast.toUint48(block.number);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() external pure override returns (string memory) {
        return "mode=blocknumber&from=default";
    }

    function getVotes(address account) external view override returns (uint256) {
        return _voteCheckpoints[account].latest();
    }

    function getPastVotes(address account, uint256 timepoint) external view override returns (uint256) {
        uint48 current = clock();
        if (timepoint >= current) revert FutureLookup(timepoint, current);
        return _voteCheckpoints[account].upperLookupRecent(SafeCast.toUint48(timepoint));
    }

    function getPastTotalSupply(uint256 timepoint) external view override returns (uint256) {
        uint48 current = clock();
        if (timepoint >= current) revert FutureLookup(timepoint, current);
        return _totalSupplyCheckpoints.upperLookupRecent(SafeCast.toUint48(timepoint));
    }

    function delegates(address account) external pure override returns (address) {
        return account;
    }

    function delegate(address delegatee) external view override {
        if (delegatee != msg.sender) revert ExternalDelegationDisabled();
    }

    function delegateBySig(address, uint256, uint256, uint8, bytes32, bytes32) external pure override {
        revert ExternalDelegationDisabled();
    }

    // --- Internal Helpers ---

    function _updateReward(address account) internal {
        uint256 rps = rewardPerShare;
        uint256 delta = rps - _userRewardPerSharePaid[account];
        if (delta > 0 && _activeStake[account] > 0) {
            _accruedRewards[account] += Math.mulDiv(_activeStake[account], delta, REWARD_PRECISION);
        }
        _userRewardPerSharePaid[account] = rps;
    }

    function _writeCheckpoints(address account, uint256 newAccountVotes, uint256 newTotalVotes) internal {
        uint48 key = clock();
        uint208 prevAccount = _voteCheckpoints[account].latest();
        uint208 nextAccount = SafeCast.toUint208(newAccountVotes);
        _voteCheckpoints[account].push(key, nextAccount);
        _totalSupplyCheckpoints.push(key, SafeCast.toUint208(newTotalVotes));
        emit DelegateVotesChanged(account, prevAccount, nextAccount);
    }
}
