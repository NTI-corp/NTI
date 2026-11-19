// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {Staking} from "../src/Staking.sol";

contract StakingHandler is Test {
    Staking public immutable staking;
    NTITestToken public immutable token;
    address public immutable slasher;
    address public immutable rewardReceiver;

    address[] public actors;
    uint256 public ghostTotalEthReceived;
    uint256 public ghostTotalEthClaimed;

    constructor(Staking staking_, NTITestToken token_, address slasher_, address rewardReceiver_) {
        staking = staking_;
        token = token_;
        slasher = slasher_;
        rewardReceiver = rewardReceiver_;

        actors.push(makeAddr("actor0"));
        actors.push(makeAddr("actor1"));
        actors.push(makeAddr("actor2"));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function stake(uint256 actorSeed, uint96 rawAmount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(actor);
        if (bal == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, bal);

        vm.startPrank(actor);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function requestUnstake(uint256 actorSeed, uint96 rawAmount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 active = staking.stakeOf(actor);
        if (active == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, active);

        vm.prank(actor);
        staking.requestUnstake(amount);
    }

    function warpAndWithdraw(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        (uint256 cdAmt, uint64 unlockAt) = staking.cooldownOf(actor);
        if (cdAmt == 0) return;
        if (block.timestamp < unlockAt) vm.warp(unlockAt);

        vm.prank(actor);
        staking.withdraw();
    }

    function notifyReward(uint64 rawEth) external {
        uint256 amount = bound(uint256(rawEth), 1, 2 ether);
        vm.deal(address(this), amount);
        staking.notifyReward{value: amount}();
        ghostTotalEthReceived += amount;
    }

    function claim(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        uint256 claimed = staking.claim();
        ghostTotalEthClaimed += claimed;
    }

    function slash(uint256 actorSeed, uint96 rawAmount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 amount = bound(uint256(rawAmount), 1, 500_000e18);
        vm.prank(slasher);
        staking.slash(actor, amount, rewardReceiver);
    }
}

contract StakingInvariantTest is StdInvariant, Test {
    NTIRegistry internal registry;
    NTITestToken internal token;
    Staking internal staking;
    StakingHandler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        address pauser = makeAddr("pauser");
        address slasher = makeAddr("slasher");

        vm.startPrank(admin);
        registry = new NTIRegistry(admin, makeAddr("weth"));
        token = new NTITestToken(admin);
        staking = new Staking(address(registry), admin, pauser);
        registry.setStaking(address(staking));
        registry.setNti(address(token));
        staking.grantRole(staking.SLASHER_ROLE(), slasher);

        handler = new StakingHandler(staking, token, slasher, makeAddr("challenger"));
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            token.transfer(handler.actorAt(i), 10_000_000e18);
        }
        vm.stopPrank();

        targetContract(address(handler));
    }

    /// @notice Total ETH claimed never exceeds total ETH notified into Staking.
    function invariant_ClaimedNeverExceedsReceivedEth() public view {
        assertLe(handler.ghostTotalEthClaimed(), handler.ghostTotalEthReceived());
        assertEq(
            address(staking).balance,
            handler.ghostTotalEthReceived() - handler.ghostTotalEthClaimed()
        );
    }

    /// @notice totalLocked == sum(activeStake + cooldown) and backed by token balance.
    function invariant_TotalLockedMatchesUserBalances() public view {
        uint256 sumActive;
        uint256 sumCooldown;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address a = handler.actorAt(i);
            sumActive += staking.stakeOf(a);
            (uint256 cd,) = staking.cooldownOf(a);
            sumCooldown += cd;
            assertEq(staking.getVotes(a), staking.stakeOf(a));
        }
        assertEq(staking.totalActiveStaked(), sumActive);
        assertEq(staking.totalLocked(), sumActive + sumCooldown);
        assertGe(token.balanceOf(address(staking)), staking.totalLocked());
    }
}
