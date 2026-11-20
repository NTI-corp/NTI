// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {Basket} from "../src/Basket.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {BuybackAdapterV3} from "../src/BuybackAdapterV3.sol";
import {NTIGovernor} from "../src/NTIGovernor.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {Staking} from "../src/Staking.sol";
import {Grants} from "../src/Grants.sol";
import {
    TestnetMockToken,
    TestnetV3Pool,
    TestnetV3Factory,
    TestnetSwapRouter02
} from "./mocks/TestnetMocks.sol";

/// @notice Completes the Robinhood Testnet (46630) suite with what the base deployment could not provide
///         because Uniswap V3 and Pons are absent on that chain:
///           1. Mock V3 factory, router and pools, plus the buyback adapter wired into the registry.
///           2. A fresh BasketFactory and Basket (the router is immutable) with whitelisted mock constituents.
///           3. A fast-parameter Timelock and Governor so governance can be exercised end to end.
///         Testnet only: refuses to run on any other chain.
contract DeployTestnetFinalize is Script {
    uint24 internal constant POOL_FEE = 3000;
    uint128 internal constant POOL_LIQUIDITY = 1_000 ether;

    function run() external {
        require(block.chainid == 46630, "testnet only");
        string memory json = vm.readFile("deployments/46630.json");
        address registryAddr = vm.parseJsonAddress(json, ".registry");
        address nti = vm.parseJsonAddress(json, ".ntiToken");
        address stakingAddr = vm.parseJsonAddress(json, ".staking");
        address feeRouter = vm.parseJsonAddress(json, ".feeRouter");
        address grantsAddr = vm.parseJsonAddress(json, ".grants");

        address deployer = msg.sender;
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);
        address pauser = vm.envOr("PAUSER_ADDRESS", deployer);
        NTIRegistry registry = NTIRegistry(registryAddr);
        address weth = registry.weth();

        vm.startBroadcast();

        // 1. Mock V3 stack
        TestnetV3Factory v3Factory = new TestnetV3Factory();
        TestnetSwapRouter02 router = new TestnetSwapRouter02();

        TestnetV3Pool ntiPool = new TestnetV3Pool(nti, weth, POOL_FEE, POOL_LIQUIDITY, 0, 100);
        v3Factory.setPool(weth, nti, POOL_FEE, address(ntiPool));
        IERC20(nti).transfer(address(router), 50_000_000e18);

        BuybackAdapterV3 adapter = new BuybackAdapterV3(weth, address(router), address(v3Factory), POOL_FEE);
        registry.setBuybackAdapter(address(adapter));

        // 2. Basket stack (AI Agents narrative = 2)
        TestnetMockToken[3] memory toks = [
            new TestnetMockToken("Testnet Agent Alpha", "tAGA"),
            new TestnetMockToken("Testnet Agent Beta", "tAGB"),
            new TestnetMockToken("Testnet Agent Gamma", "tAGC")
        ];
        BasketFactory basketFactory = new BasketFactory(registryAddr, address(router), feeRouter, deployer);
        address basketAddr = basketFactory.createBasket(2, "NTI AI Agents Vault", "nAI", deployer, keeper, pauser);
        Basket basket = Basket(payable(basketAddr));

        address[] memory tokens = new address[](3);
        uint16[] memory weights = new uint16[](3);
        weights[0] = 4000;
        weights[1] = 3000;
        weights[2] = 3000;
        for (uint256 i = 0; i < 3; i++) {
            tokens[i] = address(toks[i]);
            TestnetV3Pool pool = new TestnetV3Pool(address(toks[i]), weth, POOL_FEE, POOL_LIQUIDITY, 0, 100);
            v3Factory.setPool(weth, address(toks[i]), POOL_FEE, address(pool));
            IERC20(address(toks[i])).transfer(address(router), 500_000_000e18);
            basket.whitelistToken(address(toks[i]), address(pool), POOL_FEE);
        }
        basket.setInitialAllocation(tokens, weights);

        // 3. Fast governance: 60s timelock, 50-block vote on the parent-chain clock used by Staking
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock = new TimelockController(60, proposers, executors, deployer);
        NTIGovernor governor = new NTIGovernor(Staking(stakingAddr), timelock, 1, 50, 0);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        Grants(payable(grantsAddr)).grantRole(Grants(payable(grantsAddr)).DEFAULT_ADMIN_ROLE(), address(timelock));

        vm.stopBroadcast();

        string memory key = "finalize";
        vm.serializeAddress(key, "v3Factory", address(v3Factory));
        vm.serializeAddress(key, "swapRouter", address(router));
        vm.serializeAddress(key, "buybackAdapterV3", address(adapter));
        vm.serializeAddress(key, "basketFactory", address(basketFactory));
        vm.serializeAddress(key, "basket", basketAddr);
        vm.serializeAddress(key, "mockToken0", tokens[0]);
        vm.serializeAddress(key, "mockToken1", tokens[1]);
        vm.serializeAddress(key, "mockToken2", tokens[2]);
        vm.serializeAddress(key, "timelock", address(timelock));
        string memory out = vm.serializeAddress(key, "governor", address(governor));
        vm.writeJson(out, "deployments/46630.finalize.json");
    }
}
