// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";

import {NTIRegistry} from "../src/NTIRegistry.sol";
import {Staking} from "../src/Staking.sol";

/// @title HardenStakingMainnet
/// @notice Replaces the prelaunch 10 second unstake cooldown with the real one and, optionally, locks it for good.
///
///         Order matters. The token swap (SwapTokenMainnet) only works while nothing is staked, and that relies on
///         the short cooldown, so this script refuses to run until the registry is frozen on the real token. Set
///         ALLOW_BEFORE_SWAP=1 only if you really mean to skip that check.
///
///         Env: COOLDOWN_DAYS (default 7, between 1 and 30), LOCK=1 (optional: lock the timing for good),
///         ALLOW_BEFORE_SWAP=1 (optional), DEPLOY_MANIFEST (default deployments/4663.json).
///         The broadcaster must hold the Staking default admin role (the deployer, unless it was handed over).
contract HardenStakingMainnet is Script {
    function run() external {
        require(block.chainid == 4663, "mainnet only");

        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        Staking staking = Staking(vm.parseJsonAddress(manifest, ".staking"));
        NTIRegistry registry = NTIRegistry(vm.parseJsonAddress(manifest, ".registry"));

        uint256 days_ = vm.envOr("COOLDOWN_DAYS", uint256(7));
        require(days_ >= 1 && days_ <= 30, "COOLDOWN_DAYS must be 1..30");
        bool lock = vm.envOr("LOCK", uint256(0)) == 1;

        require(
            registry.frozen() || vm.envOr("ALLOW_BEFORE_SWAP", uint256(0)) == 1,
            "registry is not frozen: swap to the real token first"
        );
        require(!staking.timingsLocked(), "staking timings are already locked");
        require(staking.hasRole(staking.DEFAULT_ADMIN_ROLE(), _broadcaster()), "broadcaster is not the staking admin");

        vm.startBroadcast();
        staking.setCooldownDuration(uint64(days_ * 1 days));
        if (lock) staking.lockTimings();
        vm.stopBroadcast();

        require(staking.COOLDOWN_DURATION() == uint64(days_ * 1 days), "check: cooldown");
        require(staking.timingsLocked() == lock, "check: lock state");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
    }
}
