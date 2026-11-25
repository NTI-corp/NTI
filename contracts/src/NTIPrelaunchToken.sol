// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title NTIPrelaunchToken
/// @notice Stand-in for $NTI on mainnet until the real token launches on Pons: 1B initial supply to the
///         deployer plus a 10k / 24h faucet so the app can be used end to end. It has no value and is replaced
///         by the real token with `SwapTokenMainnet` (the registry only accepts a swap while nothing is staked).
contract NTIPrelaunchToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant FAUCET_AMOUNT = 10_000e18;
    uint64 public constant FAUCET_COOLDOWN = 24 hours;

    mapping(address => uint64) public lastFaucetClaim;

    error FaucetCooldownActive(uint64 nextAvailableAt);

    event FaucetClaimed(address indexed recipient, uint256 amount);

    constructor(address initialRecipient) ERC20("NTI Prelaunch", "pNTI") {
        _mint(initialRecipient, INITIAL_SUPPLY);
    }

    function faucet() external {
        uint64 last = lastFaucetClaim[msg.sender];
        if (last != 0 && block.timestamp < uint256(last) + FAUCET_COOLDOWN) {
            revert FaucetCooldownActive(last + FAUCET_COOLDOWN);
        }
        lastFaucetClaim[msg.sender] = uint64(block.timestamp);
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }
}
