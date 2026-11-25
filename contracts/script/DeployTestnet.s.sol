// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Basket} from "../src/Basket.sol";
import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Script} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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
import {NTITestToken} from "../src/NTITestToken.sol";
import {NTITimelock} from "../src/NTITimelock.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @notice Testnet-only WETH stand-in deployed when WETH_ADDRESS is not provided on chain 46630.
contract TestnetWETH is ERC20 {
    constructor() ERC20("Wrapped Ether (Testnet)", "WETH") {}

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        _burn(msg.sender, wad);
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "ETH transfer failed");
    }
}

/// @title DeployTestnet
/// @notice Deploys and wires the complete NTI protocol suite onto Robinhood Chain Testnet (46630)
///         in the exact order specified by NTI-Implementation-Plan.md and writes contracts/deployments/46630.json.
contract DeployTestnet is Script {
    // Verified Robinhood Chain Testnet (46630) V4 addresses
    address internal constant TESTNET_UNIVERSAL_ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant TESTNET_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant TESTNET_STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;

    uint48 internal constant DEFAULT_VOTING_DELAY = 1; // 1 block
    uint32 internal constant DEFAULT_VOTING_PERIOD = 21_600; // ~3 days: Staking.clock() is block.number, which on Arbitrum Orbit is the ~12s parent-chain block
    uint8 internal constant INITIAL_NARRATIVE_COUNT = 10;

    struct Deployed {
        address weth;
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
        address deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);
        address attester = vm.envOr("ATTESTER_ADDRESS", deployer);
        address pauser = vm.envOr("PAUSER_ADDRESS", deployer);
        address val1 = vm.envOr("VALIDATOR_1_ADDRESS", deployer);
        address val2 = vm.envOr("VALIDATOR_2_ADDRESS", address(0));
        address val3 = vm.envOr("VALIDATOR_3_ADDRESS", address(0));

        address wethAddr = vm.envOr("WETH_ADDRESS", address(0));
        address v3Router = vm.envOr("V3_SWAP_ROUTER02", address(0));
        address v3Factory = vm.envOr("V3_FACTORY", address(0));
        address ponsHook = vm.envOr("PONS_V2_MEME_HOOK", address(0));

        uint64 genesisTs = uint64(vm.envOr("ORACLE_GENESIS_TIMESTAMP", uint256(0)));
        bytes32 initConfigHash =
            vm.envOr("INITIAL_CONFIG_HASH", keccak256("nti-testnet-config-v1"));

        vm.startBroadcast();

        if (wethAddr == address(0)) {
            wethAddr = address(new TestnetWETH());
        }
        d.weth = wethAddr;

        // Step 1: NTIRegistry -> NTITestToken -> Staking -> ConfigRegistry -> OracleCommit -> Dispute
        NTIRegistry registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (deployer, wethAddr)))));
        NTITestToken testToken = new NTITestToken(deployer);
        Staking staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), deployer, pauser)))));
        ConfigRegistry configRegistry = ConfigRegistry(payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (deployer)))));
        OracleCommit oracleCommit =
            OracleCommit(payable(deployProxy(address(new OracleCommit()), abi.encodeCall(OracleCommit.initialize, (address(staking), address(configRegistry), genesisTs, deployer, pauser)))));
        Dispute dispute = Dispute(payable(deployProxy(address(new Dispute()), abi.encodeCall(Dispute.initialize, (address(registry), address(oracleCommit), address(staking), deployer, pauser)))));

        // Step 2: InsuranceFund -> Grants -> FeeRouter -> BuybackAdapters -> NarrativeMarket -> BasketFactory -> KOLRegistry
        InsuranceFund insuranceFund = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (deployer)))));
        Grants grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), deployer, keeper, pauser)))));
        FeeRouter feeRouter = FeeRouter(payable(deployProxy(address(new FeeRouter()), abi.encodeCall(FeeRouter.initialize, (address(registry),
            address(staking),
            address(grants),
            address(insuranceFund),
            deployer,
            keeper,
            pauser)))));

        if (v3Router != address(0) && v3Factory != address(0)) {
            d.buybackAdapterV3 = address(new BuybackAdapterV3(wethAddr, v3Router, v3Factory, 3000));
        }
        if (ponsHook != address(0)) {
            d.buybackAdapterV4 = address(
                new BuybackAdapterV4(
                    wethAddr, TESTNET_UNIVERSAL_ROUTER, TESTNET_PERMIT2, TESTNET_STATE_VIEW, ponsHook
                )
            );
        }

        NarrativeMarket narrativeMarket = NarrativeMarket(payable(deployProxy(address(new NarrativeMarket()), abi.encodeCall(NarrativeMarket.initialize, (address(oracleCommit), address(staking), address(feeRouter), deployer, pauser)))));
        address basketRouter = v3Router != address(0) ? v3Router : TESTNET_UNIVERSAL_ROUTER;
        BasketFactory basketFactory =
            BasketFactory(payable(deployProxy(address(new BasketFactory()), abi.encodeCall(BasketFactory.initialize, (address(registry), basketRouter, address(feeRouter), deployer, address(new Basket()))))));
        KOLRegistry kolRegistry = KOLRegistry(payable(deployProxy(address(new KOLRegistry()), abi.encodeCall(KOLRegistry.initialize, (deployer, attester)))));

        // Step 3: NTITimelock -> NTIGovernor
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // open execution once timelock delay elapses
        NTITimelock timelock = new NTITimelock(proposers, executors, deployer);
        NTIGovernor governor = new NTIGovernor(
            staking, timelock, DEFAULT_VOTING_DELAY, DEFAULT_VOTING_PERIOD, 0
        );

        // Step 4: Wire dependencies, roles, and initial config (deployer retains admin until freeze())
        registry.setStaking(address(staking));
        registry.setNti(address(testToken));

        staking.grantRole(staking.SLASHER_ROLE(), address(oracleCommit));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));

        oracleCommit.grantRole(oracleCommit.DISPUTE_ROLE(), address(dispute));
        oracleCommit.grantRole(oracleCommit.OPERATOR_ROLE(), operator);
        if (val1 != address(0)) oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val1);
        if (val2 != address(0)) oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val2);
        if (val3 != address(0)) oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val3);

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        configRegistry.setConfig(initConfigHash, INITIAL_NARRATIVE_COUNT, 1);

        // Testnet only: short waits so every flow can be exercised in minutes. Left unlocked.
        // Commit delay stays 60 minutes: it is the data-collection window, not a security wait.
        oracleCommit.setTimings(60 minutes, 2 minutes, 4 hours); // commit delay, dispute window, incomplete
        dispute.setResolutionWindow(30 minutes);
        staking.setCooldownDuration(5 minutes);
        narrativeMarket.setTimings(2, 6, 0, 1 hours); // short/long horizon (epochs), bet cutoff (epochs), timeout

        vm.stopBroadcast();

        d.registry = address(registry);
        d.ntiToken = address(testToken);
        d.staking = address(staking);
        d.configRegistry = address(configRegistry);
        d.oracleCommit = address(oracleCommit);
        d.dispute = address(dispute);
        d.insuranceFund = address(insuranceFund);
        d.grants = address(grants);
        d.feeRouter = address(feeRouter);
        d.narrativeMarket = address(narrativeMarket);
        d.basketFactory = address(basketFactory);
        d.kolRegistry = address(kolRegistry);
        d.timelock = address(timelock);
        d.governor = address(governor);

        _writeManifest(d);
    }

    function _writeManifest(Deployed memory d) internal {
        string memory key = "deployments";
        vm.serializeAddress(key, "weth", d.weth);
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

        vm.writeJson(json, "deployments/46630.json");
    }
}
