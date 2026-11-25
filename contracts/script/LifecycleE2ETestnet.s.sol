// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Script} from "forge-std/Script.sol";

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

/// @notice Full economic lifecycle on a throwaway sandbox suite on Robinhood Testnet (46630):
///         commit -> finalize -> market -> bets -> settle -> claim -> fee split -> staking reward claim.
///         The sandbox uses a genesis offset so epoch boundaries land minutes from now instead of hours, and
///         1 second timings, so the whole flow runs in about three minutes (driven by
///         infra/scripts/run_lifecycle_e2e.sh). Live contracts are never touched. Testnet only.
contract LifecycleE2ETestnet is Script {
    bytes32 internal constant DATASET = keccak256("lifecycle-dataset");
    bytes32 internal constant CONFIG = keccak256("lifecycle-config");
    string internal constant FILE = "deployments/46630.lifecycle-e2e.json";
    uint256 internal constant BET = 0.0002 ether;

    struct Keys {
        uint256 deployer;
        uint256 operator;
        uint256 keeper;
        uint256[3] validators;
    }

    struct Suite {
        OracleCommit oracle;
        Staking staking;
        NarrativeMarket market;
        FeeRouter feeRouter;
        NTITestToken token;
    }

    function _keys() internal view returns (Keys memory k) {
        k = Keys({
            deployer: vm.envUint("DEPLOYER_PRIVATE_KEY"),
            operator: vm.envUint("OPERATOR_PRIVATE_KEY"),
            keeper: vm.envUint("KEEPER_PRIVATE_KEY"),
            validators: [
                vm.envUint("VALIDATOR_PRIVATE_KEY_1"),
                vm.envUint("VALIDATOR_PRIVATE_KEY_2"),
                vm.envUint("VALIDATOR_PRIVATE_KEY_3")
            ]
        });
    }

    function _load() internal view returns (Suite memory s) {
        string memory json = vm.readFile(FILE);
        s.oracle = OracleCommit(vm.parseJsonAddress(json, ".oracle"));
        s.staking = Staking(vm.parseJsonAddress(json, ".staking"));
        s.market = NarrativeMarket(vm.parseJsonAddress(json, ".market"));
        s.feeRouter = FeeRouter(payable(vm.parseJsonAddress(json, ".feeRouter")));
        s.token = NTITestToken(vm.parseJsonAddress(json, ".token"));
    }

    /// Phase 1: deploy the sandbox and commit epoch 1 (its boundary is already in the past).
    function p1() external {
        require(block.chainid == 46630, "testnet only");
        Keys memory k = _keys();
        address deployer = vm.addr(k.deployer);
        address operator = vm.addr(k.operator);
        address keeper = vm.addr(k.keeper);

        vm.startBroadcast(k.deployer);
        NTIRegistry registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (deployer, address(0xdead0002))))));
        NTITestToken token = new NTITestToken(deployer);
        Staking staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), deployer, deployer)))));
        ConfigRegistry config = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (deployer)))));
        // epoch 3 starts about 240 seconds from now; epochs 1 and 2 are already in the past
        OracleCommit oracle = OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(config), uint64(block.timestamp + 240 - 3 * 4 hours), deployer, deployer)))));
        InsuranceFund insurance = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (deployer)))));
        Grants grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), deployer, keeper, deployer)))));
        FeeRouter feeRouter =
            FeeRouter(payable(deployProxy(address(new FeeRouter()), abi.encodeCall(FeeRouter.initialize, (address(registry), address(staking), address(grants), address(insurance), deployer, keeper, deployer)))));
        NarrativeMarket market =
            NarrativeMarket(payable(deployProxy(address(new NarrativeMarket()), abi.encodeCall(NarrativeMarket.initialize, (address(oracle), address(staking), address(feeRouter), deployer, deployer)))));

        registry.setStaking(address(staking));
        registry.setNti(address(token));
        staking.grantRole(staking.SLASHER_ROLE(), address(oracle));
        oracle.grantRole(oracle.OPERATOR_ROLE(), operator);
        for (uint256 i = 0; i < 3; i++) {
            oracle.grantRole(oracle.VALIDATOR_ROLE(), vm.addr(k.validators[i]));
        }
        config.setConfig(CONFIG, 10, 1);
        oracle.setTimings(1, 3, 10); // commit delay 1s, dispute window 3s, incomplete delay 10s
        market.setTimings(2, 6, 0, 1 hours);
        market.setRiskParams(0.0001 ether, 5 ether, 20, 50 ether);
        // a staker so the 30% fee share has someone to reward
        token.approve(address(staking), 100_000e18);
        staking.stake(100_000e18);
        vm.stopBroadcast();

        string memory key = "lifecycle";
        vm.serializeAddress(key, "oracle", address(oracle));
        vm.serializeAddress(key, "staking", address(staking));
        vm.serializeAddress(key, "market", address(market));
        vm.serializeAddress(key, "feeRouter", address(feeRouter));
        string memory out = vm.serializeAddress(key, "token", address(token));
        vm.writeJson(out, FILE);

        Suite memory s = Suite(oracle, staking, market, feeRouter, token);
        _commit(s, k, 1, _vector(1000, 1000));
    }

    /// Phase 2 (a few seconds later): finalize epoch 1, open a market on it and place both bets.
    function p2() external {
        Keys memory k = _keys();
        Suite memory s = _load();
        vm.startBroadcast(k.keeper);
        s.oracle.finalize(1);
        vm.stopBroadcast();

        vm.startBroadcast(k.deployer);
        uint256 id = s.market.createMarket(1, 2, 3);
        s.market.bet{value: BET}(id, 0);
        vm.stopBroadcast();
        vm.startBroadcast(k.operator);
        s.market.bet{value: BET}(id, 1);
        vm.stopBroadcast();
        require(id == 1, "unexpected market id");
    }

    /// Phase 3 (after epoch 3 has started): commit epoch 3 where narrative 1 outgrew narrative 2.
    function p3() external {
        Keys memory k = _keys();
        Suite memory s = _load();
        _commit(s, k, 3, _vector(1500, 500));
    }

    /// Phase 4 (a few seconds later): finalize, settle, claim, split fees, claim staking rewards.
    function p4() external {
        Keys memory k = _keys();
        Suite memory s = _load();
        address deployer = vm.addr(k.deployer);

        vm.startBroadcast(k.keeper);
        s.oracle.finalize(3);
        s.market.settle(1);
        vm.stopBroadcast();

        vm.startBroadcast(k.deployer);
        uint256 payout = s.market.claim(1);
        s.feeRouter.distribute();
        uint256 reward = s.staking.claim();
        vm.stopBroadcast();

        // the A side (deployer) won: it receives both nets, the fee went to the router and was split
        require(payout > BET, "winner payout missing");
        require(reward > 0 || s.staking.pendingReward(deployer) == 0, "staking reward not claimed");
    }

    // --- helpers -------------------------------------------------------------------------------

    function _commit(Suite memory s, Keys memory k, uint32 epochId, uint16[] memory iVec) internal {
        int32[] memory vVec = new int32[](10);
        IOracleCommit.Attestation[] memory atts = new IOracleCommit.Attestation[](3);
        bytes32 digest = s.oracle.hashAttestation(epochId, DATASET, CONFIG, iVec, vVec);
        for (uint256 i = 0; i < 3; i++) {
            (uint8 v, bytes32 r, bytes32 sg) = vm.sign(k.validators[i], digest);
            atts[i] = IOracleCommit.Attestation({
                validator: vm.addr(k.validators[i]),
                i: iVec,
                v: vVec,
                sig: abi.encodePacked(r, sg, v)
            });
        }
        vm.startBroadcast(k.operator);
        s.oracle.commit(epochId, 1, DATASET, CONFIG, bytes32(0), iVec, vVec, atts);
        vm.stopBroadcast();
    }

    function _vector(uint16 first, uint16 second) internal pure returns (uint16[] memory v) {
        v = new uint16[](10);
        v[0] = first;
        v[1] = second;
        uint16 rest = uint16(10_000 - first - second);
        for (uint256 i = 2; i < 10; i++) {
            v[i] = rest / 8;
        }
        v[9] += rest - (rest / 8) * 8;
    }
}
