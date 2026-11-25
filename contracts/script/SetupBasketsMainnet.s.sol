// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {BasketFactory} from "../src/BasketFactory.sol";
import {Basket} from "../src/Basket.sol";
import {INTIRegistry} from "../src/interfaces/INTIRegistry.sol";

interface IV3Factory {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

interface IPoolLiquidity {
    function liquidity() external view returns (uint128);
}

/// @title SetupBasketsMainnet
/// @notice Creates the narrative baskets listed in config/mainnet_baskets.json and whitelists every listed token
///         that passes the basket's own checks (WETH pair on Uniswap V3, liquidity floor, TWAP history). Safe to run
///         again: existing baskets and whitelisted tokens are skipped. A basket with fewer than three qualifying
///         tokens is not created because the per-token weight cap (40%) cannot be met.
///
///         Env: DEPLOY_MANIFEST (default deployments/4663.json), KEEPER_ADDRESS, PAUSER_ADDRESS (default deployer),
///         BASKETS_CONFIG (default ../config/mainnet_baskets.json).
contract SetupBasketsMainnet is Script {
    uint16 internal constant BPS = 10_000;
    uint16 internal constant MAX_WEIGHT = 4000;

    function run() external {
        require(block.chainid == 4663, "mainnet only");
        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        string memory cfg = vm.readFile(vm.envOr("BASKETS_CONFIG", string("../config/mainnet_baskets.json")));
        BasketFactory factory = BasketFactory(payable(vm.parseJsonAddress(manifest, ".basketFactory")));
        address weth = INTIRegistry(vm.parseJsonAddress(manifest, ".registry")).weth();
        IV3Factory v3 = IV3Factory(vm.parseJsonAddress(cfg, ".uniswapV3Factory"));
        uint256[] memory fees = vm.parseJsonUintArray(cfg, ".fees");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address pauser = vm.envOr("PAUSER_ADDRESS", deployer);
        uint256 count = _count(cfg);

        vm.startBroadcast();
        for (uint256 i = 0; i < count; i++) {
            _setup(factory, cfg, i, weth, v3, fees, keeper, deployer, pauser);
        }
        vm.stopBroadcast();
    }

    function _count(string memory cfg) internal view returns (uint256 n) {
        while (vm.keyExistsJson(cfg, string.concat(".baskets[", vm.toString(n), "]"))) n++;
    }

    function _setup(
        BasketFactory factory,
        string memory cfg,
        uint256 i,
        address weth,
        IV3Factory v3,
        uint256[] memory fees,
        address keeper,
        address deployer,
        address pauser
    ) internal {
        string memory key = string.concat(".baskets[", vm.toString(i), "]");
        uint8 narrativeId = uint8(vm.parseJsonUint(cfg, string.concat(key, ".narrativeId")));
        address[] memory candidates = vm.parseJsonAddressArray(cfg, string.concat(key, ".tokens"));

        address basketAddr = factory.basketOf(narrativeId);
        if (basketAddr == address(0)) {
            // Count qualifying tokens first by dry-checking pool existence and liquidity; the basket itself
            // enforces TWAP and cardinality when whitelisting.
            uint256 viable;
            for (uint256 t = 0; t < candidates.length; t++) {
                (address pool,) = _bestPool(v3, candidates[t], weth, fees);
                if (pool != address(0)) viable++;
            }
            if (viable < 3) {
                console2.log("basket skipped: fewer than 3 tokens have a V3 WETH pool, narrative", narrativeId);
                return;
            }
            basketAddr = factory.createBasket(
                narrativeId,
                vm.parseJsonString(cfg, string.concat(key, ".name")),
                vm.parseJsonString(cfg, string.concat(key, ".symbol")),
                deployer,
                keeper,
                pauser
            );
        }
        Basket basket = Basket(payable(basketAddr));

        address[] memory ok = new address[](candidates.length);
        uint256 n;
        for (uint256 t = 0; t < candidates.length; t++) {
            (bool whitelisted,,) = basket.tokenConfigs(candidates[t]);
            if (!whitelisted) {
                (address pool, uint24 fee) = _bestPool(v3, candidates[t], weth, fees);
                if (pool == address(0)) continue;
                try basket.whitelistToken(candidates[t], pool, fee) {}
                catch {
                    console2.log("token not whitelisted (liquidity or TWAP history):", candidates[t]);
                    continue;
                }
            }
            ok[n++] = candidates[t];
        }
        if (n < 3) {
            console2.log("allocation not set: fewer than 3 whitelisted tokens, narrative", narrativeId);
            return;
        }

        (address[] memory current,) = basket.constituents();
        if (current.length != 0) return; // the keeper owns the weights after the first allocation
        address[] memory tokens = new address[](n);
        uint16[] memory weights = new uint16[](n);
        uint16 each = uint16(BPS / n);
        require(each <= MAX_WEIGHT, "weight cap");
        uint16 sum;
        for (uint256 t = 0; t < n; t++) {
            tokens[t] = ok[t];
            weights[t] = each;
            sum += each;
        }
        weights[0] += BPS - sum;
        require(weights[0] <= MAX_WEIGHT, "weight cap");
        basket.setInitialAllocation(tokens, weights);
        console2.log("basket ready, narrative", narrativeId);
        console2.log("tokens", n);
    }

    function _bestPool(IV3Factory v3, address token, address weth, uint256[] memory fees)
        internal
        view
        returns (address best, uint24 bestFee)
    {
        uint128 bestLiq;
        for (uint256 f = 0; f < fees.length; f++) {
            address pool = v3.getPool(token, weth, uint24(fees[f]));
            if (pool == address(0)) continue;
            uint128 liq = IPoolLiquidity(pool).liquidity();
            if (liq > bestLiq) {
                bestLiq = liq;
                best = pool;
                bestFee = uint24(fees[f]);
            }
        }
    }
}
