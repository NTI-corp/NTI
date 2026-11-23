// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {Basket} from "../src/Basket.sol";
import {Grants} from "../src/Grants.sol";

/// @notice Simulates real user on-chain interactions on Robinhood Testnet (46630):
///         1. Casts weighted quadratic/stake votes in live Grants Round #1 (50/30/20 across Proposals #1-#3).
///         2. Executes a live Basket deposit + partial redeem round-trip on nAI Vault.
contract SimulateUserFlowsTestnet is Script {
    address internal constant BASKET_AI = 0xC8be93A7C23496d236F4B9d7F0cEE628FC9E2da0;
    address internal constant GRANTS = 0xFc64E92675F34957Cac5e0f71EEf969Af84D1378;

    function run() external {
        require(block.chainid == 46630, "testnet only");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        Grants grants = Grants(payable(GRANTS));
        Basket basket = Basket(payable(BASKET_AI));

        vm.startBroadcast(deployerKey);

        // 1. Live Grants Vote in Round #1 (if not voted yet)
        if (!grants.hasVoted(1, deployer)) {
            uint256[] memory ids = new uint256[](3);
            ids[0] = 1;
            ids[1] = 2;
            ids[2] = 3;
            uint256[] memory weights = new uint256[](3);
            weights[0] = 5000;
            weights[1] = 3000;
            weights[2] = 2000;
            grants.vote(1, ids, weights);
        }

        // 2. Live Basket Deposit + Partial Redeem round-trip
        uint256 sharesBefore = basket.balanceOf(deployer);
        basket.deposit{value: 0.0001 ether}(0);
        uint256 sharesAfter = basket.balanceOf(deployer);
        require(sharesAfter > sharesBefore, "basket deposit did not mint shares");

        uint256 redeemShares = (sharesAfter - sharesBefore) / 2;
        uint256 ethBefore = deployer.balance;
        basket.redeem(redeemShares, 0);
        require(deployer.balance >= ethBefore, "basket redeem did not return ETH");

        vm.stopBroadcast();
    }
}
