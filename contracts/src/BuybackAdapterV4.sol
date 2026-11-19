// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBuybackAdapter} from "./interfaces/IBuybackAdapter.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {UniswapV3TwapLib} from "./libraries/UniswapV3TwapLib.sol";

interface IUniversalRouter211 {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IStateViewMinimal {
    function getSlot0(bytes32 poolId)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}

/// @title BuybackAdapterV4
/// @notice Swaps WETH (or unwrapped native ETH for native Pons V2 pools) -> $NTI via
///         Robinhood Chain Universal Router 2.1.1 + Permit2 + PonsV2MemeHook,
///         enforcing a StateView.getSlot0 3% spot slippage guard.
contract BuybackAdapterV4 is IBuybackAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_SLIPPAGE_BPS = 300; // 3%

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct PathKey {
        address intermediateCurrency;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
        bytes hookData;
    }

    struct ExactInputParams {
        address currencyIn;
        PathKey[] path;
        uint256[] minHopPriceX36;
        uint128 amountIn;
        uint128 amountOutMinimum;
    }

    IWETH public immutable weth;
    address public immutable universalRouter;
    address public immutable permit2;
    IStateViewMinimal public immutable stateView;
    address public immutable ponsHook;

    error InvalidRoute();
    error InvalidAmount();
    error Expired();
    error BadBalanceDelta();
    error PoolNotInitialized();

    constructor(
        address weth_,
        address universalRouter_,
        address permit2_,
        address stateView_,
        address ponsHook_
    ) {
        if (
            weth_ == address(0) || universalRouter_ == address(0) || permit2_ == address(0)
                || stateView_ == address(0) || ponsHook_ == address(0)
        ) revert InvalidRoute();
        weth = IWETH(weth_);
        universalRouter = universalRouter_;
        permit2 = permit2_;
        stateView = IStateViewMinimal(stateView_);
        ponsHook = ponsHook_;
    }

    receive() external payable {}

    function validateRoute(address tokenOut, bytes calldata routeData) external view returns (bool) {
        _buildPath(tokenOut, routeData);
        return true;
    }

    function swapExactInput(
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        bytes calldata routeData
    ) external override nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline || deadline > type(uint48).max) revert Expired();
        if (amountIn == 0 || amountIn > type(uint128).max || minOut > type(uint128).max) {
            revert InvalidAmount();
        }

        (address startCurrency, PathKey[] memory path, PoolKey[] memory keys) =
            _buildPath(tokenOut, routeData);

        // Compute StateView spot quote across all hops and apply 3% slippage floor.
        uint256 spotOut = _spotQuote(startCurrency, keys, amountIn);
        uint256 spotMinOut = (spotOut * (10_000 - MAX_SLIPPAGE_BPS)) / 10_000;
        uint256 effectiveMinOut = minOut > spotMinOut ? minOut : spotMinOut;
        if (effectiveMinOut == 0 || effectiveMinOut > type(uint128).max) revert InvalidAmount();

        uint256 wethBefore = weth.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(address(weth)).safeTransferFrom(msg.sender, address(this), amountIn);
        if (weth.balanceOf(address(this)) - wethBefore != amountIn) revert BadBalanceDelta();

        if (startCurrency == address(0)) {
            // Native ETH entry (standard Pons V2 ETH/$NTI pool).
            weth.withdraw(amountIn);
            _executeRouter(startCurrency, tokenOut, path, amountIn, effectiveMinOut, deadline, amountIn);
        } else {
            // WETH ERC-20 entry via Permit2.
            IERC20(address(weth)).forceApprove(permit2, amountIn);
            IPermit2AllowanceTransfer(permit2).approve(
                address(weth), universalRouter, uint160(amountIn), uint48(deadline)
            );
            _executeRouter(startCurrency, tokenOut, path, amountIn, effectiveMinOut, deadline, 0);
            IPermit2AllowanceTransfer(permit2).approve(address(weth), universalRouter, 0, 0);
            IERC20(address(weth)).forceApprove(permit2, 0);
        }

        if (weth.balanceOf(address(this)) != wethBefore) revert BadBalanceDelta();
        if (address(this).balance != ethBefore) revert BadBalanceDelta();

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < effectiveMinOut) revert BadBalanceDelta();

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    function _buildPath(address tokenOut, bytes calldata routeData)
        internal
        view
        returns (address startCurrency, PathKey[] memory path, PoolKey[] memory keys)
    {
        keys = abi.decode(routeData, (PoolKey[]));
        if (keys.length == 0 || keys.length > 2 || tokenOut == address(0) || tokenOut == address(weth)) {
            revert InvalidRoute();
        }

        // First hop must begin with either native ETH (address(0)) or WETH.
        if (keys[0].currency0 == address(0)) {
            startCurrency = address(0);
        } else if (keys[0].currency0 == address(weth) || keys[0].currency1 == address(weth)) {
            startCurrency = address(weth);
        } else {
            revert InvalidRoute();
        }

        path = new PathKey[](keys.length);
        address current = startCurrency;

        for (uint256 i = 0; i < keys.length; i++) {
            PoolKey memory key = keys[i];
            if (key.currency0 >= key.currency1 || key.tickSpacing <= 0) revert InvalidRoute();
            address nextCurrency;
            if (current == key.currency0) {
                nextCurrency = key.currency1;
            } else if (current == key.currency1) {
                nextCurrency = key.currency0;
            } else {
                revert InvalidRoute();
            }
            if (keys.length == 2 && i == 0 && nextCurrency != address(0)) revert InvalidRoute();
            path[i] = PathKey({
                intermediateCurrency: nextCurrency,
                fee: key.fee,
                tickSpacing: key.tickSpacing,
                hooks: key.hooks,
                hookData: hex""
            });
            current = nextCurrency;
        }

        if (current != tokenOut) revert InvalidRoute();
        if (path[path.length - 1].hooks != ponsHook) revert InvalidRoute();
    }

    function _spotQuote(address startCurrency, PoolKey[] memory keys, uint256 amountIn)
        internal
        view
        returns (uint256 runningAmount)
    {
        runningAmount = amountIn;
        address current = startCurrency;
        for (uint256 i = 0; i < keys.length; i++) {
            PoolKey memory key = keys[i];
            address nextCurrency = current == key.currency0 ? key.currency1 : key.currency0;
            bytes32 poolId = keccak256(abi.encode(key));
            (uint160 sqrtPriceX96,,,) = stateView.getSlot0(poolId);
            if (sqrtPriceX96 == 0) revert PoolNotInitialized();
            runningAmount =
                UniswapV3TwapLib.getQuoteAtSqrtPriceX96(sqrtPriceX96, runningAmount, current, nextCurrency);
            current = nextCurrency;
        }
    }

    function _executeRouter(
        address startCurrency,
        address tokenOut,
        PathKey[] memory path,
        uint256 amountIn,
        uint256 effectiveMinOut,
        uint256 deadline,
        uint256 ethValue
    ) internal {
        uint256[] memory floors = new uint256[](path.length);
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputParams({
                currencyIn: startCurrency,
                path: path,
                minHopPriceX36: floors,
                amountIn: uint128(amountIn),
                amountOutMinimum: uint128(effectiveMinOut)
            })
        );
        params[1] = abi.encode(startCurrency, amountIn); // SETTLE_ALL
        params[2] = abi.encode(tokenOut, effectiveMinOut); // TAKE_ALL

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(hex"070c0f", params); // SWAP_EXACT_IN + SETTLE_ALL + TAKE_ALL
        IUniversalRouter211(universalRouter).execute{value: ethValue}(hex"10", inputs, deadline);
    }
}
