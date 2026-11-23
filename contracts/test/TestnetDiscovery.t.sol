// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestnetLaunchFactory, TestnetLaunchPool} from "../script/mocks/TestnetDiscovery.sol";

contract TestnetDiscoveryTest is Test {
    function testLaunchCreatesFundedPoolAndTracksActualTrades() public {
        vm.chainId(46630);
        vm.warp(10 days);
        vm.deal(address(this), 3 ether);
        TestnetLaunchFactory factory = new TestnetLaunchFactory();
        (address token, TestnetLaunchPool pool) = factory.launch{value: 1 ether}("Agents", "tTAG", 2);
        assertEq(factory.poolOf(token), address(pool));
        assertEq(address(pool).balance, 1 ether);
        assertEq(pool.token(), token);

        uint256 out = pool.buy{value: 0.1 ether}(1);
        assertGt(out, 0);
        assertEq(IERC20(token).balanceOf(address(this)), out);
        assertEq(address(pool).balance, 1.1 ether);

        vm.warp(11 days);
        IERC20(token).approve(address(pool), out);
        uint256 ethOut = pool.sell(out, 1);
        assertGt(ethOut, 0);
        assertEq(IERC20(token).balanceOf(address(this)), 0);
        assertGe(address(pool).balance, 1 ether);

        (uint256 count, uint64 last) = pool.tradeActivitySince(uint64(10 days + 1));
        assertEq(count, 1);
        assertEq(last, 11 days);
        (count, last) = pool.tradeActivitySince(uint64(11 days + 1));
        assertEq(count, 0);
        assertEq(last, 0);
    }

    function testFactoryRefusesMainnet() public {
        vm.chainId(4663);
        vm.expectRevert(TestnetLaunchFactory.WrongChain.selector);
        new TestnetLaunchFactory();
    }

    receive() external payable {}
}
