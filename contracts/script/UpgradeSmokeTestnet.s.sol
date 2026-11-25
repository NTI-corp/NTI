// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {ConfigRegistry} from "../src/ConfigRegistry.sol";

contract ConfigRegistryNext is ConfigRegistry {
    function version() external pure returns (uint256) {
        return 2;
    }
}

/// @notice Proves the UUPS upgrade flow on a real chain (Robinhood testnet 46630) with a throwaway ConfigRegistry:
///         deploy proxy, write state, upgrade to a new implementation, check the state survived and the new
///         function exists. Touches nothing of the live testnet suite.
contract UpgradeSmokeTestnet is Script {
    function run() external {
        require(block.chainid == 46630, "testnet only");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(key);

        vm.startBroadcast(key);
        ConfigRegistry cfg = ConfigRegistry(
            payable(deployProxy(address(new ConfigRegistry()), abi.encodeCall(ConfigRegistry.initialize, (admin))))
        );
        bytes32 hash = keccak256("upgrade-smoke");
        cfg.setConfig(hash, 10, 1);
        address next = address(new ConfigRegistryNext());
        UUPSUpgradeable(address(cfg)).upgradeToAndCall(next, "");
        vm.stopBroadcast();

        (bytes32 active, uint8 count) = cfg.active(1);
        require(active == hash && count == 10, "state lost in the upgrade");
        require(ConfigRegistryNext(address(cfg)).version() == 2, "new code not live");
        require(cfg.hasRole(0x00, admin), "admin lost");
    }
}
