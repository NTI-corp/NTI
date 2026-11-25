// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Deploys an ERC-1967 proxy for an already deployed implementation and runs its initializer.
///         Tests and deploy scripts use it so every protocol contract is created the way mainnet creates it.
function deployProxy(address implementation, bytes memory initData) returns (address) {
    return address(new ERC1967Proxy(implementation, initData));
}
