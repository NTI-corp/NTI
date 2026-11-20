// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";

import {BasketFactory} from "../src/BasketFactory.sol";
import {BuybackAdapterV3} from "../src/BuybackAdapterV3.sol";
import {BuybackAdapterV4} from "../src/BuybackAdapterV4.sol";
import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {Dispute} from "../src/Dispute.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Grants} from "../src/Grants.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {KOLRegistry} from "../src/KOLRegistry.sol";
import {NTIGovernor} from "../src/NTIGovernor.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITimelock} from "../src/NTITimelock.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @title DeployMainnet
/// @notice Deploys and wires the production NTI protocol suite onto Robinhood Chain Mainnet (4663).
///         NEVER deploys NTITestToken. Writes contracts/deployments/4663.json.
contract DeployMainnet is Script {
    // Verified Robinhood Chain Mainnet (4663) external dependencies
    address internal constant MAINNET_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant MAINNET_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address internal constant MAINNET_V3_SWAP_ROUTER02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address internal constant MAINNET_UNIVERSAL_ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant MAINNET_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant MAINNET_STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;
    address internal constant MAINNET_PONS_V2_MEME_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;

    uint48 internal constant DEFAULT_VOTING_DELAY = 1; // 1 block
    uint32 internal constant DEFAULT_VOTING_PERIOD = 21_600; // ~3 days: Staking.clock() is block.number, which on Arbitrum Orbit is the ~12s parent-chain block
    uint8 internal constant INITIAL_NARRATIVE_COUNT = 10;

    struct Deployed {
        address registry;
        address ntiToken;
        address staking;
        address configRegistry;
        address oracleCommit;
        address dispute;
        address insuranceFund;
        address grants;
        address feeRouter;
        address buybackAdapterV3;
        address buybackAdapterV4;
        address narrativeMarket;
        address basketFactory;
        address kolRegistry;
        address timelock;
        address governor;
    }

    function run() external returns (Deployed memory d) {
        require(block.chainid == 4663, "mainnet only");
        // msg.sender is the broadcaster (--private-key / --account). Roles are granted to DEPLOYER_ADDRESS,
        // so a mismatch would leave the suite owned by an address that cannot administer it.
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(msg.sender == deployer, "broadcaster != DEPLOYER_ADDRESS");
        _requireCode(MAINNET_WETH, "WETH");
        _requireCode(MAINNET_V3_FACTORY, "V3 factory");
        _requireCode(MAINNET_V3_SWAP_ROUTER02, "V3 router");
        _requireCode(MAINNET_UNIVERSAL_ROUTER, "universal router");
        _requireCode(MAINNET_PERMIT2, "permit2");
        _requireCode(MAINNET_STATE_VIEW, "state view");
        _requireCode(MAINNET_PONS_V2_MEME_HOOK, "pons hook");

        address operator = vm.envAddress("OPERATOR_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        address val1 = vm.envAddress("VALIDATOR_1_ADDRESS");
        address val2 = vm.envAddress("VALIDATOR_2_ADDRESS");
        address val3 = vm.envAddress("VALIDATOR_3_ADDRESS");

        // Optional: if live $NTI CA is already known at deploy time, attach immediately.
        address ntiToken = vm.envOr("NTI_TOKEN_ADDRESS", address(0));
        uint64 genesisTs = uint64(vm.envOr("ORACLE_GENESIS_TIMESTAMP", uint256(0)));
        // Must equal the canonical hash of config/nti.v1.json (see infra/scripts/mainnet-preflight.py),
        // otherwise OracleCommit.commit reverts with ConfigHashMismatch. No default on purpose.
        bytes32 initConfigHash = vm.envBytes32("INITIAL_CONFIG_HASH");
        require(initConfigHash != bytes32(0), "INITIAL_CONFIG_HASH required");

        vm.startBroadcast();

        // Step 1: NTIRegistry -> Staking -> ConfigRegistry -> OracleCommit -> Dispute
        NTIRegistry registry = new NTIRegistry(deployer, MAINNET_WETH);
        Staking staking = new Staking(address(registry), deployer, pauser);
        ConfigRegistry configRegistry = new ConfigRegistry(deployer);
        OracleCommit oracleCommit =
            new OracleCommit(address(staking), address(configRegistry), genesisTs, deployer, pauser);
        Dispute dispute = new Dispute(
            address(registry), address(oracleCommit), address(staking), deployer, pauser
        );

        // Step 2: InsuranceFund -> Grants -> FeeRouter -> BuybackAdapters -> NarrativeMarket -> BasketFactory -> KOLRegistry
        InsuranceFund insuranceFund = new InsuranceFund(deployer);
        Grants grants = new Grants(address(staking), deployer, keeper, pauser);
        FeeRouter feeRouter = new FeeRouter(
            address(registry),
            address(staking),
            address(grants),
            address(insuranceFund),
            deployer,
            keeper,
            pauser
        );

        BuybackAdapterV3 adapterV3 = new BuybackAdapterV3(
            MAINNET_WETH, MAINNET_V3_SWAP_ROUTER02, MAINNET_V3_FACTORY, 3000
        );
        BuybackAdapterV4 adapterV4 = new BuybackAdapterV4(
            MAINNET_WETH,
            MAINNET_UNIVERSAL_ROUTER,
            MAINNET_PERMIT2,
            MAINNET_STATE_VIEW,
            MAINNET_PONS_V2_MEME_HOOK
        );

        NarrativeMarket narrativeMarket = new NarrativeMarket(
            address(oracleCommit), address(staking), address(feeRouter), deployer, pauser
        );
        BasketFactory basketFactory = new BasketFactory(
            address(registry), MAINNET_V3_SWAP_ROUTER02, address(feeRouter), deployer
        );
        KOLRegistry kolRegistry = new KOLRegistry(deployer, attester);

        // Step 3: NTITimelock -> NTIGovernor
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        NTITimelock timelock = new NTITimelock(proposers, executors, deployer);
        NTIGovernor governor = new NTIGovernor(
            staking, timelock, DEFAULT_VOTING_DELAY, DEFAULT_VOTING_PERIOD, 50_000e18
        );

        // Step 4: Wire dependencies, roles, and initial config (buybackAdapter stays address(0) until $NTI graduates)
        registry.setStaking(address(staking));
        if (ntiToken != address(0)) {
            registry.setNti(ntiToken);
        }

        staking.grantRole(staking.SLASHER_ROLE(), address(oracleCommit));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));

        oracleCommit.grantRole(oracleCommit.DISPUTE_ROLE(), address(dispute));
        oracleCommit.grantRole(oracleCommit.OPERATOR_ROLE(), operator);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val1);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val2);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val3);

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        configRegistry.setConfig(initConfigHash, INITIAL_NARRATIVE_COUNT, 1);

        vm.stopBroadcast();

        d.registry = address(registry);
        d.ntiToken = ntiToken;
        d.staking = address(staking);
        d.configRegistry = address(configRegistry);
        d.oracleCommit = address(oracleCommit);
        d.dispute = address(dispute);
        d.insuranceFund = address(insuranceFund);
        d.grants = address(grants);
        d.feeRouter = address(feeRouter);
        d.buybackAdapterV3 = address(adapterV3);
        d.buybackAdapterV4 = address(adapterV4);
        d.narrativeMarket = address(narrativeMarket);
        d.basketFactory = address(basketFactory);
        d.kolRegistry = address(kolRegistry);
        d.timelock = address(timelock);
        d.governor = address(governor);

        _writeManifest(d);
    }

    function _requireCode(address target, string memory label) internal view {
        require(target.code.length > 0, string.concat("no bytecode at ", label));
    }

    function _writeManifest(Deployed memory d) internal {
        string memory key = "deployments";
        vm.serializeAddress(key, "registry", d.registry);
        vm.serializeAddress(key, "ntiToken", d.ntiToken);
        vm.serializeAddress(key, "staking", d.staking);
        vm.serializeAddress(key, "configRegistry", d.configRegistry);
        vm.serializeAddress(key, "oracleCommit", d.oracleCommit);
        vm.serializeAddress(key, "dispute", d.dispute);
        vm.serializeAddress(key, "insuranceFund", d.insuranceFund);
        vm.serializeAddress(key, "grants", d.grants);
        vm.serializeAddress(key, "feeRouter", d.feeRouter);
        vm.serializeAddress(key, "buybackAdapterV3", d.buybackAdapterV3);
        vm.serializeAddress(key, "buybackAdapterV4", d.buybackAdapterV4);
        vm.serializeAddress(key, "narrativeMarket", d.narrativeMarket);
        vm.serializeAddress(key, "basketFactory", d.basketFactory);
        vm.serializeAddress(key, "kolRegistry", d.kolRegistry);
        vm.serializeAddress(key, "timelock", d.timelock);
        string memory json = vm.serializeAddress(key, "governor", d.governor);

        vm.writeJson(json, "deployments/4663.json");
    }
}
