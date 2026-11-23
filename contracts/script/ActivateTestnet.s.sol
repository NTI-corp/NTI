// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Basket} from "../src/Basket.sol";
import {Grants} from "../src/Grants.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @notice Populates the live Robinhood Chain Testnet (46630) protocol contracts with real
///         on-chain activity so /markets, /baskets, /grants, and /stake are 100% live & interactive.
///         Testnet only: refuses to run on any chain other than 46630.
contract ActivateTestnet is Script {
    address internal constant NTI_TOKEN = 0x70fcb6fCB8CB2465D1Ddab93022957B6d5750AB3;
    address internal constant STAKING = 0x81CEE008B7b615218BE0f23EC77AaA790e74Ed04;
    address internal constant ORACLE = 0xa95D0A16f208CFe1BD661d483c18eAfc564e3fE9;
    address internal constant MARKET = 0x2602Ad6Cc4a46dc857EEEaF0f16da7A55f3eb7B9;
    address internal constant BASKET_AI = 0xC8be93A7C23496d236F4B9d7F0cEE628FC9E2da0;
    address internal constant GRANTS = 0xFc64E92675F34957Cac5e0f71EEf969Af84D1378;

    function run() external {
        require(block.chainid == 46630, "testnet only");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        uint256 keeperKey = vm.envUint("KEEPER_PRIVATE_KEY");

        address deployer = vm.addr(deployerKey);
        address operator = vm.addr(operatorKey);

        Staking staking = Staking(payable(STAKING));
        OracleCommit oracle = OracleCommit(ORACLE);
        NarrativeMarket market = NarrativeMarket(payable(MARKET));
        Basket basket = Basket(payable(BASKET_AI));
        Grants grants = Grants(payable(GRANTS));

        uint32 baseEpoch = oracle.latestFinalEpoch();
        require(baseEpoch > 0, "no final epoch");
        uint32 settleEpoch7d = baseEpoch + 42;

        // 1. Deployer: stake tNTI (if needed), set testnet minBet, create 4 markets + Side A bets, deposit Basket, fund Grants
        vm.startBroadcast(deployerKey);

        uint256 currentStake = staking.stakeOf(deployer);
        if (currentStake < 250_000e18 && IERC20(NTI_TOKEN).balanceOf(deployer) >= 250_000e18) {
            IERC20(NTI_TOKEN).approve(STAKING, 250_000e18);
            staking.stake(250_000e18);
        }

        if (!market.timingsLocked() && market.HORIZON_LONG() != 42) {
            market.setTimings(6, 42, 2, 48 hours);
        }

        if (market.minBet() > 0.0001 ether) {
            market.setRiskParams(0.0001 ether, 5 ether, 20, 50 ether);
        }

        uint256 m1;
        uint256 m2;
        uint256 m3;
        uint256 m4;
        if (market.nextMarketId() == 1) {
            m1 = market.createMarket(2, 8, settleEpoch7d); // AI Agents vs DeFi
            m2 = market.createMarket(1, 3, settleEpoch7d); // Privacy vs RWA
            m3 = market.createMarket(9, 7, settleEpoch7d); // Memecoin vs Perp DEX
            m4 = market.createMarket(4, 6, settleEpoch7d); // Stablecoins vs Prediction Markets

            market.bet{value: 0.00015 ether}(m1, 0);
            market.bet{value: 0.00012 ether}(m2, 0);
            market.bet{value: 0.00010 ether}(m3, 0);
            market.bet{value: 0.00010 ether}(m4, 0);
        }

        if (basket.totalSupply() == 0) {
            basket.deposit{value: 0.0003 ether}(0);
        }

        if (GRANTS.balance < 0.0002 ether) {
            (bool ok,) = payable(GRANTS).call{value: 0.0003 ether}("");
            require(ok, "fund grants failed");
        }

        vm.stopBroadcast();

        // 2. Operator: take Side B on all 4 markets so every pool has real two-sided liquidity
        if (m1 > 0) {
            vm.startBroadcast(operatorKey);
            market.bet{value: 0.00012 ether}(m1, 1);
            market.bet{value: 0.00015 ether}(m2, 1);
            market.bet{value: 0.00014 ether}(m3, 1);
            market.bet{value: 0.00011 ether}(m4, 1);
            vm.stopBroadcast();
        }

        // 3. Keeper: start Grants Round #1 (7-day voting window)
        if (grants.currentRoundId() == 0) {
            vm.startBroadcast(keeperKey);
            grants.startRound(7 days);
            vm.stopBroadcast();
        }

        // 4. Deployer: submit 3 ecosystem builder grant proposals into Round #1
        if (grants.currentRoundId() > 0) {
            vm.startBroadcast(deployerKey);
            grants.submitProposal(keccak256("NTI-GRANT-R1: AI Agents On-Chain Index SDK & Subgraph"), deployer);
            grants.submitProposal(keccak256("NTI-GRANT-R1: Robinhood Chain Privacy Narrative Analytics"), operator);
            grants.submitProposal(keccak256("NTI-GRANT-R1: Open-Source Independent Epoch Verifier CLI"), deployer);
            vm.stopBroadcast();
        }
    }
}
