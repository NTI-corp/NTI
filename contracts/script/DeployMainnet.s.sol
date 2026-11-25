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
import {NTIPrelaunchToken} from "../src/NTIPrelaunchToken.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @title DeployMainnet
/// @notice Deploys and wires the NTI protocol suite onto Robinhood Chain Mainnet (4663) and writes
///         contracts/deployments/4663.json.
///
///         Launch shape: no Timelock and no Governor (the admin wallet changes parameters directly) and no
///         locked timings, so every window stays adjustable. The token is a prelaunch stand-in (`pNTI`, with a
///         faucet) unless NTI_TOKEN_ADDRESS is already set; `SwapTokenMainnet` swaps in the real token once it
///         launches on Pons.
contract DeployMainnet is Script {
    // Verified Robinhood Chain Mainnet (4663) external dependencies
    address internal constant MAINNET_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant MAINNET_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address internal constant MAINNET_V3_SWAP_ROUTER02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address internal constant MAINNET_UNIVERSAL_ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant MAINNET_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant MAINNET_STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;
    address internal constant MAINNET_PONS_V2_MEME_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;

    uint8 internal constant INITIAL_NARRATIVE_COUNT = 10;

    // Short windows: nothing waits on a long timer. The 1 hour commit delay is not a safety timer: it is the
    // time the X scrape needs to finish before an epoch can be committed.
    uint64 internal constant COMMIT_DELAY = 60 minutes;
    uint64 internal constant DISPUTE_WINDOW = 5 seconds;
    uint64 internal constant INCOMPLETE_DELAY = 4 hours;
    uint64 internal constant DISPUTE_RESOLUTION_WINDOW = 10 minutes;
    uint64 internal constant UNSTAKE_COOLDOWN = 10 seconds;

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
    }

    function run() external returns (Deployed memory d) {
        require(block.chainid == 4663, "mainnet only");
        // msg.sender is the broadcaster (--private-key / --account). Roles are granted to DEPLOYER_ADDRESS,
        // so a mismatch would leave the suite owned by an address that cannot administer it.
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(_broadcaster() == deployer, "broadcaster != DEPLOYER_ADDRESS");
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

        // Empty means: deploy the prelaunch token. Set means: the real token already exists.
        address ntiToken = vm.envOr("NTI_TOKEN_ADDRESS", address(0));
        uint64 genesisTs = uint64(vm.envOr("ORACLE_GENESIS_TIMESTAMP", uint256(0)));
        // Must equal the canonical hash of config/nti.v1.json (printed by mainnet_preflight.py), otherwise
        // OracleCommit.commit reverts with ConfigHashMismatch. No default on purpose.
        bytes32 initConfigHash = vm.envBytes32("INITIAL_CONFIG_HASH");
        require(initConfigHash != bytes32(0), "INITIAL_CONFIG_HASH required");

        vm.startBroadcast();

        // Step 1: NTIRegistry -> Staking -> ConfigRegistry -> OracleCommit -> Dispute
        NTIRegistry registry = new NTIRegistry(deployer, MAINNET_WETH);
        if (ntiToken == address(0)) {
            ntiToken = address(new NTIPrelaunchToken(deployer));
        }
        Staking staking = new Staking(address(registry), deployer, pauser);
        ConfigRegistry configRegistry = new ConfigRegistry(deployer);
        OracleCommit oracleCommit =
            new OracleCommit(address(staking), address(configRegistry), genesisTs, deployer, pauser);
        Dispute dispute = new Dispute(address(registry), address(oracleCommit), address(staking), deployer, pauser);

        // Step 2: InsuranceFund -> Grants -> FeeRouter -> BuybackAdapters -> NarrativeMarket -> BasketFactory -> KOLRegistry
        InsuranceFund insuranceFund = new InsuranceFund(deployer);
        Grants grants = new Grants(address(staking), deployer, keeper, pauser);
        FeeRouter feeRouter = new FeeRouter(
            address(registry), address(staking), address(grants), address(insuranceFund), deployer, keeper, pauser
        );

        BuybackAdapterV3 adapterV3 =
            new BuybackAdapterV3(MAINNET_WETH, MAINNET_V3_SWAP_ROUTER02, MAINNET_V3_FACTORY, 3000);
        BuybackAdapterV4 adapterV4 = new BuybackAdapterV4(
            MAINNET_WETH, MAINNET_UNIVERSAL_ROUTER, MAINNET_PERMIT2, MAINNET_STATE_VIEW, MAINNET_PONS_V2_MEME_HOOK
        );

        NarrativeMarket narrativeMarket =
            new NarrativeMarket(address(oracleCommit), address(staking), address(feeRouter), deployer, pauser);
        BasketFactory basketFactory =
            new BasketFactory(address(registry), MAINNET_V3_SWAP_ROUTER02, address(feeRouter), deployer);
        KOLRegistry kolRegistry = new KOLRegistry(deployer, attester);

        // Step 3: wire dependencies and roles (buybackAdapter stays address(0) until the real token's pool is live).
        // The registry is NOT frozen: the prelaunch token is swapped out by SwapTokenMainnet at launch.
        registry.setStaking(address(staking));
        registry.setNti(ntiToken);

        staking.grantRole(staking.SLASHER_ROLE(), address(oracleCommit));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));

        oracleCommit.grantRole(oracleCommit.DISPUTE_ROLE(), address(dispute));
        oracleCommit.grantRole(oracleCommit.OPERATOR_ROLE(), operator);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val1);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val2);
        oracleCommit.grantRole(oracleCommit.VALIDATOR_ROLE(), val3);

        configRegistry.setConfig(initConfigHash, INITIAL_NARRATIVE_COUNT, 1);

        // Short windows, left unlocked so the admin can still adjust them.
        oracleCommit.setTimings(COMMIT_DELAY, DISPUTE_WINDOW, INCOMPLETE_DELAY);
        dispute.setResolutionWindow(DISPUTE_RESOLUTION_WINDOW);
        staking.setCooldownDuration(UNSTAKE_COOLDOWN);

        vm.stopBroadcast();

        _selfCheck(registry, staking, oracleCommit, dispute, deployer, pauser, operator, val1, val2, val3, ntiToken);

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

        _writeManifest(d);
    }

    /// @dev Reads the freshly deployed suite back and reverts the whole script run (before the manifest is
    ///      written) if any wiring, role or timing is not what the runbook promises.
    function _selfCheck(
        NTIRegistry registry,
        Staking staking,
        OracleCommit oracleCommit,
        Dispute dispute,
        address deployer,
        address pauser,
        address operator,
        address val1,
        address val2,
        address val3,
        address ntiToken
    ) internal view {
        require(registry.staking() == address(staking), "check: registry.staking");
        require(registry.nti() == ntiToken, "check: registry.nti");
        require(!registry.frozen(), "check: registry frozen");
        require(registry.owner() == deployer, "check: registry owner");
        require(staking.hasRole(staking.SLASHER_ROLE(), address(oracleCommit)), "check: slasher oracle");
        require(staking.hasRole(staking.SLASHER_ROLE(), address(dispute)), "check: slasher dispute");
        require(staking.hasRole(staking.PAUSER_ROLE(), pauser), "check: staking pauser");
        require(oracleCommit.hasRole(oracleCommit.DISPUTE_ROLE(), address(dispute)), "check: dispute role");
        require(oracleCommit.hasRole(oracleCommit.OPERATOR_ROLE(), operator), "check: operator role");
        require(oracleCommit.hasRole(oracleCommit.VALIDATOR_ROLE(), val1), "check: validator 1");
        require(oracleCommit.hasRole(oracleCommit.VALIDATOR_ROLE(), val2), "check: validator 2");
        require(oracleCommit.hasRole(oracleCommit.VALIDATOR_ROLE(), val3), "check: validator 3");
        require(oracleCommit.hasRole(oracleCommit.PAUSER_ROLE(), pauser), "check: oracle pauser");
        require(!oracleCommit.hasRole(oracleCommit.OPERATOR_ROLE(), deployer), "check: deployer is operator");
        require(oracleCommit.DISPUTE_WINDOW() == DISPUTE_WINDOW, "check: dispute window");
        require(oracleCommit.COMMIT_DELAY() == COMMIT_DELAY, "check: commit delay");
        require(staking.COOLDOWN_DURATION() == UNSTAKE_COOLDOWN, "check: cooldown");
        require(!oracleCommit.timingsLocked(), "check: oracle timings locked");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
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
        // No governance on this deployment: the fields stay so readers keep one manifest shape.
        vm.serializeAddress(key, "governor", address(0));
        vm.serializeAddress(key, "timelock", address(0));
        vm.serializeAddress(key, "deployer", _broadcaster());
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployedAtTimestamp", block.timestamp);
        string memory json = vm.serializeUint(key, "deployedAtBlock", block.number);

        // DEPLOY_MANIFEST lets tests write somewhere harmless; the default is the manifest the services read.
        vm.writeJson(json, vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
    }
}
