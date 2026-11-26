// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BasketFactory} from "../src/BasketFactory.sol";
import {Basket} from "../src/Basket.sol";
import {INTIRegistry} from "../src/interfaces/INTIRegistry.sol";

interface IV3FactoryLite {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

/// @title AddBasketTokenMainnet
/// @notice Adds one token to an existing narrative basket by hand, with the checks a keeper would otherwise skip.
///         It finds the deepest Uniswap V3 pool of the token against WETH, refuses a pool that is thin compared with
///         the basket's TVL cap, whitelists the token (the basket itself checks liquidity floor and 30 minute TWAP),
///         then sets the new weights. The keeper's normal rebalance moves the holdings toward them, at most 20% of
///         the basket per day.
///
///         Env: NARRATIVE_ID (the basket's narrative id), TOKEN (the token to add), WEIGHTS_BPS (comma separated
///         weights for ALL tokens in order: the current tokens as the basket lists them, then TOKEN last; they must
///         sum to 10000, each at most 4000), MIN_POOL_WETH (optional, in wei; default 10 x the basket's maxTVL),
///         DEPLOY_MANIFEST (default deployments/4663.json), UNISWAP_V3_FACTORY (default the mainnet factory).
///         The broadcaster must hold the basket's admin role.
contract AddBasketTokenMainnet is Script {
    uint16 internal constant BPS = 10_000;
    uint16 internal constant MAX_WEIGHT = 4000;
    address internal constant DEFAULT_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    function run() external {
        require(block.chainid == 4663, "mainnet only");

        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        BasketFactory factory = BasketFactory(payable(vm.parseJsonAddress(manifest, ".basketFactory")));
        address weth = INTIRegistry(vm.parseJsonAddress(manifest, ".registry")).weth();
        IV3FactoryLite v3 = IV3FactoryLite(vm.envOr("UNISWAP_V3_FACTORY", DEFAULT_V3_FACTORY));

        address basketAddr = factory.basketOf(uint8(vm.envUint("NARRATIVE_ID")));
        require(basketAddr != address(0), "no basket for that narrative");
        Basket basket = Basket(payable(basketAddr));
        address token = vm.envAddress("TOKEN");
        require(token != address(0) && token != weth, "bad token");
        require(basket.hasRole(basket.DEFAULT_ADMIN_ROLE(), _broadcaster()), "broadcaster is not the basket admin");

        (address[] memory current,) = basket.constituents();
        for (uint256 i = 0; i < current.length; i++) {
            require(current[i] != token, "token is already in the basket");
        }

        // The deepest pool wins: an unused fee tier with a few wei of WETH must not be picked.
        uint24[3] memory fees = [uint24(500), uint24(3000), uint24(10000)];
        address pool;
        uint24 fee;
        uint256 depth;
        for (uint256 i = 0; i < fees.length; i++) {
            address p = v3.getPool(token, weth, fees[i]);
            if (p == address(0)) continue;
            uint256 d = IERC20(weth).balanceOf(p);
            if (d > depth) (pool, fee, depth) = (p, fees[i], d);
        }
        require(pool != address(0), "no Uniswap V3 pool against WETH");
        uint256 minDepth = vm.envOr("MIN_POOL_WETH", basket.maxTVL() * 10);
        require(depth >= minDepth, "pool is too thin for this basket's TVL cap");

        uint256[] memory raw = vm.envUint("WEIGHTS_BPS", ",");
        require(raw.length == current.length + 1, "WEIGHTS_BPS needs one weight per current token plus the new one");
        require(raw.length >= 3, "a basket needs at least three tokens");
        address[] memory tokens = new address[](raw.length);
        uint16[] memory weights = new uint16[](raw.length);
        uint256 sum;
        for (uint256 i = 0; i < raw.length; i++) {
            tokens[i] = i < current.length ? current[i] : token;
            require(raw[i] > 0 && raw[i] <= MAX_WEIGHT, "each weight must be 1..4000 bps");
            weights[i] = uint16(raw[i]);
            sum += raw[i];
        }
        require(sum == BPS, "weights must sum to 10000");

        console2.log("pool", pool);
        console2.log("fee tier", fee);
        console2.log("pool WETH depth (wei)", depth);

        vm.startBroadcast();
        basket.whitelistToken(token, pool, fee);
        basket.setInitialAllocation(tokens, weights);
        vm.stopBroadcast();

        (address[] memory after_,) = basket.constituents();
        require(after_.length == tokens.length && after_[after_.length - 1] == token, "check: token not added");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
    }
}
