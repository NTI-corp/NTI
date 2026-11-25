// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {BasketFactory} from "../src/BasketFactory.sol";

/// @title UpgradeMainnet
/// @notice Replaces the logic behind one protocol proxy without redeploying it: the proxy address, its storage
///         and every integration stay as they are. Run it from the admin wallet (the deployer).
///
///         Env:
///           UPGRADE_TARGET     manifest key of the proxy: registry, staking, configRegistry, oracleCommit,
///                              dispute, insuranceFund, grants, feeRouter, narrativeMarket, basketFactory,
///                              kolRegistry, or "baskets" to upgrade every basket at once (the beacon)
///           UPGRADE_ARTIFACT   forge artifact of the new implementation, for example "Staking.sol:Staking"
///           UPGRADE_CALLDATA   optional hex calldata run through the proxy right after the upgrade
///                              (a reinitializer for new storage); empty for none
///           DEPLOY_MANIFEST    default deployments/4663.json
///
///         The new code must keep the storage layout: append variables only (using the reserved gap), never
///         reorder or delete one. `forge inspect <Contract> storage-layout` shows both versions.
contract UpgradeMainnet is Script {
    function run() external {
        require(block.chainid == 4663, "mainnet only");
        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        string memory target = vm.envString("UPGRADE_TARGET");
        string memory artifact = vm.envString("UPGRADE_ARTIFACT");
        bytes memory data = vm.envOr("UPGRADE_CALLDATA", bytes(""));

        bool baskets = keccak256(bytes(target)) == keccak256("baskets");
        address proxy = vm.parseJsonAddress(manifest, baskets ? ".basketFactory" : string.concat(".", target));
        require(proxy.code.length > 0, "no contract at the target proxy");

        vm.startBroadcast();
        address next = vm.deployCode(artifact);
        require(next.code.length > 0, "implementation deployment failed");
        if (baskets) {
            require(data.length == 0, "baskets have no upgrade calldata");
            BasketFactory(payable(proxy)).upgradeBasketImplementation(next);
        } else {
            UUPSUpgradeable(proxy).upgradeToAndCall(next, data);
        }
        vm.stopBroadcast();

        if (baskets) {
            require(BasketFactory(payable(proxy)).basketImplementation() == next, "check: beacon not updated");
        }
    }
}
