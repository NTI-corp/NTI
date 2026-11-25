// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {Dispute} from "../src/Dispute.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";
import {IOracleCommit} from "../src/interfaces/IOracleCommit.sol";

contract TaxTokenC2Mock is ERC20 {
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

contract C2OracleTest is Test {
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal operator = makeAddr("operator");
    address internal challenger = makeAddr("challenger");
    address internal weth = makeAddr("weth");

    uint256 internal val1Pk = 0xA11CE;
    uint256 internal val2Pk = 0xB0B;
    uint256 internal val3Pk = 0xCA11;
    uint256 internal val4Pk = 0xD00D;
    address internal val1;
    address internal val2;
    address internal val3;
    address internal val4;

    NTIRegistry internal registry;
    NTITestToken internal token;
    Staking internal staking;
    ConfigRegistry internal configRegistry;
    OracleCommit internal oracle;
    Dispute internal dispute;

    bytes32 internal constant CONFIG_HASH_V1 = keccak256("config-v1");
    bytes32 internal constant DATASET_HASH = keccak256("dataset-1");
    bytes32 internal constant ARWEAVE_TX = keccak256("arweave-tx-1");

    function setUp() public {
        val1 = vm.addr(val1Pk);
        val2 = vm.addr(val2Pk);
        val3 = vm.addr(val3Pk);
        val4 = vm.addr(val4Pk);

        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, weth)))));
        token = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        configRegistry = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin)))));
        oracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(configRegistry), 0, admin, pauser)))));
        dispute = Dispute(payable(deployProxy(address(new Dispute()), abi.encodeCall(Dispute.initialize, (address(registry), address(oracle), address(staking), admin, pauser)))));

        registry.setStaking(address(staking));
        registry.setNti(address(token));

        staking.grantRole(staking.SLASHER_ROLE(), address(oracle));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));

        oracle.grantRole(oracle.DISPUTE_ROLE(), address(dispute));
        oracle.grantRole(oracle.OPERATOR_ROLE(), operator);
        oracle.grantRole(oracle.VALIDATOR_ROLE(), val1);
        oracle.grantRole(oracle.VALIDATOR_ROLE(), val2);
        oracle.grantRole(oracle.VALIDATOR_ROLE(), val3);

        configRegistry.setConfig(CONFIG_HASH_V1, 3, 1);

        token.transfer(operator, 2_000_000e18);
        token.transfer(val1, 6_000_000e18);
        token.transfer(val2, 6_000_000e18);
        token.transfer(val3, 6_000_000e18);
        token.transfer(val4, 6_000_000e18);
        token.transfer(challenger, 500_000e18);
        vm.stopPrank();
    }

    // --- Helpers ---

    function _signCommit(
        uint256 pk,
        uint32 epochId,
        bytes32 dsHash,
        bytes32 cfgHash,
        uint16[] memory iVec,
        int32[] memory vVec
    ) internal view returns (IOracleCommit.Attestation memory) {
        bytes32 digest = oracle.hashAttestation(epochId, dsHash, cfgHash, iVec, vVec);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return IOracleCommit.Attestation({
            validator: vm.addr(pk),
            i: iVec,
            v: vVec,
            sig: abi.encodePacked(r, s, v)
        });
    }

    function _signResolution(
        uint256 pk,
        uint256 disputeId,
        uint32 epochId,
        bytes32 dsHash,
        bytes32 cfgHash,
        uint16[] memory iVec,
        int32[] memory vVec
    ) internal view returns (IOracleCommit.Attestation memory) {
        bytes32 digest = dispute.hashResolution(disputeId, epochId, dsHash, cfgHash, iVec, vVec);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return IOracleCommit.Attestation({
            validator: vm.addr(pk),
            i: iVec,
            v: vVec,
            sig: abi.encodePacked(r, s, v)
        });
    }

    function _vec3(uint16 a, uint16 b, uint16 c) internal pure returns (uint16[] memory arr) {
        arr = new uint16[](3);
        arr[0] = a;
        arr[1] = b;
        arr[2] = c;
    }

    function _vel3(int32 a, int32 b, int32 c) internal pure returns (int32[] memory arr) {
        arr = new int32[](3);
        arr[0] = a;
        arr[1] = b;
        arr[2] = c;
    }

    // --- ConfigRegistry Tests ---

    function test_ConfigRegistryVersioningAndBounds() public {
        (bytes32 h, uint8 n) = configRegistry.active(1);
        assertEq(h, CONFIG_HASH_V1);
        assertEq(n, 3);

        bytes32 v2Hash = keccak256("config-v2");
        vm.startPrank(admin);
        configRegistry.setConfig(v2Hash, 10, 50);
        configRegistry.setKolSetHash(keccak256("kol-set-v1"));

        // Rejects non-monotonic epoch or > 32 narratives
        vm.expectRevert();
        configRegistry.setConfig(keccak256("bad"), 10, 50);
        vm.expectRevert();
        configRegistry.setConfig(keccak256("bad"), 33, 60);
        vm.stopPrank();

        (bytes32 h49, uint8 n49) = configRegistry.active(49);
        assertEq(h49, CONFIG_HASH_V1);
        assertEq(n49, 3);

        (bytes32 h50, uint8 n50) = configRegistry.active(50);
        assertEq(h50, v2Hash);
        assertEq(n50, 10);
        assertEq(configRegistry.kolSetHash(), keccak256("kol-set-v1"));
    }

    // --- OracleCommit Tests ---

    function test_CommitMedianAndFinalizeAfterDisputeWindow() public {
        uint32 epochId = 1;
        // Too early: before epochBoundary(1) + 60m
        vm.warp(oracle.epochBoundary(epochId) + 59 minutes);

        uint16[] memory i1 = _vec3(3000, 4000, 3000);
        uint16[] memory i2 = _vec3(3020, 3980, 3000);
        uint16[] memory i3 = _vec3(3080, 4050, 2970);
        int32[] memory v1 = _vel3(100, -50, type(int32).min);
        int32[] memory v2 = _vel3(120, -40, type(int32).min);
        int32[] memory v3 = _vel3(150, -30, 10);

        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        atts[0] = _signCommit(val1Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, i1, v1);
        atts[1] = _signCommit(val2Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, i2, v2);
        atts[2] = _signCommit(val3Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, i3, v3);

        vm.prank(operator);
        vm.expectRevert();
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, i2, v2, atts);

        // At boundary + 60m -> succeeds
        vm.warp(oracle.epochBoundary(epochId) + 60 minutes);
        vm.prank(operator);
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, i2, v2, atts);

        assertEq(oracle.epochStatus(epochId), oracle.STATUS_COMMITTED());
        assertFalse(oracle.isFinal(epochId));

        // Cannot finalize before 2h dispute window
        vm.warp(block.timestamp + 2 hours - 1);
        vm.expectRevert();
        oracle.finalize(epochId);

        // Pause must NOT block finalize
        vm.prank(pauser);
        oracle.pause();

        vm.warp(block.timestamp + 1);
        oracle.finalize(epochId);
        assertTrue(oracle.isFinal(epochId));
        assertEq(oracle.latestFinalEpoch(), epochId);

        // Stored values are per-narrative medians: (3020, 4000, 3000) and v = (120, -40, type(int32).min)
        assertEq(oracle.finalIndex(epochId, 1), 3020);
        assertEq(oracle.finalIndex(epochId, 2), 4000);
        assertEq(oracle.finalIndex(epochId, 3), 3000);
        assertEq(oracle.finalVelocity(epochId, 1), 120);
        assertEq(oracle.finalVelocity(epochId, 2), -40);
        assertEq(oracle.finalVelocity(epochId, 3), type(int32).min);

        // Attestations cleared on finalize
        (address[] memory vals,) = oracle.getEpochAttestations(epochId);
        assertEq(vals.length, 0);
    }

    function test_CommitRejectsOperatorDeviationAndDuplicateValidator() public {
        uint32 epochId = 1;
        vm.warp(oracle.epochBoundary(epochId) + 60 minutes);

        uint16[] memory vMed = _vec3(3000, 4000, 3000);
        uint16[] memory opBad = _vec3(3101, 4000, 3000); // > 100 bps deviation
        int32[] memory vel = _vel3(10, 20, 30);

        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        atts[0] = _signCommit(val1Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vMed, vel);
        atts[1] = _signCommit(val2Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vMed, vel);
        atts[2] = _signCommit(val3Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vMed, vel);

        vm.prank(operator);
        vm.expectRevert();
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, opBad, vel, atts);

        // Duplicate validator rejected
        atts[2] = _signCommit(val1Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vMed, vel);
        vm.prank(operator);
        vm.expectRevert();
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, vMed, vel, atts);
    }

    function test_AutoSkipAndMarkIncompletePreventDeadlock() public {
        // Commit epoch 1
        vm.warp(oracle.epochBoundary(1) + 60 minutes);
        uint16[] memory vec = _vec3(3000, 4000, 3000);
        int32[] memory vel = _vel3(0, 0, 0);
        IOracleCommit.Attestation[] memory atts1 = new IOracleCommit.Attestation[](3);
        atts1[0] = _signCommit(val1Pk, 1, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        atts1[1] = _signCommit(val2Pk, 1, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        atts1[2] = _signCommit(val3Pk, 1, DATASET_HASH, CONFIG_HASH_V1, vec, vel);

        vm.prank(operator);
        oracle.commit(1, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, vec, vel, atts1);

        // Skip epochs 2 and 3, commit epoch 4 -> epochs 2 & 3 auto-marked incomplete!
        vm.warp(oracle.epochBoundary(4) + 60 minutes);
        IOracleCommit.Attestation[] memory atts4 = new IOracleCommit.Attestation[](3);
        atts4[0] = _signCommit(val1Pk, 4, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        atts4[1] = _signCommit(val2Pk, 4, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        atts4[2] = _signCommit(val3Pk, 4, DATASET_HASH, CONFIG_HASH_V1, vec, vel);

        vm.prank(operator);
        oracle.commit(4, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, vec, vel, atts4);

        assertEq(oracle.epochStatus(2), oracle.STATUS_INCOMPLETE());
        assertEq(oracle.epochStatus(3), oracle.STATUS_INCOMPLETE());
        assertEq(oracle.epochStatus(4), oracle.STATUS_COMMITTED());

        // Explicit markIncomplete on epoch 5 after boundary + 4h
        vm.warp(oracle.epochBoundary(5) + 4 hours);
        oracle.markIncomplete(5);
        assertEq(oracle.epochStatus(5), oracle.STATUS_INCOMPLETE());
    }

    function test_PermissionlessValidatorJoin() public {
        vm.prank(val4);
        vm.expectRevert(OracleCommit.PermissionlessDisabled.selector);
        oracle.joinAsValidator();

        vm.prank(admin);
        oracle.setPermissionless(true);

        // Needs 5,000,000 NTI stake
        vm.prank(val4);
        vm.expectRevert();
        oracle.joinAsValidator();

        vm.startPrank(val4);
        token.approve(address(staking), 5_000_000e18);
        staking.stake(5_000_000e18);
        oracle.joinAsValidator();
        vm.stopPrank();

        assertTrue(oracle.isActiveValidator(val4));

        // If validator unstakes below minimum, becomes inactive
        vm.prank(val4);
        staking.requestUnstake(1e18);
        assertFalse(oracle.isActiveValidator(val4));
    }

    // --- Dispute Tests ---

    function test_DisputeChallengerWinsSlashesOperatorAndDeviators() public {
        // Stake operator and validators (val2 tries to hide in cooldown!)
        vm.startPrank(operator);
        token.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        vm.stopPrank();

        vm.startPrank(val1);
        token.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        vm.stopPrank();

        vm.startPrank(val2);
        token.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        staking.requestUnstake(1_000_000e18); // all in cooldown!
        vm.stopPrank();

        vm.startPrank(val3);
        token.approve(address(staking), 1_000_000e18);
        staking.stake(1_000_000e18);
        vm.stopPrank();

        // Commit epoch 1: val1 & val2 collude with narrative 1 = 5000, val3 reports honest 3500.
        // Median = 5000.
        uint32 epochId = 1;
        vm.warp(oracle.epochBoundary(epochId) + 60 minutes);
        uint16[] memory badVec = _vec3(5000, 2500, 2500);
        uint16[] memory honestVec = _vec3(3500, 3250, 3250);
        int32[] memory vel = _vel3(0, 0, 0);

        IOracleCommit.Attestation[] memory commitAtts = new IOracleCommit.Attestation[](3);
        commitAtts[0] = _signCommit(val1Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, badVec, vel);
        commitAtts[1] = _signCommit(val2Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, badVec, vel);
        commitAtts[2] = _signCommit(val3Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, honestVec, vel);

        vm.prank(operator);
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, badVec, vel, commitAtts);

        // Challenger opens dispute
        uint256 chalBalBefore = token.balanceOf(challenger);
        vm.startPrank(challenger);
        token.approve(address(dispute), 50_000e18);
        uint256 dId = dispute.openDispute(epochId, 1, 3500, keccak256("evidence"));
        vm.stopPrank();

        assertEq(oracle.epochStatus(epochId), oracle.STATUS_DISPUTED());

        // Max 1 dispute per epoch
        vm.startPrank(challenger);
        token.approve(address(dispute), 50_000e18);
        vm.expectRevert(abi.encodeWithSelector(Dispute.EpochAlreadyDisputed.selector, epochId));
        dispute.openDispute(epochId, 1, 3500, keccak256("evidence-2"));
        vm.stopPrank();

        // Finalize is blocked while disputed
        vm.warp(block.timestamp + 3 hours);
        vm.expectRevert();
        oracle.finalize(epochId);

        // Even when paused, resolve MUST succeed!
        vm.prank(pauser);
        dispute.pause();

        // Validators resolve with corrected honest vector (3500, 3250, 3250)
        IOracleCommit.Attestation[] memory resAtts = new IOracleCommit.Attestation[](3);
        resAtts[0] = _signResolution(val1Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, honestVec, vel);
        resAtts[1] = _signResolution(val2Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, honestVec, vel);
        resAtts[2] = _signResolution(val3Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, honestVec, vel);

        dispute.resolve(dId, resAtts);

        // Epoch is directly FINAL with updated median!
        assertTrue(oracle.isFinal(epochId));
        assertEq(oracle.finalIndex(epochId, 1), 3500);

        // Operator slashed 500k, val1 slashed 250k, val2 slashed 250k FROM COOLDOWN, honest val3 NOT slashed!
        assertEq(staking.stakeOf(operator), 500_000e18);
        assertEq(staking.stakeOf(val1), 750_000e18);
        (uint256 val2Cd,) = staking.cooldownOf(val2);
        assertEq(val2Cd, 750_000e18);
        assertEq(staking.stakeOf(val3), 1_000_000e18);

        // Challenger got bond back + 50% of (500k + 250k + 250k) = +500k reward
        assertEq(token.balanceOf(challenger), chalBalBefore + 500_000e18);
    }

    function test_DisputeChallengerLosesSplitsBond50Burn50Validators() public {
        uint32 epochId = 1;
        vm.warp(oracle.epochBoundary(epochId) + 60 minutes);
        uint16[] memory vec = _vec3(3000, 4000, 3000);
        int32[] memory vel = _vel3(0, 0, 0);

        IOracleCommit.Attestation[] memory commitAtts = new IOracleCommit.Attestation[](3);
        commitAtts[0] = _signCommit(val1Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        commitAtts[1] = _signCommit(val2Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
        commitAtts[2] = _signCommit(val3Pk, epochId, DATASET_HASH, CONFIG_HASH_V1, vec, vel);

        vm.prank(operator);
        oracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, vec, vel, commitAtts);

        vm.startPrank(challenger);
        token.approve(address(dispute), 50_000e18);
        uint256 dId = dispute.openDispute(epochId, 1, 2000, keccak256("false-claim"));
        vm.stopPrank();

        uint256 val1Before = token.balanceOf(val1);
        uint256 burnBefore = token.balanceOf(registry.burnAddress());

        // Validators confirm within 100 bps (3050 vs 3000 -> diff 50 <= 100)
        uint16[] memory closeVec = _vec3(3050, 3950, 3000);
        IOracleCommit.Attestation[] memory resAtts = new IOracleCommit.Attestation[](3);
        resAtts[0] = _signResolution(val1Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, closeVec, vel);
        resAtts[1] = _signResolution(val2Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, closeVec, vel);
        resAtts[2] = _signResolution(val3Pk, dId, epochId, DATASET_HASH, CONFIG_HASH_V1, closeVec, vel);

        dispute.resolve(dId, resAtts);

        assertTrue(oracle.isFinal(epochId));
        assertEq(oracle.finalIndex(epochId, 1), 3000); // original preserved
        uint256 expectedPerVal = uint256(50_000e18 / 2) / 3;
        assertEq(token.balanceOf(val1) - val1Before, expectedPerVal);
        assertEq(token.balanceOf(registry.burnAddress()) - burnBefore, 50_000e18 - expectedPerVal * 3);
    }

    function test_DisputeExpireRefundsBondAndMarksIncompleteWithTaxToken() public {
        // Deploy with 5% fee-on-transfer token to verify actualBondReceived accounting
        vm.startPrank(admin);
        NTIRegistry taxReg = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, weth)))));
        TaxTokenC2Mock taxTok = new TaxTokenC2Mock(500, makeAddr("creator"));
        Staking taxStaking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(taxReg), admin, pauser)))));
        OracleCommit taxOracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(taxStaking), address(configRegistry), 0, admin, pauser)))));
        Dispute taxDispute = Dispute(payable(deployProxy(address(new Dispute()), abi.encodeCall(Dispute.initialize, (address(taxReg), address(taxOracle), address(taxStaking), admin, pauser)))));

        taxReg.setStaking(address(taxStaking));
        taxReg.setNti(address(taxTok));
        taxOracle.grantRole(taxOracle.DISPUTE_ROLE(), address(taxDispute));
        taxOracle.grantRole(taxOracle.OPERATOR_ROLE(), operator);
        taxOracle.grantRole(taxOracle.VALIDATOR_ROLE(), val1);
        taxOracle.grantRole(taxOracle.VALIDATOR_ROLE(), val2);
        taxOracle.grantRole(taxOracle.VALIDATOR_ROLE(), val3);
        taxTok.transfer(challenger, 200_000e18);
        vm.stopPrank();

        uint32 epochId = 1;
        vm.warp(taxOracle.epochBoundary(epochId) + 60 minutes);
        uint16[] memory vec = _vec3(3000, 4000, 3000);
        int32[] memory vel = _vel3(0, 0, 0);

        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        uint256[3] memory pks = [val1Pk, val2Pk, val3Pk];
        for (uint256 k = 0; k < 3; k++) {
            bytes32 dig = taxOracle.hashAttestation(epochId, DATASET_HASH, CONFIG_HASH_V1, vec, vel);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pks[k], dig);
            atts[k] = IOracleCommit.Attestation(vm.addr(pks[k]), vec, vel, abi.encodePacked(r, s, v));
        }

        vm.prank(operator);
        taxOracle.commit(epochId, 1, DATASET_HASH, CONFIG_HASH_V1, ARWEAVE_TX, vec, vel, atts);

        vm.startPrank(challenger);
        taxTok.approve(address(taxDispute), 50_000e18);
        uint256 dId = taxDispute.openDispute(epochId, 1, 1000, keccak256("ev"));
        vm.stopPrank();

        // 5% fee -> Dispute received 47,500e18
        (,,,,, uint256 bondRec,,) = taxDispute.disputes(dId);
        assertEq(bondRec, 47_500e18);

        // Expire after 6 hours (even if paused!)
        vm.prank(pauser);
        taxDispute.pause();

        vm.warp(block.timestamp + 6 hours + 1);
        taxDispute.expire(dId);

        assertEq(taxOracle.epochStatus(epochId), taxOracle.STATUS_INCOMPLETE());
        assertEq(taxTok.balanceOf(address(taxDispute)), 0);
    }
}
