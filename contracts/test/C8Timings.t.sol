// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {Dispute} from "../src/Dispute.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @notice Adjustable (and lockable) timing parameters: production defaults, bounds, admin-only, freeze.
contract C8TimingsTest is Test {
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal alice = makeAddr("alice");
    address internal stranger = makeAddr("stranger");

    NTIRegistry internal registry;
    NTITestToken internal nti;
    Staking internal staking;
    OracleCommit internal oracle;
    Dispute internal dispute;
    NarrativeMarket internal market;

    function setUp() public {
        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, makeAddr("weth"))))));
        nti = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        ConfigRegistry config = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin)))));
        oracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(config), 0, admin, pauser)))));
        dispute = Dispute(payable(deployProxy(address(new Dispute()), abi.encodeCall(Dispute.initialize, (address(registry), address(oracle), address(staking), admin, pauser)))));
        market = NarrativeMarket(payable(deployProxy(address(new NarrativeMarket()), abi.encodeCall(NarrativeMarket.initialize, (address(oracle), address(staking), makeAddr("feeRouter"), admin, pauser)))));
        registry.setStaking(address(staking));
        registry.setNti(address(nti));
        require(nti.transfer(alice, 1_000e18), "fund");
        vm.stopPrank();
    }

    function test_defaultsAreTheProductionSchedule() public view {
        assertEq(oracle.COMMIT_DELAY(), 60 minutes);
        assertEq(oracle.DISPUTE_WINDOW(), 2 hours);
        assertEq(oracle.INCOMPLETE_DELAY(), 4 hours);
        assertEq(dispute.RESOLUTION_WINDOW(), 6 hours);
        assertEq(staking.COOLDOWN_DURATION(), 7 days);
        assertEq(market.HORIZON_SHORT(), 6);
        assertEq(market.HORIZON_LONG(), 42);
        assertEq(market.BET_CUTOFF_EPOCHS(), 2);
        assertEq(market.SETTLE_TIMEOUT(), 48 hours);
        assertFalse(oracle.timingsLocked() || dispute.timingsLocked() || staking.timingsLocked() || market.timingsLocked());
    }

    function test_onlyAdminCanChangeOrLock() public {
        bytes memory unauthorized = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, bytes32(0)
        );
        vm.startPrank(stranger);
        vm.expectRevert(unauthorized);
        oracle.setTimings(60, 120, 3600);
        vm.expectRevert(unauthorized);
        oracle.lockTimings();
        vm.expectRevert(unauthorized);
        dispute.setResolutionWindow(60);
        vm.expectRevert(unauthorized);
        staking.setCooldownDuration(60);
        vm.expectRevert(unauthorized);
        market.setTimings(2, 6, 0, 3600);
        vm.stopPrank();
    }

    function test_oracleTimingsBoundsAndLock() public {
        vm.startPrank(admin);
        oracle.setTimings(300, 120, 3600);
        assertEq(oracle.COMMIT_DELAY(), 300);
        assertEq(oracle.DISPUTE_WINDOW(), 120);
        assertEq(oracle.INCOMPLETE_DELAY(), 3600);

        vm.expectRevert(OracleCommit.InvalidTimings.selector);
        oracle.setTimings(0, 120, 3600);
        vm.expectRevert(OracleCommit.InvalidTimings.selector);
        oracle.setTimings(300, 8 days, 9 days);
        vm.expectRevert(OracleCommit.InvalidTimings.selector);
        oracle.setTimings(300, 120, 300); // incomplete must come after the commit window opens

        oracle.lockTimings();
        vm.expectRevert(OracleCommit.TimingsAreLocked.selector);
        oracle.setTimings(60, 60, 600);
        vm.stopPrank();
        assertEq(oracle.DISPUTE_WINDOW(), 120);
    }

    function test_disputeWindowBoundsAndLock() public {
        vm.startPrank(admin);
        dispute.setResolutionWindow(30 minutes);
        assertEq(dispute.RESOLUTION_WINDOW(), 30 minutes);
        vm.expectRevert(Dispute.InvalidTimings.selector);
        dispute.setResolutionWindow(0);
        vm.expectRevert(Dispute.InvalidTimings.selector);
        dispute.setResolutionWindow(8 days);
        dispute.lockTimings();
        vm.expectRevert(Dispute.TimingsAreLocked.selector);
        dispute.setResolutionWindow(1 hours);
        vm.stopPrank();
    }

    function test_marketScheduleBoundsAndLock() public {
        vm.startPrank(admin);
        market.setTimings(2, 6, 0, 1 hours);
        assertEq(market.HORIZON_SHORT(), 2);
        assertEq(market.HORIZON_LONG(), 6);
        assertEq(market.BET_CUTOFF_EPOCHS(), 0);
        assertEq(market.SETTLE_TIMEOUT(), 1 hours);

        vm.expectRevert(NarrativeMarket.InvalidTimings.selector);
        market.setTimings(0, 6, 0, 1 hours);
        vm.expectRevert(NarrativeMarket.InvalidTimings.selector);
        market.setTimings(3, 3, 0, 1 hours); // long horizon must exceed the short one
        vm.expectRevert(NarrativeMarket.InvalidTimings.selector);
        market.setTimings(3, 6, 3, 1 hours); // cutoff must be inside the horizon
        vm.expectRevert(NarrativeMarket.InvalidTimings.selector);
        market.setTimings(3, 6, 1, 15 days);

        market.lockTimings();
        vm.expectRevert(NarrativeMarket.TimingsAreLocked.selector);
        market.setTimings(3, 6, 1, 1 hours);
        vm.stopPrank();
    }

    function test_shortenedCooldownUnlocksWithdrawEarlier() public {
        vm.prank(admin);
        staking.setCooldownDuration(5 minutes);

        vm.startPrank(alice);
        nti.approve(address(staking), 100e18);
        staking.stake(100e18);
        staking.requestUnstake(100e18);

        vm.expectRevert(abi.encodeWithSelector(Staking.CooldownNotElapsed.selector, uint64(block.timestamp + 5 minutes)));
        staking.withdraw();

        vm.warp(block.timestamp + 5 minutes);
        staking.withdraw();
        vm.stopPrank();
        assertEq(nti.balanceOf(alice), 1_000e18);
    }

    function test_cooldownBoundsAndLock() public {
        vm.startPrank(admin);
        vm.expectRevert(Staking.InvalidTimings.selector);
        staking.setCooldownDuration(0);
        vm.expectRevert(Staking.InvalidTimings.selector);
        staking.setCooldownDuration(31 days);
        staking.setCooldownDuration(1 days);
        staking.lockTimings();
        vm.expectRevert(Staking.TimingsAreLocked.selector);
        staking.setCooldownDuration(2 days);
        vm.stopPrank();
        assertEq(staking.COOLDOWN_DURATION(), 1 days);
    }
}
