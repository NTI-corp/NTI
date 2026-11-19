// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBuybackAdapter} from "./interfaces/IBuybackAdapter.sol";
import {INTIRegistry} from "./interfaces/INTIRegistry.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {IWETH} from "./interfaces/IWETH.sol";

interface IBasketRedeemable {
    function redeem(uint256 shares, uint256 minEthOut) external returns (uint256 ethOut);
}

/// @title FeeRouter
/// @notice Splits protocol ETH revenue 40% buyback / 30% Staking / 20% Grants / 10% InsuranceFund,
///         buffers staking share when totalActiveStaked == 0, and executes rate-limited buyback-and-burn.
contract FeeRouter is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint16 public constant BUYBACK_BPS = 4000;
    uint16 public constant STAKING_BPS = 3000;
    uint16 public constant GRANTS_BPS = 2000;
    uint16 public constant INSURANCE_BPS = 1000;
    uint64 public constant BUYBACK_COOLDOWN = 5 minutes;

    INTIRegistry public immutable registry;
    IStaking public immutable staking;
    address public immutable grants;
    address public immutable insuranceFund;

    uint256 public buybackPool;
    uint256 public pendingStakingETH;
    uint256 public maxPerCall = 0.2 ether;
    uint64 public lastBuybackAt;

    error ZeroAddress();
    error ZeroAmount();
    error BuybackNotReady();
    error ExceedsMaxPerCall(uint256 amountIn, uint256 maxAllowed);
    error InsufficientBuybackPool(uint256 amountIn, uint256 available);
    error BuybackCooldownActive(uint64 nextAvailableAt);
    error SlippageExceeded(uint256 received, uint256 minOut);
    error EthTransferFailed(address recipient);

    event FeesReceived(address indexed sender, uint256 amount);
    event FeesDistributed(
        uint256 totalDistributed,
        uint256 buybackShare,
        uint256 stakingShare,
        uint256 grantsShare,
        uint256 insuranceShare
    );
    event PendingStakingFlushed(uint256 amount);
    event BuybackExecuted(address indexed adapter, uint256 ethIn, uint256 ntiBurned);
    event MaxPerCallUpdated(uint256 newMaxPerCall);
    event BasketFeeRedeemed(address indexed basket, uint256 shares, uint256 ethOut);

    constructor(
        address registry_,
        address staking_,
        address grants_,
        address insuranceFund_,
        address admin_,
        address keeper_,
        address pauser_
    ) {
        if (
            registry_ == address(0) || staking_ == address(0) || grants_ == address(0)
                || insuranceFund_ == address(0) || admin_ == address(0) || keeper_ == address(0)
                || pauser_ == address(0)
        ) revert ZeroAddress();

        registry = INTIRegistry(registry_);
        staking = IStaking(staking_);
        grants = grants_;
        insuranceFund = insuranceFund_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE, keeper_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    receive() external payable {
        emit FeesReceived(msg.sender, msg.value);
    }

    // --- Pause Controls (only gates executeBuyback; distribute stays open) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setMaxPerCall(uint256 newMaxPerCall) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMaxPerCall == 0) revert ZeroAmount();
        maxPerCall = newMaxPerCall;
        emit MaxPerCallUpdated(newMaxPerCall);
    }

    /// @notice Undistributed ETH currently available to split.
    function undistributedBalance() public view returns (uint256) {
        uint256 reserved = buybackPool + pendingStakingETH;
        uint256 bal = address(this).balance;
        return bal > reserved ? bal - reserved : 0;
    }

    /// @notice Splits all undistributed ETH 40/30/20/10 and flushes buffered staking ETH once stakers exist.
    function distribute() external nonReentrant {
        uint256 available = undistributedBalance();
        bool hasActiveStakers = staking.totalActiveStaked() > 0;

        if (available == 0) {
            if (pendingStakingETH > 0 && hasActiveStakers) {
                uint256 flushAmt = pendingStakingETH;
                pendingStakingETH = 0;
                staking.notifyReward{value: flushAmt}();
                emit PendingStakingFlushed(flushAmt);
            }
            return;
        }

        uint256 buybackShare = (available * BUYBACK_BPS) / 10_000;
        uint256 stakingShare = (available * STAKING_BPS) / 10_000;
        uint256 grantsShare = (available * GRANTS_BPS) / 10_000;
        uint256 insuranceShare = available - buybackShare - stakingShare - grantsShare;

        buybackPool += buybackShare;

        uint256 toStakingNow = 0;
        if (hasActiveStakers) {
            toStakingNow = stakingShare + pendingStakingETH;
            pendingStakingETH = 0;
        } else {
            pendingStakingETH += stakingShare;
        }

        if (toStakingNow > 0) {
            staking.notifyReward{value: toStakingNow}();
        }
        if (grantsShare > 0) {
            (bool okGrants,) = payable(grants).call{value: grantsShare}("");
            if (!okGrants) revert EthTransferFailed(grants);
        }
        if (insuranceShare > 0) {
            (bool okIns,) = payable(insuranceFund).call{value: insuranceShare}("");
            if (!okIns) revert EthTransferFailed(insuranceFund);
        }

        emit FeesDistributed(available, buybackShare, stakingShare, grantsShare, insuranceShare);
    }

    /// @notice Swaps `amountIn` ETH from `buybackPool` into $NTI via the active registry adapter and burns it.
    function executeBuyback(
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        bytes calldata routeData
    ) external onlyRole(KEEPER_ROLE) whenNotPaused nonReentrant returns (uint256 burned) {
        if (!registry.buybackReady()) revert BuybackNotReady();
        if (amountIn == 0) revert ZeroAmount();
        if (amountIn > maxPerCall) revert ExceedsMaxPerCall(amountIn, maxPerCall);
        if (amountIn > buybackPool) revert InsufficientBuybackPool(amountIn, buybackPool);
        if (lastBuybackAt != 0 && block.timestamp < uint256(lastBuybackAt) + BUYBACK_COOLDOWN) {
            revert BuybackCooldownActive(lastBuybackAt + BUYBACK_COOLDOWN);
        }

        address adapter = registry.buybackAdapter();
        address wethAddr = registry.weth();
        address ntiAddr = registry.nti();
        address burnAddr = registry.burnAddress();

        buybackPool -= amountIn;
        lastBuybackAt = uint64(block.timestamp);

        IWETH(wethAddr).deposit{value: amountIn}();
        IERC20(wethAddr).forceApprove(adapter, amountIn);

        IERC20 ntiToken = IERC20(ntiAddr);
        uint256 ntiBefore = ntiToken.balanceOf(address(this));

        IBuybackAdapter(adapter).swapExactInput(ntiAddr, amountIn, minOut, deadline, routeData);

        IERC20(wethAddr).forceApprove(adapter, 0);

        uint256 received = ntiToken.balanceOf(address(this)) - ntiBefore;
        if (received < minOut) revert SlippageExceeded(received, minOut);

        ntiToken.safeTransfer(burnAddr, received);
        burned = received;

        emit BuybackExecuted(adapter, amountIn, burned);
    }

    /// @notice Redeems Basket management fee shares held by FeeRouter into ETH for distribution.
    function redeemBasketFees(address basket, uint256 shares, uint256 minEthOut)
        external
        onlyRole(KEEPER_ROLE)
        nonReentrant
        returns (uint256 ethOut)
    {
        if (basket == address(0)) revert ZeroAddress();
        if (shares == 0) revert ZeroAmount();
        ethOut = IBasketRedeemable(basket).redeem(shares, minEthOut);
        emit BasketFeeRedeemed(basket, shares, ethOut);
    }
}
