// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {KOLRegistry} from "../src/KOLRegistry.sol";
import {NTIGovernor} from "../src/NTIGovernor.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {NTITimelock} from "../src/NTITimelock.sol";
import {Staking} from "../src/Staking.sol";

contract C7GovAndKOLTest is Test {
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal voter1 = makeAddr("voter1");
    address internal voter2 = makeAddr("voter2");
    address internal kolWallet = makeAddr("kolWallet");
    address internal otherWallet = makeAddr("otherWallet");

    uint256 internal attesterPk = 0xA77E57;
    uint256 internal fakeAttesterPk = 0xBAD1;
    address internal attester;

    NTIRegistry internal registry;
    NTITestToken internal nti;
    Staking internal staking;
    ConfigRegistry internal configRegistry;
    InsuranceFund internal insurance;
    NTITimelock internal timelock;
    NTIGovernor internal governor;
    KOLRegistry internal kolRegistry;

    function setUp() public {
        attester = vm.addr(attesterPk);
        vm.roll(10);

        vm.startPrank(admin);
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, makeAddr("weth"))))));
        nti = new NTITestToken(admin);
        staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        configRegistry = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin)))));
        insurance = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (admin)))));

        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = new NTITimelock(proposers, executors, admin);
        governor = new NTIGovernor(staking, timelock, 1, 100, 0);
        kolRegistry = KOLRegistry(payable(deployProxy(address(new KOLRegistry()), abi.encodeCall(KOLRegistry.initialize, (admin, attester)))));

        registry.setStaking(address(staking));
        registry.setNti(address(nti));

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        // Transfer admin of ConfigRegistry and InsuranceFund to Timelock
        configRegistry.grantRole(configRegistry.DEFAULT_ADMIN_ROLE(), address(timelock));
        insurance.grantRole(insurance.DEFAULT_ADMIN_ROLE(), address(timelock));

        nti.transfer(voter1, 6_000_000e18);
        nti.transfer(voter2, 4_000_000e18);
        vm.stopPrank();

        vm.startPrank(voter1);
        nti.approve(address(staking), 6_000_000e18);
        staking.stake(6_000_000e18);
        vm.stopPrank();

        vm.startPrank(voter2);
        nti.approve(address(staking), 4_000_000e18);
        staking.stake(4_000_000e18);
        vm.stopPrank();

        vm.roll(15);
    }

    function test_GovernorEndToEndConfigUpdateAndInsuranceWithdrawViaTimelock() public {
        vm.deal(address(this), 3 ether);
        (bool ok,) = payable(address(insurance)).call{value: 3 ether}("");
        assertTrue(ok);

        address payable payoutRecipient = payable(makeAddr("claimant"));
        bytes32 newCfgHash = keccak256("gov-approved-config-v2");

        address[] memory targets = new address[](2);
        targets[0] = address(configRegistry);
        targets[1] = address(insurance);

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = abi.encodeCall(ConfigRegistry.setConfig, (newCfgHash, 12, 100));
        calldatas[1] = abi.encodeCall(InsuranceFund.withdraw, (payoutRecipient, 1 ether));

        string memory desc = "NTI-001: Upgrade config to 12 narratives & disburse 1 ETH insurance";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, desc);

        // Advance past votingDelay (1 block)
        vm.roll(block.number + 2);

        // Cast vote For (1) -> 6M / 10M = 60% >> 4% quorum
        vm.prank(voter1);
        governor.castVote(proposalId, 1);

        // Advance past votingPeriod (100 blocks)
        vm.roll(block.number + 101);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));

        // Queue into 48h Timelock
        bytes32 descHash = keccak256(bytes(desc));
        governor.queue(targets, values, calldatas, descHash);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Queued));

        // Cannot execute before 48h timelock delay
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert();
        governor.execute(targets, values, calldatas, descHash);

        // Execute after 48h
        vm.warp(block.timestamp + 1);
        governor.execute(targets, values, calldatas, descHash);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Executed));

        (bytes32 activeHash, uint8 activeCount) = configRegistry.active(100);
        assertEq(activeHash, newCfgHash);
        assertEq(activeCount, 12);
        assertEq(payoutRecipient.balance, 1 ether);
        assertEq(address(insurance).balance, 2 ether);
    }

    function test_KOLRegistryEIP712VerificationReplayAndRevoke() public {
        bytes32 handleHash = keccak256("@alpha_kol");
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 digest = kolRegistry.hashRegistration(kolWallet, handleHash, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Fake attester signature rejected
        (uint8 fv, bytes32 fr, bytes32 fs) = vm.sign(fakeAttesterPk, digest);
        vm.expectRevert();
        kolRegistry.register(kolWallet, handleHash, deadline, abi.encodePacked(fr, fs, fv));

        // Valid attester signature succeeds
        kolRegistry.register(kolWallet, handleHash, deadline, sig);
        assertEq(kolRegistry.handleOf(kolWallet), handleHash);
        assertEq(kolRegistry.walletOf(handleHash), kolWallet);

        // Replay of same digest rejected
        vm.expectRevert(KOLRegistry.DigestAlreadyUsed.selector);
        kolRegistry.register(kolWallet, handleHash, deadline, sig);

        // Hijacking handle with another wallet rejected even with valid attester sig
        bytes32 hijackDigest = kolRegistry.hashRegistration(otherWallet, handleHash, deadline + 1);
        (uint8 hv, bytes32 hr, bytes32 hs) = vm.sign(attesterPk, hijackDigest);
        vm.expectRevert();
        kolRegistry.register(otherWallet, handleHash, deadline + 1, abi.encodePacked(hr, hs, hv));

        // Expired deadline rejected
        uint256 pastDeadline = block.timestamp - 1;
        bytes32 expDigest = kolRegistry.hashRegistration(otherWallet, keccak256("@other"), pastDeadline);
        (uint8 ev, bytes32 er, bytes32 es) = vm.sign(attesterPk, expDigest);
        vm.expectRevert();
        kolRegistry.register(otherWallet, keccak256("@other"), pastDeadline, abi.encodePacked(er, es, ev));

        // Self unregister clears both mappings
        vm.prank(kolWallet);
        kolRegistry.unregister();
        assertEq(kolRegistry.handleOf(kolWallet), bytes32(0));
        assertEq(kolRegistry.walletOf(handleHash), address(0));

        // Admin revoke works too
        bytes32 d2 = kolRegistry.hashRegistration(otherWallet, handleHash, deadline + 2);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(attesterPk, d2);
        kolRegistry.register(otherWallet, handleHash, deadline + 2, abi.encodePacked(r2, s2, v2));
        assertEq(kolRegistry.walletOf(handleHash), otherWallet);

        vm.prank(admin);
        kolRegistry.revoke(otherWallet);
        assertEq(kolRegistry.walletOf(handleHash), address(0));
    }
}
