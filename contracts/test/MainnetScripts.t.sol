// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DeployMainnet} from "../script/DeployMainnet.s.sol";
import {AttachTokenMainnet} from "../script/AttachTokenMainnet.s.sol";
import {HandoverMainnet} from "../script/HandoverMainnet.s.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";
import {NTITimelock} from "../src/NTITimelock.sol";

address constant DEFAULT_SENDER = 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38;

contract DeployHarness is DeployMainnet {
    function _broadcaster() internal pure override returns (address) {
        return DEFAULT_SENDER;
    }
}

contract AttachHarness is AttachTokenMainnet {
    function _broadcaster() internal pure override returns (address) {
        return DEFAULT_SENDER;
    }
}

contract HandoverHarness is HandoverMainnet {
    function _broadcaster() internal pure override returns (address) {
        return DEFAULT_SENDER;
    }
}

contract SupplyToken is ERC20 {
    constructor(uint256 supply) ERC20("NTI", "NTI") {
        _mint(msg.sender, supply);
    }
}

/// @notice Runs the real mainnet deploy, token attach and handover scripts against a local chain whose id is
///         set to 4663 and whose external dependencies are stand-in contracts. The manifest goes to a temp
///         file, never to deployments/4663.json.
contract MainnetScriptsTest is Test {
    string internal constant MANIFEST = "deployments/4663.test.json";

    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address internal constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address internal constant V3_ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address internal constant UNIVERSAL_ROUTER = 0x8876789976dEcBfCbBbe364623C63652db8C0904;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant STATE_VIEW = 0xF3334192D15450CdD385c8B70e03f9A6bD9E673b;
    address internal constant PONS_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;

    // Broadcast calls inside forge test come from the default sender, so it plays the deployer.
    address internal deployer = DEFAULT_SENDER;
    address internal safe;

    function setUp() public {
        vm.chainId(4663);
        address[7] memory externals = [WETH, V3_FACTORY, V3_ROUTER, UNIVERSAL_ROUTER, PERMIT2, STATE_VIEW, PONS_HOOK];
        for (uint256 i = 0; i < externals.length; i++) {
            vm.etch(externals[i], hex"6001600055");
        }
        safe = makeAddr("safe");
        vm.etch(safe, hex"6001600055");

        vm.setEnv("DEPLOY_MANIFEST", MANIFEST);
        vm.setEnv("DEPLOYER_ADDRESS", vm.toString(deployer));
        vm.setEnv("OPERATOR_ADDRESS", vm.toString(makeAddr("operator")));
        vm.setEnv("KEEPER_ADDRESS", vm.toString(makeAddr("keeper")));
        vm.setEnv("ATTESTER_ADDRESS", vm.toString(makeAddr("attester")));
        vm.setEnv("PAUSER_ADDRESS", vm.toString(safe));
        vm.setEnv("VALIDATOR_1_ADDRESS", vm.toString(makeAddr("v1")));
        vm.setEnv("VALIDATOR_2_ADDRESS", vm.toString(makeAddr("v2")));
        vm.setEnv("VALIDATOR_3_ADDRESS", vm.toString(makeAddr("v3")));
        vm.setEnv("INITIAL_CONFIG_HASH", "0x07acec1d77949027e6ba95a4ec7b43ce380fb70efd317e79d0f024e4afc8c297");
        vm.setEnv("ORACLE_GENESIS_TIMESTAMP", "0");
        vm.setEnv("SAFE_ADDRESS", vm.toString(safe));
        vm.setEnv("HANDOVER_CONFIRM", "TRANSFER_ADMIN_TO_TIMELOCK");
        vm.setEnv("BUYBACK_ADAPTER", "0x0000000000000000000000000000000000000000");
    }

    function tearDown() public {
        if (vm.exists(MANIFEST)) vm.removeFile(MANIFEST);
    }

    function _deploy() internal {
        DeployMainnet script = new DeployHarness();
        script.run();
    }

    function test_deploy_refuses_a_chain_that_is_not_mainnet() public {
        vm.chainId(46630);
        DeployMainnet script = new DeployHarness();
        vm.expectRevert(bytes("mainnet only"));
        script.run();
    }

    /// @dev One test on purpose: the scripts read process-wide env vars and one shared manifest file, so
    ///      separate tests would race under forge's parallel runner.
    function test_deploy_attach_handover_sequence() public {
        vm.roll(777);
        _deploy();
        string memory deployed = vm.readFile(MANIFEST);
        assertEq(vm.parseJsonUint(deployed, ".chainId"), 4663);
        assertEq(vm.parseJsonUint(deployed, ".deployedAtBlock"), 777);
        assertEq(vm.parseJsonAddress(deployed, ".deployer"), deployer);

        OracleCommit oracle = OracleCommit(vm.parseJsonAddress(deployed, ".oracleCommit"));
        assertTrue(oracle.timingsLocked());
        assertEq(oracle.DISPUTE_WINDOW(), 2 hours);
        assertTrue(oracle.hasRole(oracle.OPERATOR_ROLE(), makeAddr("operator")));
        assertFalse(oracle.hasRole(oracle.OPERATOR_ROLE(), deployer));
        assertEq(NTIRegistry(vm.parseJsonAddress(deployed, ".registry")).owner(), deployer);

        // The handover is refused until the token is attached and the registry is frozen.
        HandoverMainnet early = new HandoverHarness();
        vm.expectRevert(bytes("attach the token and freeze the registry first"));
        early.run();

        // A token with the wrong supply is refused (env is process-wide, so this stays in one test).
        SupplyToken wrong = new SupplyToken(42e18);
        vm.setEnv("NTI_TOKEN_ADDRESS", vm.toString(address(wrong)));
        AttachTokenMainnet refused = new AttachHarness();
        vm.expectRevert(bytes("token supply != expected"));
        refused.run();

        SupplyToken token = new SupplyToken(1_000_000_000e18);
        vm.setEnv("NTI_TOKEN_ADDRESS", vm.toString(address(token)));
        AttachTokenMainnet attach = new AttachHarness();
        attach.run();

        HandoverMainnet handover = new HandoverHarness();
        handover.run();

        string memory json = vm.readFile(MANIFEST);
        NTITimelock timelock = NTITimelock(payable(vm.parseJsonAddress(json, ".timelock")));
        Staking staking = Staking(vm.parseJsonAddress(json, ".staking"));
        NTIRegistry registry = NTIRegistry(vm.parseJsonAddress(json, ".registry"));

        assertTrue(staking.hasRole(0x00, address(timelock)));
        assertFalse(staking.hasRole(0x00, deployer));
        assertFalse(timelock.hasRole(0x00, deployer));
        assertEq(registry.pendingOwner(), safe);

        vm.prank(safe);
        registry.acceptOwnership();
        assertEq(registry.owner(), safe);
    }
}
