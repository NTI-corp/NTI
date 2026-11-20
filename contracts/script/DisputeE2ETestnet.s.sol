// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";

import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {Dispute} from "../src/Dispute.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";
import {IOracleCommit} from "../src/interfaces/IOracleCommit.sol";

/// @notice Challenger-wins dispute path, end to end on Robinhood Testnet (46630).
///         Runs against a throwaway sandbox suite (own registry, token, staking, oracle, dispute) so the
///         live epochs and stakes are never touched. Every outcome is asserted on-chain with `require`.
///         Testnet only.
contract DisputeE2ETestnet is Script {
    uint256 internal constant EPOCH = 1;
    bytes32 internal constant DATASET = keccak256("sandbox-dataset");
    bytes32 internal constant CONFIG = keccak256("sandbox-config");

    struct Keys {
        uint256 deployer;
        uint256 operator;
        uint256 challenger;
        uint256[3] validators;
    }

    function run() external {
        require(block.chainid == 46630, "testnet only");
        Keys memory k = Keys({
            deployer: vm.envUint("DEPLOYER_PRIVATE_KEY"),
            operator: vm.envUint("OPERATOR_PRIVATE_KEY"),
            challenger: vm.envUint("KEEPER_PRIVATE_KEY"),
            validators: [
                vm.envUint("VALIDATOR_PRIVATE_KEY_1"),
                vm.envUint("VALIDATOR_PRIVATE_KEY_2"),
                vm.envUint("VALIDATOR_PRIVATE_KEY_3")
            ]
        });
        address deployer = vm.addr(k.deployer);
        address operator = vm.addr(k.operator);
        address challenger = vm.addr(k.challenger);

        (OracleCommit oracle, Dispute dispute, Staking staking, NTITestToken token) =
            _deploySandbox(k, deployer, operator, challenger);

        // Operator stakes, then commits epoch 1 with three validator attestations.
        uint16[] memory committed = _vector(1000, 1000);
        int32[] memory zeroV = new int32[](10);
        vm.startBroadcast(k.operator);
        token.approve(address(staking), 600_000e18);
        staking.stake(600_000e18);
        oracle.commit(
            uint32(EPOCH), 1, DATASET, CONFIG, bytes32(0), committed, zeroV, _commitAtts(k, oracle, committed, zeroV)
        );
        vm.stopBroadcast();
        require(oracle.epochStatus(uint32(EPOCH)) == oracle.STATUS_COMMITTED(), "commit failed");

        // Challenger disputes narrative 1 (committed 1000 bps, claims 1500).
        uint256 bond = dispute.disputeBond();
        vm.startBroadcast(k.challenger);
        token.approve(address(dispute), bond);
        uint256 disputeId = dispute.openDispute(uint32(EPOCH), 1, 1500, keccak256("evidence"));
        vm.stopBroadcast();
        require(oracle.epochStatus(uint32(EPOCH)) == oracle.STATUS_DISPUTED(), "not disputed");

        // Validators re-attest with narrative 1 at 1500 bps (> 100 bps away from the committed value).
        uint16[] memory corrected = _vector(1500, 500);
        IOracleCommit.Attestation[] memory resolveAtts = _resolveAtts(k, dispute, disputeId, corrected, zeroV);
        uint256 challengerBefore = token.balanceOf(challenger);
        vm.startBroadcast(k.challenger);
        dispute.resolve(disputeId, resolveAtts);
        vm.stopBroadcast();

        // Assertions: challenger won, epoch final with corrected vector, operator slashed, bond returned.
        require(oracle.isFinal(uint32(EPOCH)), "epoch not final");
        require(oracle.finalIndex(uint32(EPOCH), 1) == 1500, "vector not replaced");
        (,,,,,, uint8 state) = _disputeState(dispute, disputeId);
        require(state == dispute.STATE_WON(), "challenger did not win");
        require(staking.stakeOf(operator) == 100_000e18, "operator not slashed by 500k");
        // bond refund (50k) + 50% of the 500k slash (250k)
        require(token.balanceOf(challenger) - challengerBefore == 300_000e18, "wrong challenger payout");

        string memory key = "e2e";
        vm.serializeAddress(key, "oracle", address(oracle));
        vm.serializeAddress(key, "dispute", address(dispute));
        vm.serializeAddress(key, "staking", address(staking));
        string memory out = vm.serializeUint(key, "disputeId", disputeId);
        vm.writeJson(out, "deployments/46630.dispute-e2e.json");
    }

    function _deploySandbox(Keys memory k, address deployer, address operator, address challenger)
        internal
        returns (OracleCommit oracle, Dispute dispute, Staking staking, NTITestToken token)
    {
        vm.startBroadcast(k.deployer);
        NTIRegistry registry = new NTIRegistry(deployer, address(0xdead0001));
        token = new NTITestToken(deployer);
        staking = new Staking(address(registry), deployer, deployer);
        ConfigRegistry config = new ConfigRegistry(deployer);
        oracle = new OracleCommit(
            address(staking), address(config), uint64(block.timestamp - 3 days), deployer, deployer
        );
        dispute = new Dispute(address(registry), address(oracle), address(staking), deployer, deployer);

        registry.setStaking(address(staking));
        registry.setNti(address(token));
        staking.grantRole(staking.SLASHER_ROLE(), address(oracle));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        oracle.grantRole(oracle.DISPUTE_ROLE(), address(dispute));
        oracle.grantRole(oracle.OPERATOR_ROLE(), operator);
        for (uint256 i = 0; i < 3; i++) {
            oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(k.validators[i]));
        }
        config.setConfig(CONFIG, 10, 1);
        require(token.transfer(operator, 600_000e18), "fund operator");
        require(token.transfer(challenger, 50_000e18), "fund challenger");
        vm.stopBroadcast();
    }

    function _vector(uint16 first, uint16 second) internal pure returns (uint16[] memory v) {
        v = new uint16[](10);
        v[0] = first;
        v[1] = second;
        // remaining eight narratives share what is left so the vector always sums to 10,000 bps
        uint16 rest = uint16(10_000 - first - second);
        for (uint256 i = 2; i < 10; i++) {
            v[i] = rest / 8;
        }
        v[9] += rest - (rest / 8) * 8;
    }

    function _commitAtts(Keys memory k, OracleCommit oracle, uint16[] memory iVec, int32[] memory vVec)
        internal
        view
        returns (IOracleCommit.Attestation[] memory atts)
    {
        atts = new IOracleCommit.Attestation[](3);
        bytes32 digest = oracle.hashAttestation(uint32(EPOCH), DATASET, CONFIG, iVec, vVec);
        for (uint256 i = 0; i < 3; i++) {
            atts[i] = IOracleCommit.Attestation({
                validator: vm.addr(k.validators[i]),
                i: iVec,
                v: vVec,
                sig: _sign(k.validators[i], digest)
            });
        }
    }

    function _resolveAtts(
        Keys memory k,
        Dispute dispute,
        uint256 disputeId,
        uint16[] memory iVec,
        int32[] memory vVec
    ) internal view returns (IOracleCommit.Attestation[] memory atts) {
        atts = new IOracleCommit.Attestation[](3);
        bytes32 digest = dispute.hashResolution(disputeId, uint32(EPOCH), DATASET, CONFIG, iVec, vVec);
        for (uint256 i = 0; i < 3; i++) {
            atts[i] = IOracleCommit.Attestation({
                validator: vm.addr(k.validators[i]),
                i: iVec,
                v: vVec,
                sig: _sign(k.validators[i], digest)
            });
        }
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _disputeState(Dispute dispute, uint256 id)
        internal
        view
        returns (uint32, uint8, uint16, bytes32, address, uint256, uint8)
    {
        (uint32 e, uint8 n, uint16 c, bytes32 ev, address ch, uint256 br,, uint8 st) = dispute.disputes(id);
        return (e, n, c, ev, ch, br, st);
    }
}
