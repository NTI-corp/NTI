"""Testnet KOL issuer signs the exact digest recognized by KOLRegistry."""

from __future__ import annotations

from typing import Any

import pytest
from eth_abi import encode
from eth_account import Account
from eth_account.messages import SignableMessage
from eth_utils import keccak

TEST_KEY = "0x" + "11" * 32
REGISTRY = "0x" + "22" * 20
WALLET = "0x" + "33" * 20
ZERO_ADDRESS = "0x" + "00" * 20


def struct_hash(signature: str, types: list[str], values: list[Any]) -> bytes:
    return keccak(encode(["bytes32", *types], [keccak(text=signature), *values]))


def domain_hash() -> bytes:
    return struct_hash(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
        ["bytes32", "bytes32", "uint256", "address"],
        [keccak(text="NTIKOLRegistry"), keccak(text="1"), 46630, REGISTRY],
    )


class RegistryRpc:
    def __init__(self, *, chain_id: int = 46630, has_role: bool = True) -> None:
        self.chain_id = chain_id
        self.has_role = has_role

    async def _rpc(self, method: str, params: list[Any]) -> Any:
        if method == "eth_chainId" and params == []:
            return hex(self.chain_id)
        if method == "eth_getBlockByNumber" and params == ["latest", False]:
            return {"timestamp": hex(1_000_000)}
        raise AssertionError((method, params))

    async def _call(self, sig: str, arg_types: list[str], args: list[Any]) -> bytes:
        if sig == "hasRole(bytes32,address)":
            assert args == [keccak(text="ATTESTER_ROLE"), Account.from_key(TEST_KEY).address]
            return encode(["bool"], [self.has_role])
        if sig == "walletOf(bytes32)":
            return encode(["address"], [ZERO_ADDRESS])
        if sig == "handleOf(address)":
            return encode(["bytes32"], [bytes(32)])
        if sig == "hashRegistration(address,bytes32,uint256)":
            payload = struct_hash(
                "RegisterKOL(address wallet,bytes32 handleHash,uint256 deadline)", arg_types, args
            )
            return keccak(b"\x19\x01" + domain_hash() + payload)
        raise AssertionError((sig, args))


@pytest.mark.asyncio
async def test_verified_kol_attestation_matches_contract_domain_and_normalized_handle() -> None:
    from nti_oracle.kol_attest import issue_kol_attestation

    proof = await issue_kol_attestation(
        RegistryRpc(),
        registry_address=REGISTRY,
        wallet=WALLET,
        private_key=TEST_KEY,
        verified_handle="@Agent_Fan",
    )
    handle_hash = keccak(text="agent_fan")
    assert proof["handle"] == "agent_fan" and proof["handleHash"] == "0x" + handle_hash.hex()
    assert proof["deadline"] == "1001800" and proof["testnetFixture"] is False
    payload = struct_hash(
        "RegisterKOL(address wallet,bytes32 handleHash,uint256 deadline)",
        ["address", "bytes32", "uint256"],
        [WALLET, handle_hash, 1_001_800],
    )
    recovered = Account.recover_message(
        SignableMessage(b"\x01", domain_hash(), payload), signature=proof["signature"]
    )
    assert recovered == Account.from_key(TEST_KEY).address


@pytest.mark.asyncio
async def test_synthetic_kol_requires_explicit_fixture_and_an_active_testnet_role() -> None:
    from nti_oracle.kol_attest import issue_kol_attestation

    args = {"registry_address": REGISTRY, "wallet": WALLET, "private_key": TEST_KEY}
    with pytest.raises(ValueError, match="verified handle or"):
        await issue_kol_attestation(RegistryRpc(), **args)
    with pytest.raises(ValueError, match="46630"):
        await issue_kol_attestation(RegistryRpc(chain_id=4663), testnet_fixture=True, **args)
    with pytest.raises(ValueError, match="ATTESTER_ROLE"):
        await issue_kol_attestation(RegistryRpc(has_role=False), testnet_fixture=True, **args)
    proof = await issue_kol_attestation(RegistryRpc(), testnet_fixture=True, **args)
    assert proof["testnetFixture"] is True and proof["handle"] == "nti_test_333333"
