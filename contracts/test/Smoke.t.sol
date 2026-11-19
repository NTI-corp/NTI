// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INTIRegistry} from "../src/interfaces/INTIRegistry.sol";

contract SmokeTest is Test {
    function test_ToolchainAndInterfaceCompile() public pure {
        assertTrue(INTIRegistry.buybackReady.selector != bytes4(0));
        assertTrue(IERC20.balanceOf.selector != bytes4(0));
    }
}
