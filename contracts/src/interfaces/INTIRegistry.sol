// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title INTIRegistry
/// @notice Central address registry for the NTI protocol suite on Robinhood Chain.
///         Allows switching from NTITestToken to the live $NTI CA before freeze().
interface INTIRegistry {
    function nti() external view returns (address);
    function weth() external view returns (address);
    function burnAddress() external view returns (address);
    function buybackAdapter() external view returns (address);
    function staking() external view returns (address);
    function frozen() external view returns (bool);
    function buybackReady() external view returns (bool);
}
