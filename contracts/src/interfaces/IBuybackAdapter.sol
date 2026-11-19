// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IBuybackAdapter
/// @notice Uniform swap interface used by FeeRouter to swap WETH into $NTI via Uniswap V3 or V4.
interface IBuybackAdapter {
    function swapExactInput(
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        bytes calldata routeData
    ) external returns (uint256 amountOut);
}
