// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ISwapRouter02Minimal} from "../../src/interfaces/IUniswapV3Minimal.sol";

/// @notice Testnet-only mock ERC-20 used as a basket constituent (1B minted to deployer).
contract TestnetMockToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1_000_000_000e18);
    }
}

/// @notice Testnet-only Uniswap V3 pool stand-in exposing liquidity, slot0 and observe() for TWAP checks.
contract TestnetV3Pool {
    address public token0;
    address public token1;
    uint24 public fee;
    uint128 public liquidity;
    int24 public currentTick;
    uint16 public obsCardinality;

    constructor(address t0, address t1, uint24 fee_, uint128 liq_, int24 tick_, uint16 card_) {
        token0 = t0;
        token1 = t1;
        fee = fee_;
        liquidity = liq_;
        currentTick = tick_;
        obsCardinality = card_;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (79228162514264337593543950336, currentTick, 0, obsCardinality, obsCardinality, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secPerLiq)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secPerLiq = new uint160[](secondsAgos.length);
        int56 base = 1_000_000_000;
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = base - int56(currentTick) * int56(uint56(secondsAgos[i]));
        }
    }
}

contract TestnetV3Factory {
    mapping(bytes32 => address) public pools;

    function setPool(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encodePacked(a, b, fee))] = pool;
        pools[keccak256(abi.encodePacked(b, a, fee))] = pool;
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encodePacked(a, b, fee))];
    }
}

/// @notice Testnet-only 1:1 SwapRouter02 stand-in paying from its own token inventory.
contract TestnetSwapRouter02 {
    function exactInputSingle(ISwapRouter02Minimal.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn;
        require(amountOut >= p.amountOutMinimum, "router slippage");
        IERC20(p.tokenOut).transfer(p.recipient, amountOut);
    }
}
