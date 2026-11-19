// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBuybackAdapter} from "./interfaces/IBuybackAdapter.sol";
import {ISwapRouter02Minimal, IUniswapV3FactoryMinimal} from "./interfaces/IUniswapV3Minimal.sol";
import {UniswapV3TwapLib} from "./libraries/UniswapV3TwapLib.sol";

/// @title BuybackAdapterV3
/// @notice Swaps WETH -> $NTI via Uniswap V3 SwapRouter02 with a 30-minute TWAP 3% slippage guard.
contract BuybackAdapterV3 is IBuybackAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant TWAP_WINDOW = 1800; // 30 minutes
    uint16 public constant MAX_SLIPPAGE_BPS = 300; // 3%

    IERC20 public immutable weth;
    ISwapRouter02Minimal public immutable swapRouter02;
    IUniswapV3FactoryMinimal public immutable v3Factory;
    uint24 public immutable defaultPoolFee;

    error ZeroAddress();
    error InvalidAmount();
    error Expired();
    error PoolNotFound();
    error BadBalanceDelta();

    constructor(address weth_, address swapRouter02_, address v3Factory_, uint24 defaultPoolFee_) {
        if (weth_ == address(0) || swapRouter02_ == address(0) || v3Factory_ == address(0)) {
            revert ZeroAddress();
        }
        weth = IERC20(weth_);
        swapRouter02 = ISwapRouter02Minimal(swapRouter02_);
        v3Factory = IUniswapV3FactoryMinimal(v3Factory_);
        defaultPoolFee = defaultPoolFee_;
    }

    function swapExactInput(
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        bytes calldata routeData
    ) external override nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired();
        if (tokenOut == address(0) || tokenOut == address(weth)) revert ZeroAddress();
        if (amountIn == 0) revert InvalidAmount();

        uint24 poolFee = routeData.length == 32 ? abi.decode(routeData, (uint24)) : defaultPoolFee;
        address pool = v3Factory.getPool(address(weth), tokenOut, poolFee);
        if (pool == address(0)) revert PoolNotFound();

        // Enforce 30-minute TWAP 3% slippage floor.
        int24 twapTick = UniswapV3TwapLib.getTwapTick(pool, TWAP_WINDOW);
        uint256 twapQuote = UniswapV3TwapLib.getQuoteAtTick(twapTick, amountIn, address(weth), tokenOut);
        uint256 twapMinOut = (twapQuote * (10_000 - MAX_SLIPPAGE_BPS)) / 10_000;
        uint256 effectiveMinOut = minOut > twapMinOut ? minOut : twapMinOut;

        uint256 wethBefore = weth.balanceOf(address(this));
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));

        weth.safeTransferFrom(msg.sender, address(this), amountIn);
        if (weth.balanceOf(address(this)) - wethBefore != amountIn) revert BadBalanceDelta();

        weth.forceApprove(address(swapRouter02), amountIn);
        swapRouter02.exactInputSingle(
            ISwapRouter02Minimal.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: effectiveMinOut,
                sqrtPriceLimitX96: 0
            })
        );
        weth.forceApprove(address(swapRouter02), 0);

        if (weth.balanceOf(address(this)) != wethBefore) revert BadBalanceDelta();
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < effectiveMinOut) revert BadBalanceDelta();

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
