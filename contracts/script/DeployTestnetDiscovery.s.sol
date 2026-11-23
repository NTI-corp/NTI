// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {TestnetLaunchFactory, TestnetLaunchPool} from "./mocks/TestnetDiscovery.sol";

/// @notice Deploy once on Robinhood testnet. Discovery CLI also accepts the factory via env.
contract DeployTestnetDiscovery is Script {
    function run() external {
        require(block.chainid == 46630, "testnet only");
        vm.startBroadcast();
        TestnetLaunchFactory factory = new TestnetLaunchFactory();
        vm.stopBroadcast();
        string memory result = vm.serializeAddress("discovery", "discoveryFactory", address(factory));
        vm.writeJson(result, "deployments/46630.discovery.json");
    }
}

/// @notice Launch a labeled fixture and execute distinct trades to exercise the Heatmap activity gate.
contract SeedTestnetDiscovery is Script {
    function run() external {
        require(block.chainid == 46630, "testnet only");
        address factoryAddress = vm.envOr("DISCOVERY_TESTNET_FACTORY_ADDRESS", address(0));
        if (factoryAddress == address(0)) {
            string memory json = vm.readFile("deployments/46630.discovery.json");
            factoryAddress = vm.parseJsonAddress(json, ".discoveryFactory");
        }
        uint256 narrative = vm.envUint("DISCOVERY_TESTNET_NARRATIVE_ID");
        require(narrative > 0 && narrative <= 32, "invalid narrative id");
        uint256 liquidity = vm.envOr("DISCOVERY_TESTNET_LIQUIDITY_WEI", uint256(1 ether));
        require(liquidity >= 1 ether, "Radar and Heatmap require at least 1 test ETH");
        uint256 trade = vm.envOr("DISCOVERY_TESTNET_TRADE_WEI", uint256(0.00001 ether));
        string memory name = vm.envOr("DISCOVERY_TESTNET_TOKEN_NAME", string("Fixture"));
        string memory symbol = vm.envOr("DISCOVERY_TESTNET_TOKEN_SYMBOL", string("tNTI"));

        vm.startBroadcast();
        (address token, TestnetLaunchPool pool) =
            TestnetLaunchFactory(factoryAddress).launch{value: liquidity}(name, symbol, SafeCast.toUint8(narrative));
        for (uint256 i = 0; i < 10; i++) {
            pool.buy{value: trade}(1);
        }
        vm.stopBroadcast();
        vm.serializeAddress("discoveryFixture", "token", token);
        vm.serializeAddress("discoveryFixture", "pool", address(pool));
        string memory result = vm.serializeUint("discoveryFixture", "narrativeId", narrative);
        vm.writeJson(result, "deployments/46630.discovery-fixture.json");
    }
}
