// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";

import {Grants} from "../src/Grants.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {Staking} from "../src/Staking.sol";

contract C6GrantsTest is Test {
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal pauser = makeAddr("pauser");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal smallUser = makeAddr("smallUser");

    NTIRegistry internal registry;
    NTITestToken internal nti;
    Staking internal staking;
    Grants internal grants;

    function setUp() public {
        vm.roll(10);
        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, makeAddr("weth"))))));
        nti = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), admin, keeper, pauser)))));

        registry.setStaking(address(staking));
        registry.setNti(address(nti));

        nti.transfer(alice, 1_000_000e18);
        nti.transfer(bob, 500_000e18);
        nti.transfer(smallUser, 10_000e18);
        vm.stopPrank();

        vm.startPrank(alice);
        nti.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        nti.approve(address(staking), 500_000e18);
        staking.stake(500_000e18);
        vm.stopPrank();

        vm.startPrank(smallUser);
        nti.approve(address(staking), 10_000e18);
        staking.stake(10_000e18);
        vm.stopPrank();

        vm.roll(20);
    }

    function test_FullRoundTop5Cap40PercentAndRolloverAccounting() public {
        vm.deal(address(this), 15 ether);
        (bool ok,) = payable(address(grants)).call{value: 10 ether}("");
        assertTrue(ok);

        vm.prank(keeper);
        uint256 r1 = grants.startRound(7 days);
        assertEq(r1, 1);

        // User with < 50,000 NTI cannot submit proposal
        vm.prank(smallUser);
        vm.expectRevert();
        grants.submitProposal(keccak256("p0"), smallUser);

        // Submit 6 proposals (only top 5 should get funded)
        address[6] memory recs = [
            makeAddr("rec1"),
            makeAddr("rec2"),
            makeAddr("rec3"),
            makeAddr("rec4"),
            makeAddr("rec5"),
            makeAddr("rec6")
        ];
        vm.startPrank(alice);
        for (uint256 i = 0; i < 6; i++) {
            grants.submitProposal(keccak256(abi.encode("prop", i)), recs[i]);
        }
        vm.stopPrank();

        // Duplicate proposal ID rejected
        uint256[] memory dupIds = new uint256[](2);
        dupIds[0] = 1;
        dupIds[1] = 1;
        uint256[] memory dupW = new uint256[](2);
        dupW[0] = 100e18;
        dupW[1] = 100e18;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Grants.DuplicateProposalId.selector, 1));
        grants.vote(r1, dupIds, dupW);

        // Alice casts 1M votes across 6 proposals
        uint256[] memory ids = new uint256[](6);
        uint256[] memory weights = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) ids[i] = i + 1;
        weights[0] = 800_000e18;
        weights[1] = 100_000e18;
        weights[2] = 50_000e18;
        weights[3] = 30_000e18;
        weights[4] = 15_000e18;
        weights[5] = 5_000e18;

        vm.prank(alice);
        grants.vote(r1, ids, weights);

        // Double voting rejected
        vm.prank(alice);
        vm.expectRevert(Grants.AlreadyVoted.selector);
        grants.vote(r1, ids, weights);

        vm.warp(vm.getBlockTimestamp() + 7 days);
        grants.finalizeRound(r1);

        (,,,, uint256 alloc1,) = grants.proposals(r1, 1);
        (,,,, uint256 alloc2,) = grants.proposals(r1, 2);
        (,,,, uint256 alloc3,) = grants.proposals(r1, 3);
        (,,,, uint256 alloc4,) = grants.proposals(r1, 4);
        (,,,, uint256 alloc5,) = grants.proposals(r1, 5);
        (,,,, uint256 alloc6,) = grants.proposals(r1, 6);

        assertEq(alloc1, 4 ether); // capped at 40% of 10 ETH
        assertEq(alloc6, 0); // 6th place excluded
        uint256 totalAlloc = alloc1 + alloc2 + alloc3 + alloc4 + alloc5;
        assertEq(grants.totalReservedUnclaimed(), totalAlloc);
        assertLt(totalAlloc, 10 ether);

        // Start Round 2 BEFORE anyone claims Round 1 -> never double-counts reserved ETH
        (ok,) = payable(address(grants)).call{value: 5 ether}("");
        assertTrue(ok);
        vm.roll(30);
        vm.prank(keeper);
        uint256 r2 = grants.startRound(7 days);
        (uint256 r2Budget,,,,,,) = grants.rounds(r2);
        assertEq(r2Budget, (10 ether - totalAlloc) + 5 ether);

        // Pause MUST NOT block claim
        vm.prank(pauser);
        grants.pause();

        uint256 rec1Before = recs[0].balance;
        vm.prank(recs[0]);
        uint256 claimed = grants.claim(r1, 1);
        assertEq(claimed, 4 ether);
        assertEq(recs[0].balance - rec1Before, 4 ether);
        assertEq(grants.totalReservedUnclaimed(), totalAlloc - 4 ether);
    }

    function test_QuorumNotMetRollsOver100Percent() public {
        vm.deal(address(this), 4 ether);
        (bool ok,) = payable(address(grants)).call{value: 4 ether}("");
        assertTrue(ok);

        vm.prank(keeper);
        uint256 r1 = grants.startRound(3 days);

        vm.prank(alice);
        grants.submitProposal(keccak256("p"), alice);

        // smallUser has 10k / 1.51M = 0.66% < 1% quorum
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory w = new uint256[](1);
        w[0] = 10_000e18;
        vm.prank(smallUser);
        grants.vote(r1, ids, w);

        vm.warp(vm.getBlockTimestamp() + 3 days);
        grants.finalizeRound(r1);

        assertEq(grants.totalReservedUnclaimed(), 0);
        (,,,, uint256 alloc1,) = grants.proposals(r1, 1);
        assertEq(alloc1, 0);

        // Entire 4 ETH rolls over to round 2
        vm.roll(30);
        vm.prank(keeper);
        uint256 r2 = grants.startRound(3 days);
        (uint256 r2Budget,,,,,,) = grants.rounds(r2);
        assertEq(r2Budget, 4 ether);
    }
}
