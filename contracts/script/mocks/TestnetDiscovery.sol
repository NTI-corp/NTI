// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {TestnetMockToken} from "./TestnetMocks.sol";

/// @notice Testnet-only constant-product pool with actual native ETH and mock-token reserves.
contract TestnetLaunchPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable token;
    uint64[] private _tradeTimestamps;

    error WrongChain();
    error InvalidTrade();
    error PaymentFailed();

    event Swap(address indexed trader, bool buying, uint256 amountIn, uint256 amountOut);

    constructor(address token_) payable {
        if (block.chainid != 46630) revert WrongChain();
        token = token_;
    }

    function buy(uint256 minTokenOut) external payable nonReentrant returns (uint256 out) {
        out = _quote(msg.value, address(this).balance - msg.value, IERC20(token).balanceOf(address(this)));
        if (out < minTokenOut || out == 0) revert InvalidTrade();
        IERC20(token).safeTransfer(msg.sender, out);
        _recordSwap(true, msg.value, out);
    }

    function sell(uint256 amountIn, uint256 minEthOut) external nonReentrant returns (uint256 out) {
        out = _quote(amountIn, IERC20(token).balanceOf(address(this)), address(this).balance);
        if (out < minEthOut || out == 0) revert InvalidTrade();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);
        (bool paid,) = msg.sender.call{value: out}("");
        if (!paid) revert PaymentFailed();
        _recordSwap(false, amountIn, out);
    }

    /// @notice Counts executed swaps at or after the cutoff using chronological on-chain history.
    function tradeActivitySince(uint64 cutoff) external view returns (uint256 count, uint64 last) {
        uint256 length = _tradeTimestamps.length;
        uint256 low;
        uint256 high = length;
        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (_tradeTimestamps[mid] < cutoff) low = mid + 1;
            else high = mid;
        }
        if (low == length) return (0, 0);
        return (length - low, _tradeTimestamps[length - 1]);
    }

    function _quote(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        uint256 afterFee = amountIn * 997;
        return Math.mulDiv(afterFee, reserveOut, reserveIn * 1000 + afterFee);
    }

    function _recordSwap(bool buying, uint256 amountIn, uint256 amountOut) private {
        _tradeTimestamps.push(SafeCast.toUint64(block.timestamp));
        emit Swap(msg.sender, buying, amountIn, amountOut);
    }
}

/// @notice An operator-owned Robinhood testnet launch source for exercising Radar and Heatmap.
contract TestnetLaunchFactory is Ownable {
    using SafeERC20 for IERC20;

    uint256 public immutable deploymentBlock;
    mapping(address => address) public poolOf;

    error WrongChain();
    error InvalidLaunch();

    event TestnetTokenLaunched(address indexed token, address indexed pool, uint8 narrativeId);

    constructor() Ownable(msg.sender) {
        if (block.chainid != 46630) revert WrongChain();
        deploymentBlock = block.number;
    }

    function launch(string calldata name, string calldata symbol, uint8 narrativeId)
        external
        payable
        onlyOwner
        returns (address token, TestnetLaunchPool pool)
    {
        if (
            msg.value == 0 || bytes(name).length == 0 || bytes(name).length > 64 || bytes(symbol).length == 0
                || bytes(symbol).length > 12 || narrativeId == 0 || narrativeId > 32
        ) revert InvalidLaunch();
        token = address(new TestnetMockToken(string.concat("Testnet Narrative ", name), symbol));
        pool = new TestnetLaunchPool{value: msg.value}(token);
        IERC20(token).safeTransfer(address(pool), IERC20(token).totalSupply());
        poolOf[token] = address(pool);
        emit TestnetTokenLaunched(token, address(pool), narrativeId);
    }
}
