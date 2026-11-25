// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {Staking} from "../src/Staking.sol";

/// @dev Fee-on-transfer ERC20 mock simulating Pons creator tax (e.g. 5% transfer fee).
contract TaxTokenMock is ERC20 {
    uint16 public immutable taxBps;
    address public immutable taxSink;

    constructor(uint16 taxBps_, address taxSink_) ERC20("Taxed NTI", "tTAX") {
        taxBps = taxBps_;
        taxSink = taxSink_;
        _mint(msg.sender, 1_000_000_000e18);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && taxBps > 0) {
            uint256 fee = (value * taxBps) / 10_000;
            super._update(from, taxSink, fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract C1CoreTest is Test {
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal slasher = makeAddr("slasher");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal challenger = makeAddr("challenger");
    address internal weth = makeAddr("weth");

    NTIRegistry internal registry;
    NTITestToken internal token;
    Staking internal staking;

    function setUp() public {
        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, weth)))));
        token = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        registry.setStaking(address(staking));
        registry.setNti(address(token));
        staking.grantRole(staking.SLASHER_ROLE(), slasher);

        token.transfer(alice, 10_000_000e18);
        token.transfer(bob, 10_000_000e18);
        vm.stopPrank();
    }

    // --- NTITestToken ---

    function test_TestTokenInitialSupplyAndFaucetCooldown() public {
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1_000_000_000e18);

        address fresh = makeAddr("fresh");
        vm.prank(fresh);
        token.faucet();
        assertEq(token.balanceOf(fresh), 10_000e18);

        // Reverts inside 24h cooldown
        vm.prank(fresh);
        vm.expectRevert();
        token.faucet();

        // Succeeds after 24h
        vm.warp(block.timestamp + 24 hours);
        vm.prank(fresh);
        token.faucet();
        assertEq(token.balanceOf(fresh), 20_000e18);
    }

    // --- NTIRegistry ---

    function test_RegistryBlocksSetNtiWhileLockedAndAfterFreeze() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100_000e18);
        staking.stake(100_000e18);
        vm.stopPrank();

        // Cannot swap token while active stake exists
        vm.prank(admin);
        vm.expectRevert(NTIRegistry.StakeNotEmpty.selector);
        registry.setNti(makeAddr("liveNti"));

        // Still cannot swap token while stake is in cooldown!
        vm.prank(alice);
        staking.requestUnstake(100_000e18);
        assertEq(staking.totalActiveStaked(), 0);
        assertEq(staking.totalLocked(), 100_000e18);

        vm.prank(admin);
        vm.expectRevert(NTIRegistry.StakeNotEmpty.selector);
        registry.setNti(makeAddr("liveNti"));

        // After cooldown + withdraw, totalLocked == 0 -> swap succeeds
        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        staking.withdraw();
        assertEq(staking.totalLocked(), 0);

        address liveNti = makeAddr("liveNti");
        vm.startPrank(admin);
        registry.setNti(liveNti);
        assertEq(registry.nti(), liveNti);
        registry.freeze();
        assertTrue(registry.frozen());

        vm.expectRevert(NTIRegistry.RegistryIsFrozen.selector);
        registry.setNti(makeAddr("another"));
        vm.stopPrank();
    }

    function test_RegistryBuybackReadyFlag() public {
        assertFalse(registry.buybackReady());
        address adapter = makeAddr("adapter");
        vm.prank(admin);
        registry.setBuybackAdapter(adapter);
        assertTrue(registry.buybackReady());
    }

    // --- Staking: Rewards, Cooldown, Tiers, Votes ---

    function test_StakingTiersAndRadarAccess() public {
        assertEq(staking.discountBps(alice), 0);
        assertFalse(staking.hasRadarAccess(alice));

        vm.startPrank(alice);
        token.approve(address(staking), 5_000_000e18);

        staking.stake(100_000e18);
        assertTrue(staking.hasRadarAccess(alice));
        assertEq(staking.discountBps(alice), 1000);

        staking.stake(900_000e18);
        assertEq(staking.discountBps(alice), 2500);

        staking.stake(4_000_000e18);
        assertEq(staking.discountBps(alice), 5000);
        vm.stopPrank();
    }

    function test_StakingRewardsProRataAndZeroStakeSafe() public {
        // Notify ETH while totalActiveStaked == 0 must NOT revert
        vm.deal(admin, 10 ether);
        vm.prank(admin);
        staking.notifyReward{value: 1 ether}();
        assertEq(staking.undistributedRewards(), 1 ether);

        // Alice stakes 100k, Bob stakes 300k (1:3 ratio)
        vm.startPrank(alice);
        token.approve(address(staking), 100_000e18);
        staking.stake(100_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(staking), 300_000e18);
        staking.stake(300_000e18);
        vm.stopPrank();

        // Next notify distributes 3 ether + 1 ether buffered = 4 ether total -> Alice 1 ETH, Bob 3 ETH
        vm.prank(admin);
        staking.notifyReward{value: 3 ether}();

        assertEq(staking.pendingReward(alice), 1 ether);
        assertEq(staking.pendingReward(bob), 3 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        uint256 claimed = staking.claim();
        assertEq(claimed, 1 ether);
        assertEq(alice.balance - aliceBefore, 1 ether);
        assertEq(staking.pendingReward(alice), 0);
    }

    function test_StakingPauseBlocksStakeOnlyNotExitOrClaim() public {
        vm.startPrank(alice);
        token.approve(address(staking), 200_000e18);
        staking.stake(100_000e18);
        vm.stopPrank();

        vm.deal(admin, 1 ether);
        vm.prank(admin);
        staking.notifyReward{value: 1 ether}();

        vm.prank(pauser);
        staking.pause();

        // New stake is blocked while paused
        vm.prank(alice);
        vm.expectRevert();
        staking.stake(100_000e18);

        // Claim, requestUnstake, and withdraw MUST still work when paused
        vm.prank(alice);
        uint256 claimed = staking.claim();
        assertEq(claimed, 1 ether);

        vm.prank(alice);
        staking.requestUnstake(100_000e18);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        staking.withdraw();
        assertEq(staking.totalLocked(), 0);
    }

    function test_StakingVotesCheckpointsAndCooldownRemovesVotes() public {
        vm.roll(10);
        vm.startPrank(alice);
        token.approve(address(staking), 500_000e18);
        staking.stake(500_000e18);
        vm.stopPrank();

        vm.roll(20);
        assertEq(staking.getPastVotes(alice, 10), 500_000e18);
        assertEq(staking.getPastTotalSupply(10), 500_000e18);

        // Moving to cooldown removes votes immediately
        vm.prank(alice);
        staking.requestUnstake(200_000e18);
        vm.roll(25);
        assertEq(staking.getPastVotes(alice, 20), 300_000e18);
        assertEq(staking.getPastTotalSupply(20), 300_000e18);
        assertEq(staking.getPastVotes(alice, 10), 500_000e18);
    }

    function test_SlashCutsActiveThenCooldownAndClampsBootstrapZero() public {
        // Bootstrap validator with 0 stake -> slash must NOT revert, returns 0
        vm.prank(slasher);
        uint256 zeroSlashed = staking.slash(bob, 100_000e18, challenger);
        assertEq(zeroSlashed, 0);

        // Alice stakes 500k, then tries to escape slashing by calling requestUnstake(400k)
        vm.startPrank(alice);
        token.approve(address(staking), 500_000e18);
        staking.stake(500_000e18);
        staking.requestUnstake(400_000e18);
        vm.stopPrank();

        // Slash 300k: must take 100k active + 200k from cooldown!
        vm.prank(slasher);
        uint256 slashed = staking.slash(alice, 300_000e18, challenger);
        assertEq(slashed, 300_000e18);
        assertEq(staking.stakeOf(alice), 0);
        (uint256 cdAmt,) = staking.cooldownOf(alice);
        assertEq(cdAmt, 200_000e18);
        assertEq(staking.totalLocked(), 200_000e18);

        // 50% to challenger, 50% to burnAddress
        assertEq(token.balanceOf(challenger), 150_000e18);
        assertEq(token.balanceOf(registry.burnAddress()), 150_000e18);
    }

    function test_FeeOnTransferTokenHandledAccurately() public {
        vm.startPrank(admin);
        NTIRegistry taxReg = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, weth)))));
        TaxTokenMock taxToken = new TaxTokenMock(500, makeAddr("creator")); // 5% tax
        Staking taxStaking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(taxReg), admin, pauser)))));
        taxReg.setStaking(address(taxStaking));
        taxReg.setNti(address(taxToken));
        taxToken.transfer(alice, 1_000_000e18);
        vm.stopPrank();

        // Alice tries to stake 200,000; 5% transfer tax means Staking receives 190,000
        vm.startPrank(alice);
        taxToken.approve(address(taxStaking), 200_000e18);
        taxStaking.stake(200_000e18);
        vm.stopPrank();

        assertEq(taxStaking.stakeOf(alice), 190_000e18);
        assertEq(taxStaking.totalLocked(), 190_000e18);
        assertEq(taxToken.balanceOf(address(taxStaking)), 190_000e18);
    }

    function testFuzz_StakeCooldownWithdrawPreservesSolvency(uint96 amount) public {
        uint256 amt = bound(uint256(amount), 1, 5_000_000e18);
        vm.startPrank(alice);
        token.approve(address(staking), amt);
        staking.stake(amt);
        assertEq(staking.stakeOf(alice), amt);
        assertEq(staking.totalLocked(), amt);

        staking.requestUnstake(amt);
        assertEq(staking.stakeOf(alice), 0);
        assertEq(staking.totalLocked(), amt);

        vm.warp(block.timestamp + 7 days);
        staking.withdraw();
        assertEq(staking.totalLocked(), 0);
        vm.stopPrank();
    }
}
