"""Minimal JSON-RPC + EIP-1559 transaction client for OracleCommit.sol."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx
from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_account import Account
from eth_utils import keccak, to_checksum_address

from nti_oracle.signing import SignedAttestation


class ChainRpcError(RuntimeError):
    """Raised when an EVM JSON-RPC call or transaction fails."""


@dataclass(frozen=True, slots=True)
class OnChainOracleState:
    genesis_timestamp: int
    first_epoch: int
    last_processed_epoch: int
    latest_final_epoch: int
    block_timestamp: int


def _selector(sig: str) -> bytes:
    return keccak(text=sig)[:4]


def _bytes32(hex_val: str) -> bytes:
    cleaned = hex_val[2:] if hex_val.startswith("0x") else hex_val
    raw = bytes.fromhex(cleaned)
    if len(raw) != 32:
        raise ValueError(f"Expected 32-byte hex value, got {len(raw)} bytes")
    return raw


class OracleCommitClient:
    """Lightweight async JSON-RPC client for reading/committing/finalizing OracleCommit."""

    def __init__(
        self,
        rpc_url: str,
        contract_address: str,
        chain_id: int,
        timeout: float = 30.0,
    ) -> None:
        # A comma-separated list is an ordered fallback chain: the first URL is the primary.
        self._rpc_urls = [u.strip() for u in rpc_url.split(",") if u.strip()]
        self._rpc_url = self._rpc_urls[0]
        self._contract = to_checksum_address(contract_address)
        self._chain_id = int(chain_id)
        self._timeout = timeout

    async def _rpc(self, method: str, params: list[Any]) -> Any:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        body: dict[str, Any] | None = None
        last_error: Exception | None = None
        for url in self._rpc_urls:
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(url, json=payload)
                    resp.raise_for_status()
                    body = resp.json()
                break
            except (httpx.HTTPError, ValueError) as exc:  # transport, 4xx/5xx, rate limit, bad body
                last_error = exc
        if body is None:
            raise ChainRpcError(
                f"RPC {method} failed on every endpoint: {last_error}"
            ) from last_error
        # A JSON-RPC error is a verdict from a working node, not an outage: never retried elsewhere.
        if "error" in body and body["error"] is not None:
            raise ChainRpcError(f"RPC {method} error: {body['error']}")
        return body.get("result")

    async def _call(self, sig: str, arg_types: Sequence[str], args: Sequence[Any]) -> bytes:
        data = _selector(sig) + (abi_encode(list(arg_types), list(args)) if arg_types else b"")
        res_hex = await self._rpc(
            "eth_call",
            [{"to": self._contract, "data": "0x" + data.hex()}, "latest"],
        )
        return bytes.fromhex(str(res_hex)[2:])

    async def read_state(self) -> OnChainOracleState:
        blk = await self._rpc("eth_getBlockByNumber", ["latest", False])
        block_ts = int(blk["timestamp"], 16)
        raw_gen = await self._call("genesisTimestamp()", [], [])
        raw_first = await self._call("firstEpoch()", [], [])
        raw_last = await self._call("lastProcessedEpoch()", [], [])
        raw_final = await self._call("latestFinalEpoch()", [], [])
        return OnChainOracleState(
            genesis_timestamp=int(abi_decode(["uint64"], raw_gen)[0]),
            first_epoch=int(abi_decode(["uint32"], raw_first)[0]),
            last_processed_epoch=int(abi_decode(["uint32"], raw_last)[0]),
            latest_final_epoch=int(abi_decode(["uint32"], raw_final)[0]),
            block_timestamp=block_ts,
        )

    async def get_epoch_status(self, epoch_id: int) -> tuple[int, int]:
        raw_st = await self._call("epochStatus(uint32)", ["uint32"], [int(epoch_id)])
        raw_at = await self._call("epochCommittedAt(uint32)", ["uint32"], [int(epoch_id)])
        return (
            int(abi_decode(["uint8"], raw_st)[0]),
            int(abi_decode(["uint64"], raw_at)[0]),
        )

    async def get_epoch_vector(self, epoch_id: int) -> tuple[tuple[int, ...], tuple[int, ...]]:
        raw = await self._call("epochVector(uint32)", ["uint32"], [int(epoch_id)])
        i_vec, v_vec = abi_decode(["uint16[]", "int32[]"], raw)
        return tuple(int(x) for x in i_vec), tuple(int(x) for x in v_vec)

    async def get_dispute_window(self) -> int:
        raw = await self._call("DISPUTE_WINDOW()", [], [])
        return int(abi_decode(["uint64"], raw)[0])

    async def get_commit_delay(self) -> int:
        raw = await self._call("COMMIT_DELAY()", [], [])
        return int(abi_decode(["uint64"], raw)[0])

    async def _send_tx(self, private_key: str, calldata: bytes) -> str:
        acct = Account.from_key(private_key)
        sender = acct.address
        nonce_hex = await self._rpc("eth_getTransactionCount", [sender, "pending"])
        nonce = int(nonce_hex, 16)
        gas_price_hex = await self._rpc("eth_gasPrice", [])
        gas_price = int(gas_price_hex, 16)
        data_hex = "0x" + calldata.hex()

        est_hex = await self._rpc(
            "eth_estimateGas",
            [{"from": sender, "to": self._contract, "data": data_hex}],
        )
        gas_limit = int(int(est_hex, 16) * 1.25)

        tx = {
            "chainId": self._chain_id,
            "nonce": nonce,
            "to": self._contract,
            "value": 0,
            "gas": gas_limit,
            "maxFeePerGas": max(gas_price * 2, 100_000_000),
            "maxPriorityFeePerGas": max(gas_price // 5, 1_000_000),
            "data": calldata,
            "type": 2,
        }
        signed = acct.sign_transaction(tx)
        tx_hash = await self._rpc(
            "eth_sendRawTransaction",
            ["0x" + signed.raw_transaction.hex()],
        )

        deadline = time.time() + 90
        while time.time() < deadline:
            receipt = await self._rpc("eth_getTransactionReceipt", [tx_hash])
            if receipt is not None:
                status = int(receipt["status"], 16)
                if status != 1:
                    raise ChainRpcError(f"Transaction {tx_hash} reverted (status={status})")
                return str(tx_hash)
            await asyncio.sleep(2.0)

        raise ChainRpcError(f"Timed out waiting for transaction receipt: {tx_hash}")

    async def commit_epoch(
        self,
        *,
        private_key: str,
        epoch_id: int,
        series_id: int,
        dataset_hash: str,
        config_hash: str,
        arweave_tx_bytes32: str,
        i_vector: Sequence[int],
        v_vector: Sequence[int],
        attestations: Sequence[SignedAttestation],
    ) -> str:
        sig = (
            "commit(uint32,uint32,bytes32,bytes32,bytes32,"
            "uint16[],int32[],(address,uint16[],int32[],bytes)[])"
        )
        atts_encoded = [
            (
                to_checksum_address(att.validator),
                [int(x) for x in att.i_vector],
                [int(x) for x in att.v_vector],
                bytes.fromhex(
                    att.signature[2:] if att.signature.startswith("0x") else att.signature
                ),
            )
            for att in attestations
        ]
        encoded_args = abi_encode(
            [
                "uint32",
                "uint32",
                "bytes32",
                "bytes32",
                "bytes32",
                "uint16[]",
                "int32[]",
                "(address,uint16[],int32[],bytes)[]",
            ],
            [
                int(epoch_id),
                int(series_id),
                _bytes32(dataset_hash),
                _bytes32(config_hash),
                _bytes32(arweave_tx_bytes32),
                [int(x) for x in i_vector],
                [int(x) for x in v_vector],
                atts_encoded,
            ],
        )
        return await self._send_tx(private_key, _selector(sig) + encoded_args)

    async def finalize_epoch(self, *, private_key: str, epoch_id: int) -> str:
        sig = "finalize(uint32)"
        encoded_args = abi_encode(["uint32"], [int(epoch_id)])
        return await self._send_tx(private_key, _selector(sig) + encoded_args)
