"""Issue an operator-approved testnet KOL registration attestation as wallet-ready JSON."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx
from eth_account import Account
from eth_utils import is_address, keccak, to_checksum_address

from nti_oracle.chain import ChainRpcError, OracleCommitClient
from nti_oracle.keeper_chain import ZERO_ADDRESS, read

TESTNET_CHAIN_ID = 46630
ATTESTER_ROLE = keccak(text="ATTESTER_ROLE")
DEFAULT_TTL = 1800
MAX_TTL = 3600
REPO_ROOT = Path(__file__).resolve().parents[4]


async def issue_kol_attestation(
    registry: OracleCommitClient,
    *,
    registry_address: str,
    wallet: str,
    private_key: str,
    verified_handle: str | None = None,
    testnet_fixture: bool = False,
    ttl_seconds: int = DEFAULT_TTL,
) -> dict[str, Any]:
    if (verified_handle is not None) == testnet_fixture:
        raise ValueError("Supply a verified handle or explicitly request a testnet fixture")
    if not 0 < ttl_seconds <= MAX_TTL:
        raise ValueError("Attestation lifetime must be between one second and one hour")
    if not is_address(wallet) or int(wallet, 16) == 0:
        raise ValueError("Expected a nonzero wallet address")
    wallet = to_checksum_address(wallet)
    handle = (
        f"nti_test_{wallet[-6:].lower()}"
        if testnet_fixture
        else str(verified_handle).strip().removeprefix("@").lower()
    )
    if not re.fullmatch(r"[a-z0-9_]{1,15}", handle):
        raise ValueError("Expected an X handle of 1 to 15 letters, digits or underscores")
    if int(await registry._rpc("eth_chainId", []), 16) != TESTNET_CHAIN_ID:
        raise ValueError("KOL attestation issuer requires Robinhood testnet chain 46630")
    try:
        signer = Account.from_key(private_key)
    except ValueError:
        raise ValueError("Invalid attester signing key") from None
    (active,) = await read(
        registry,
        "hasRole(bytes32,address)",
        ["bool"],
        ["bytes32", "address"],
        [ATTESTER_ROLE, signer.address],
    )
    if not active:
        raise ValueError("The signing key lacks the registry ATTESTER_ROLE")
    handle_hash = keccak(text=handle)
    (bound_wallet,) = await read(
        registry, "walletOf(bytes32)", ["address"], ["bytes32"], [handle_hash]
    )
    if bound_wallet != ZERO_ADDRESS:
        raise ValueError("The handle is already registered")
    (bound_handle,) = await read(registry, "handleOf(address)", ["bytes32"], ["address"], [wallet])
    if any(bound_handle):
        raise ValueError("The wallet already has a registered handle")

    block = await registry._rpc("eth_getBlockByNumber", ["latest", False])
    deadline = int(block["timestamp"], 16) + ttl_seconds
    verifying_contract = to_checksum_address(registry_address)
    signed = signer.sign_typed_data(
        domain_data={
            "name": "NTIKOLRegistry",
            "version": "1",
            "chainId": TESTNET_CHAIN_ID,
            "verifyingContract": verifying_contract,
        },
        message_types={
            "RegisterKOL": [
                {"name": "wallet", "type": "address"},
                {"name": "handleHash", "type": "bytes32"},
                {"name": "deadline", "type": "uint256"},
            ]
        },
        message_data={"wallet": wallet, "handleHash": handle_hash, "deadline": deadline},
    )
    (digest,) = await read(
        registry,
        "hashRegistration(address,bytes32,uint256)",
        ["bytes32"],
        ["address", "bytes32", "uint256"],
        [wallet, handle_hash, deadline],
    )
    if signed.message_hash != digest:
        raise ValueError("Signed digest does not match the testnet registry")
    return {
        "wallet": wallet,
        "handle": handle,
        "handleHash": "0x" + handle_hash.hex(),
        "deadline": str(deadline),
        "signature": "0x" + signed.signature.hex(),
        "chainId": TESTNET_CHAIN_ID,
        "kolRegistry": verifying_contract,
        "testnetFixture": testnet_fixture,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wallet", required=True, help="wallet to bind to the X handle")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--verified-handle", help="operator-verified X handle and wallet ownership")
    mode.add_argument(
        "--testnet-fixture",
        action="store_true",
        help="sign a synthetic handle unique to the wallet",
    )
    parser.add_argument("--ttl-seconds", type=int, default=DEFAULT_TTL)
    args = parser.parse_args()
    rpc_url = os.environ.get("RPC_URL_TESTNET")
    key = os.environ.get("KOL_ATTESTER_PRIVATE_KEY")
    if not rpc_url or not key:
        parser.error("RPC_URL_TESTNET and KOL_ATTESTER_PRIVATE_KEY are required")
    manifest = REPO_ROOT / "contracts" / "deployments" / f"{TESTNET_CHAIN_ID}.json"
    registry_address = json.loads(manifest.read_text(encoding="utf-8"))["kolRegistry"]
    client = OracleCommitClient(rpc_url, registry_address, TESTNET_CHAIN_ID)
    try:
        proof = asyncio.run(
            issue_kol_attestation(
                client,
                registry_address=registry_address,
                wallet=args.wallet,
                private_key=key,
                verified_handle=args.verified_handle,
                testnet_fixture=args.testnet_fixture,
                ttl_seconds=args.ttl_seconds,
            )
        )
    except (ChainRpcError, httpx.HTTPError):
        parser.error("Could not read the testnet KOL registry")
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(proof, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
