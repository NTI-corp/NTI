// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {NTIRegistry} from "../src/NTIRegistry.sol";

/// @title AttachTokenMainnet
/// @notice Step 5 of the mainnet runbook: once the real $NTI contract address exists, point the registry at
///         it and freeze the registry. Refuses to run unless the token looks like the one the brief describes
///         (18 decimals, the expected total supply) and no stake is locked yet.
///
///         Env: NTI_TOKEN_ADDRESS (required), EXPECTED_TOTAL_SUPPLY (default 1e9 * 1e18), BUYBACK_ADAPTER
///         (optional: the V3 or V4 adapter from the manifest, only when the token's pool is live),
///         DEPLOY_MANIFEST (default deployments/4663.json).
contract AttachTokenMainnet is Script {
    uint256 internal constant DEFAULT_SUPPLY = 1_000_000_000e18;

    function run() external {
        require(block.chainid == 4663, "mainnet only");

        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        NTIRegistry registry = NTIRegistry(vm.parseJsonAddress(manifest, ".registry"));
        address adapterV3 = vm.parseJsonAddress(manifest, ".buybackAdapterV3");
        address adapterV4 = vm.parseJsonAddress(manifest, ".buybackAdapterV4");

        address token = vm.envAddress("NTI_TOKEN_ADDRESS");
        require(token.code.length > 0, "no bytecode at token");
        require(IERC20Metadata(token).decimals() == 18, "token decimals != 18");
        require(
            IERC20Metadata(token).totalSupply() == vm.envOr("EXPECTED_TOTAL_SUPPLY", DEFAULT_SUPPLY),
            "token supply != expected"
        );

        require(registry.owner() == _broadcaster(), "broadcaster is not the registry owner");
        require(!registry.frozen(), "registry already frozen");

        address adapter = vm.envOr("BUYBACK_ADAPTER", address(0));
        require(adapter == address(0) || adapter == adapterV3 || adapter == adapterV4, "unknown buyback adapter");

        vm.startBroadcast();
        registry.setNti(token);
        if (adapter != address(0)) registry.setBuybackAdapter(adapter);
        registry.freeze();
        vm.stopBroadcast();

        require(registry.nti() == token, "check: nti not set");
        require(registry.frozen(), "check: registry not frozen");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
    }
}
