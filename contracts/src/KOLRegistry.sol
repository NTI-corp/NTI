// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title KOLRegistry
/// @notice Opt-in on-chain registry binding verified X handles (keccak256 handleHash) to wallets
///         via EIP-712 signatures from ATTESTER_ROLE.
contract KOLRegistry is AccessControl, EIP712 {
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    bytes32 public constant REGISTER_TYPEHASH =
        keccak256("RegisterKOL(address wallet,bytes32 handleHash,uint256 deadline)");

    mapping(address => bytes32) public handleOf;
    mapping(bytes32 => address) public walletOf;
    mapping(bytes32 => bool) public usedDigests;

    error ZeroAddress();
    error InvalidHandleHash();
    error SignatureExpired(uint256 deadline);
    error DigestAlreadyUsed();
    error InvalidAttesterSignature(address recovered);
    error HandleAlreadyBound(bytes32 handleHash, address existingWallet);
    error NotRegistered();

    event KOLRegistered(address indexed wallet, bytes32 indexed handleHash, address indexed attester);
    event KOLUnregistered(address indexed wallet, bytes32 indexed handleHash);

    constructor(address admin_, address attester_) EIP712("NTIKOLRegistry", "1") {
        if (admin_ == address(0) || attester_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ATTESTER_ROLE, attester_);
    }

    function hashRegistration(address wallet, bytes32 handleHash, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(REGISTER_TYPEHASH, wallet, handleHash, deadline));
        return _hashTypedDataV4(structHash);
    }

    function register(address wallet, bytes32 handleHash, uint256 deadline, bytes calldata sig)
        external
    {
        if (wallet == address(0)) revert ZeroAddress();
        if (handleHash == bytes32(0)) revert InvalidHandleHash();
        if (block.timestamp > deadline) revert SignatureExpired(deadline);

        bytes32 digest = hashRegistration(wallet, handleHash, deadline);
        if (usedDigests[digest]) revert DigestAlreadyUsed();

        address signer = ECDSA.recover(digest, sig);
        if (!hasRole(ATTESTER_ROLE, signer)) revert InvalidAttesterSignature(signer);

        address existing = walletOf[handleHash];
        if (existing != address(0) && existing != wallet) {
            revert HandleAlreadyBound(handleHash, existing);
        }

        // Clear any prior handle bound to this wallet before rebinding.
        bytes32 prevHandle = handleOf[wallet];
        if (prevHandle != bytes32(0) && prevHandle != handleHash) {
            delete walletOf[prevHandle];
        }

        usedDigests[digest] = true;
        handleOf[wallet] = handleHash;
        walletOf[handleHash] = wallet;

        emit KOLRegistered(wallet, handleHash, signer);
    }

    function unregister() external {
        bytes32 h = handleOf[msg.sender];
        if (h == bytes32(0)) revert NotRegistered();
        delete handleOf[msg.sender];
        delete walletOf[h];
        emit KOLUnregistered(msg.sender, h);
    }

    function revoke(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 h = handleOf[wallet];
        if (h == bytes32(0)) revert NotRegistered();
        delete handleOf[wallet];
        delete walletOf[h];
        emit KOLUnregistered(wallet, h);
    }
}
