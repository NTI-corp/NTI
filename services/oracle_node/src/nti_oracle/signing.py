"""EIP-712 Attestation signing and recovery matching OracleCommit.sol verbatim."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import to_checksum_address
from nti_core.canonical import keccak256_hex

INT32_MIN = -(2**31)

EIP712_DOMAIN_NAME = "NTIOracleCommit"
EIP712_DOMAIN_VERSION = "1"


@dataclass(frozen=True, slots=True)
class SignedAttestation:
    validator: str
    epoch_id: int
    dataset_hash: str
    config_hash: str
    vector_hash: str
    i_vector: tuple[int, ...]
    v_vector: tuple[int, ...]
    signature: str


def encode_v_vector_solidity(v_vector: Sequence[int | None]) -> tuple[int, ...]:
    """Convert None velocities to Solidity's type(int32).min sentinel."""
    return tuple(INT32_MIN if v is None else int(v) for v in v_vector)


def compute_vector_hash(
    i_vector: Sequence[int],
    v_vector: Sequence[int | None],
) -> str:
    """Compute keccak256(abi.encode(uint16[] i, int32[] v)) matching OracleCommit.sol."""
    encoded_v = encode_v_vector_solidity(v_vector)
    encoded = abi_encode(["uint16[]", "int32[]"], [list(i_vector), list(encoded_v)])
    return keccak256_hex(encoded)


def _hex32_bytes(hex_str: str) -> bytes:
    cleaned = hex_str[2:] if hex_str.startswith("0x") else hex_str
    raw = bytes.fromhex(cleaned)
    if len(raw) != 32:
        raise ValueError(f"Expected 32-byte hex value, got {len(raw)} bytes")
    return raw


def build_attestation_typed_data(
    *,
    epoch_id: int,
    dataset_hash: str,
    config_hash: str,
    vector_hash: str,
    chain_id: int,
    verifying_contract: str,
) -> dict[str, Any]:
    """Construct EIP-712 structured payload for OracleCommit's Attestation type."""
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Attestation": [
                {"name": "epochId", "type": "uint32"},
                {"name": "datasetHash", "type": "bytes32"},
                {"name": "configHash", "type": "bytes32"},
                {"name": "vectorHash", "type": "bytes32"},
            ],
        },
        "primaryType": "Attestation",
        "domain": {
            "name": EIP712_DOMAIN_NAME,
            "version": EIP712_DOMAIN_VERSION,
            "chainId": int(chain_id),
            "verifyingContract": to_checksum_address(verifying_contract),
        },
        "message": {
            "epochId": int(epoch_id),
            "datasetHash": _hex32_bytes(dataset_hash),
            "configHash": _hex32_bytes(config_hash),
            "vectorHash": _hex32_bytes(vector_hash),
        },
    }


def sign_attestation(
    *,
    private_key: str,
    epoch_id: int,
    dataset_hash: str,
    config_hash: str,
    i_vector: Sequence[int],
    v_vector: Sequence[int | None],
    chain_id: int,
    verifying_contract: str,
) -> SignedAttestation:
    """Sign an OracleCommit Attestation using EIP-712 typed data."""
    v_sol = encode_v_vector_solidity(v_vector)
    vec_hash = compute_vector_hash(i_vector, v_vector)
    typed = build_attestation_typed_data(
        epoch_id=epoch_id,
        dataset_hash=dataset_hash,
        config_hash=config_hash,
        vector_hash=vec_hash,
        chain_id=chain_id,
        verifying_contract=verifying_contract,
    )
    signable = encode_typed_data(full_message=typed)
    acct = Account.from_key(private_key)
    signed = acct.sign_message(signable)
    sig_hex = "0x" + signed.signature.hex()
    return SignedAttestation(
        validator=to_checksum_address(acct.address),
        epoch_id=epoch_id,
        dataset_hash=dataset_hash,
        config_hash=config_hash,
        vector_hash=vec_hash,
        i_vector=tuple(int(x) for x in i_vector),
        v_vector=v_sol,
        signature=sig_hex,
    )


def recover_attestation_signer(
    attestation: SignedAttestation,
    *,
    chain_id: int,
    verifying_contract: str,
) -> str:
    """Recover the checksummed signer address from a SignedAttestation."""
    expected_vec_hash = compute_vector_hash(attestation.i_vector, attestation.v_vector)
    if expected_vec_hash.lower() != attestation.vector_hash.lower():
        raise ValueError("Attestation vector_hash does not match i_vector/v_vector")
    typed = build_attestation_typed_data(
        epoch_id=attestation.epoch_id,
        dataset_hash=attestation.dataset_hash,
        config_hash=attestation.config_hash,
        vector_hash=attestation.vector_hash,
        chain_id=chain_id,
        verifying_contract=verifying_contract,
    )
    signable = encode_typed_data(full_message=typed)
    recovered = Account.recover_message(signable, signature=attestation.signature)
    return to_checksum_address(recovered)


def verify_attestation(
    attestation: SignedAttestation,
    expected_validator: str,
    *,
    chain_id: int,
    verifying_contract: str,
) -> bool:
    """Verify that the attestation signature recovers to expected_validator."""
    try:
        recovered = recover_attestation_signer(
            attestation,
            chain_id=chain_id,
            verifying_contract=verifying_contract,
        )
    except Exception:  # noqa: BLE001
        return False
    return recovered.lower() == expected_validator.lower()
