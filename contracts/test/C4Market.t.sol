// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Grants} from "../src/Grants.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";
import {IOracleCommit} from "../src/interfaces/IOracleCommit.sol";

contract C4MarketTest is Test {
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal operator = makeAddr("operator");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal weth = makeAddr("weth");

    uint256 internal val1Pk = 0x1111;
    uint256 internal val2Pk = 0x2222;
    uint256 internal val3Pk = 0x3333;

    NTIRegistry internal registry;
    NTITestToken internal nti;
    Staking internal staking;
    ConfigRegistry internal configRegistry;
    OracleCommit internal oracle;
    FeeRouter internal feeRouter;
    NarrativeMarket internal market;

    bytes32 internal constant CFG = keccak256("cfg-v1");

    function setUp() public {
        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, weth)))));
        nti = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        configRegistry = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin)))));
        oracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(configRegistry), 0, admin, pauser)))));
        InsuranceFund ins = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (admin)))));
        Grants grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), admin, keeper, pauser)))));
        feeRouter = FeeRouter(payable(deployProxy(address(new FeeRouter()), abi.encodeCall(FeeRouter.initialize, (address(registry), address(staking), address(grants), address(ins), admin, keeper, pauser)))));
        market = NarrativeMarket(payable(deployProxy(address(new NarrativeMarket()), abi.encodeCall(NarrativeMarket.initialize, (address(oracle), address(staking), address(feeRouter), admin, pauser)))));

        registry.setStaking(address(staking));
        registry.setNti(address(nti));

        oracle.grantRole(oracle.OPERATOR_ROLE(), operator);
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(val1Pk));
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(val2Pk));
        oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(val3Pk));
        configRegistry.setConfig(CFG, 3, 1);

        // Give Alice 5M NTI for 50% fee discount
        nti.transfer(alice, 5_000_000e18);
        vm.stopPrank();

        vm.startPrank(alice);
        nti.approve(address(staking), 5_000_000e18);
        staking.stake(5_000_000e18);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _commitAndFinalize(uint32 epochId, uint32 seriesId, uint16 a, uint16 b, uint16 c) internal {
        uint256 commitTs = oracle.epochBoundary(epochId) + 60 minutes;
        vm.warp(commitTs);
        uint16[] memory iVec = new uint16[](3);
        iVec[0] = a;
        iVec[1] = b;
        iVec[2] = c;
        int32[] memory vVec = new int32[](3);

        bytes32 ds = keccak256(abi.encode("ds", epochId));
        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        uint256[3] memory pks = [val1Pk, val2Pk, val3Pk];
        for (uint256 k = 0; k < 3; k++) {
            bytes32 dig = oracle.hashAttestation(epochId, ds, CFG, iVec, vVec);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pks[k], dig);
            atts[k] = IOracleCommit.Attestation(vm.addr(pks[k]), iVec, vVec, abi.encodePacked(r, s, v));
        }

        vm.prank(operator);
        oracle.commit(epochId, seriesId, ds, CFG, keccak256("ar"), iVec, vVec, atts);

        vm.warp(commitTs + 2 hours);
        oracle.finalize(epochId);
    }

    function test_PairMarketFullLifecycleAndStakerDiscount() public {
        _commitAndFinalize(1, 1, 2000, 4000, 4000);

        uint256 id = market.createMarket(1, 2, 7); // 6-epoch (24h) horizon

        // Alice (50% discount => 0.05% fee = 0.0005 ETH on 1 ETH) bets side 0
        vm.prank(alice);
        market.bet{value: 1 ether}(id, 0);

        // Bob (0% discount => 0.1% fee = 0.002 ETH on 2 ETH) bets side 1
        vm.prank(bob);
        market.bet{value: 2 ether}(id, 1);

        // Verify cutoff: 2 epochs before settleEpoch=7 -> epoch 5 boundary
        vm.warp(oracle.epochBoundary(5));
        vm.prank(carol);
        vm.expectRevert();
        market.bet{value: 0.1 ether}(id, 0);

        // Settle epoch 7: narrative 1 doubled (2000 -> 4000), narrative 2 flat (4000 -> 4000) -> Side 0 wins!
        _commitAndFinalize(7, 1, 4000, 4000, 2000);

        // Even while paused, settle() and claim() MUST work
        vm.prank(pauser);
        market.pause();

        uint256 feeBefore = address(feeRouter).balance;
        market.settle(id);

        uint256 expectedFees = 0.0005 ether + 0.002 ether;
        assertEq(address(feeRouter).balance - feeBefore, expectedFees);
        assertEq(market.openMarketsCount(), 0);
        assertEq(market.globalTVL(), 0);

        // Alice claims entire net pool (3 ETH - expectedFees)
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        uint256 payout = market.claim(id);
        assertEq(payout, 3 ether - expectedFees);
        assertEq(alice.balance - aliceBefore, payout);

        // Double claim reverts; loser claim reverts
        vm.prank(alice);
        vm.expectRevert(NarrativeMarket.AlreadyClaimed.selector);
        market.claim(id);

        vm.prank(bob);
        vm.expectRevert(NarrativeMarket.NothingToClaim.selector);
        market.claim(id);
    }

    function test_VsAverageMarketIgnoresZeroBaseNarrative() public {
        // Narrative 3 has baseIndex = 0 -> excluded from average; active narratives = 1 (2000) & 2 (4000)
        _commitAndFinalize(1, 1, 2000, 4000, 0);

        // Creating a market with narrativeA having base index 0 reverts
        vm.expectRevert(abi.encodeWithSelector(NarrativeMarket.ZeroBaseIndex.selector, 3));
        market.createMarket(3, 0, 7);

        uint256 id = market.createMarket(1, 0, 7);
        vm.prank(alice);
        market.bet{value: 1 ether}(id, 0);
        vm.prank(bob);
        market.bet{value: 1 ether}(id, 1);

        // Narrative 1 drops to 1000 (0.5x), Narrative 2 jumps to 6000 (1.5x); avg = 1.0x -> 0.5x < 1.0x -> Side 1 wins
        _commitAndFinalize(7, 1, 1000, 6000, 3000);
        market.settle(id);

        (,,,,,,,,,, uint8 outcome, bool settled) = market.markets(id);
        assertTrue(settled);
        assertEq(outcome, market.OUTCOME_SIDE1());
    }

    function test_AllRefundPathsReturnFullGrossStakeWithZeroFees() public {
        _commitAndFinalize(1, 1, 2000, 2000, 6000);

        uint256 idEmptySide = market.createMarket(1, 2, 7);
        uint256 idTie = market.createMarket(1, 2, 7);
        uint256 idRebaseline = market.createMarket(1, 2, 43); // 42-epoch horizon

        vm.prank(bob);
        market.bet{value: 1 ether}(idEmptySide, 0);

        vm.prank(alice);
        market.bet{value: 1 ether}(idTie, 0);
        vm.prank(bob);
        market.bet{value: 1 ether}(idTie, 1);

        vm.prank(alice);
        market.bet{value: 1 ether}(idRebaseline, 0);
        vm.prank(bob);
        market.bet{value: 1 ether}(idRebaseline, 1);

        // Epoch 7: exact same ratio (4000/2000 == 4000/2000 -> Delta == 0 -> refund!)
        _commitAndFinalize(7, 1, 4000, 4000, 2000);

        uint256 feeBefore = address(feeRouter).balance;
        market.settle(idEmptySide);
        market.settle(idTie);
        assertEq(address(feeRouter).balance, feeBefore); // 0 fees sent on refund

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        assertEq(market.claim(idEmptySide), 1 ether); // full gross refund
        vm.prank(bob);
        assertEq(market.claim(idTie), 1 ether);
        assertEq(bob.balance - bobBefore, 2 ether);

        // Epoch 43: seriesId bumped from 1 -> 2 (re-baseline -> refund!)
        _commitAndFinalize(43, 2, 5000, 1000, 4000);
        market.settle(idRebaseline);
        (,,,,,,,,,, uint8 outReb,) = market.markets(idRebaseline);
        assertEq(outReb, market.OUTCOME_REFUND());
        vm.prank(alice);
        assertEq(market.claim(idRebaseline), 1 ether);
    }

    function test_IncompleteAnd48hTimeoutRefund() public {
        _commitAndFinalize(1, 1, 3000, 3000, 4000);
        uint256 idInc = market.createMarket(1, 2, 7);
        uint256 idTimeout = market.createMarket(1, 2, 43);

        vm.prank(alice);
        market.bet{value: 0.5 ether}(idInc, 0);
        vm.prank(bob);
        market.bet{value: 0.5 ether}(idInc, 1);

        vm.prank(alice);
        market.bet{value: 0.5 ether}(idTimeout, 0);
        vm.prank(bob);
        market.bet{value: 0.5 ether}(idTimeout, 1);

        // Mark epoch 7 incomplete
        vm.warp(oracle.epochBoundary(7) + 4 hours);
        oracle.markIncomplete(7);
        market.settle(idInc);
        vm.prank(alice);
        assertEq(market.claim(idInc), 0.5 ether);

        // Epoch 43 never committed or marked incomplete -> 48h timeout enables refund settle!
        vm.warp(oracle.epochBoundary(43) + 48 hours + 1);
        market.settle(idTimeout);
        vm.prank(bob);
        assertEq(market.claim(idTimeout), 0.5 ether);
    }

    function test_CapsAndLimitsEnforced() public {
        _commitAndFinalize(1, 1, 3000, 3000, 4000);
        uint256 id = market.createMarket(1, 2, 7);

        // Below minBet (0.001 ETH)
        vm.prank(alice);
        vm.expectRevert();
        market.bet{value: 0.0009 ether}(id, 0);

        // Exceeds maxPoolPerMarket (5 ETH)
        vm.prank(alice);
        market.bet{value: 3 ether}(id, 0);
        vm.prank(bob);
        vm.expectRevert(NarrativeMarket.MarketPoolCapExceeded.selector);
        market.bet{value: 2.1 ether}(id, 1);
    }
}
