// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {NTIRegistry} from "../src/NTIRegistry.sol";
import {Staking} from "../src/Staking.sol";

/// @title SwapTokenMainnet
/// @notice Points the registry at the real $NTI once it exists (launched on Pons), replacing the prelaunch
///         token. Refuses a token that is not 18 decimals with the expected supply. The registry itself only
///         accepts a new token while nothing is staked, so run this when everyone has unstaked (the cooldown
///         is seconds long).
///
///         Env: NTI_TOKEN_ADDRESS (required), EXPECTED_TOTAL_SUPPLY (default 1e9 * 1e18), BUYBACK_ADAPTER
///         (optional: the V3 or V4 adapter from the manifest, once the token's pool is live), FREEZE=1
///         (optional: also freeze the registry so the token can never change again),
///         DEPLOY_MANIFEST (default deployments/4663.json).
contract SwapTokenMainnet is Script {
    uint256 internal constant DEFAULT_SUPPLY = 1_000_000_000e18;

    function run() external {
        require(block.chainid == 4663, "mainnet only");

        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        NTIRegistry registry = NTIRegistry(vm.parseJsonAddress(manifest, ".registry"));
        Staking staking = Staking(vm.parseJsonAddress(manifest, ".staking"));
        address adapterV3 = vm.parseJsonAddress(manifest, ".buybackAdapterV3");
        address adapterV4 = vm.parseJsonAddress(manifest, ".buybackAdapterV4");

        address token = vm.envAddress("NTI_TOKEN_ADDRESS");
        require(token != registry.nti(), "token is already set");
        require(token.code.length > 0, "no bytecode at token");
        require(IERC20Metadata(token).decimals() == 18, "token decimals != 18");
        require(
            IERC20Metadata(token).totalSupply() == vm.envOr("EXPECTED_TOTAL_SUPPLY", DEFAULT_SUPPLY),
            "token supply != expected"
        );

        require(registry.owner() == _broadcaster(), "broadcaster is not the registry owner");
        require(!registry.frozen(), "registry already frozen");
        require(staking.totalLocked() == 0, "stake is still locked: everyone must unstake first");

        address adapter = vm.envOr("BUYBACK_ADAPTER", address(0));
        require(adapter == address(0) || adapter == adapterV3 || adapter == adapterV4, "unknown buyback adapter");
        bool freeze = vm.envOr("FREEZE", uint256(0)) == 1;

        vm.startBroadcast();
        registry.setNti(token);
        if (adapter != address(0)) registry.setBuybackAdapter(adapter);
        if (freeze) registry.freeze();
        vm.stopBroadcast();

        require(registry.nti() == token, "check: nti not set");
        require(registry.frozen() == freeze, "check: freeze state");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
    }
}
