"""Pons V2 (Robinhood Chain) launch discovery primitives.

Verified against mainnet on 2026-11-20 (read-only eth_call / bytecode inspection):

* Factory ``0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`` emits
  ``TokenLaunched(address,address,address,address,uint256,uint256)`` and
  ``PoolGraduated(address,uint256,uint256,uint256)`` (topic0 prefixes 0x8d4aad49 / 0x0a44ef75).
* ``getLaunchedToken(address)`` (selector 0x3cf28b5a) returns a 15-word static struct. Observed on a
  graduated token: word0 = token, word1 = bonding-curve contract (exposes ``token()``,
  ``realQuoteReserve()``, ``tokenReserve()``, ``readyToGraduate()``), word4 = pair (quote) token,
  word10 = phase (2 once graduated), all-zero for tokens the factory did not launch.
* The pair token is NOT always WETH (a live pool was paired against a Robinhood stock token), so
  liquidity must be converted to ETH through USD prices rather than read as ETH directly.

Event argument indexing is not published, so launches are resolved by trying every address-shaped
word in the log against ``getLaunchedToken`` and accepting the one whose struct word0 equals it.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from eth_utils import keccak

TOKEN_LAUNCHED_SIG = "TokenLaunched(address,address,address,address,uint256,uint256)"
POOL_GRADUATED_SIG = "PoolGraduated(address,uint256,uint256,uint256)"
TOPIC_TOKEN_LAUNCHED = "0x" + keccak(text=TOKEN_LAUNCHED_SIG).hex()
TOPIC_POOL_GRADUATED = "0x" + keccak(text=POOL_GRADUATED_SIG).hex()
SELECTOR_GET_LAUNCHED_TOKEN = "0x3cf28b5a"
SELECTOR_REAL_QUOTE_RESERVE = "0x4f1f58fd"
STRUCT_WORDS = 15
PHASE_GRADUATED = 2

MAINNET_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"
MAINNET_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
ZERO_ADDRESS = "0x" + "00" * 20


class Rpc(Protocol):
    async def request(self, method: str, params: list[Any]) -> Any: ...


@dataclass(frozen=True, slots=True)
class LaunchInfo:
    token: str
    curve: str
    pair_token: str
    phase: int

    @property
    def graduated(self) -> bool:
        return self.phase == PHASE_GRADUATED


RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


class HttpRpc:
    """Minimal async JSON-RPC client."""

    def __init__(
        self, url: str, timeout: float = 30.0, pace: float = 0.0, retries: int = 6
    ) -> None:
        self._url = url
        self._timeout = timeout
        self._pace = pace
        self._retries = retries

    async def request(self, method: str, params: list[Any]) -> Any:
        """One JSON-RPC call, paced and retried (free endpoints answer 429 on bursts)."""
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        delay = self._pace
        for attempt in range(self._retries + 1):
            if delay:
                await asyncio.sleep(delay)
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(self._url, json=payload)
            except httpx.TransportError:
                if attempt == self._retries:
                    raise
                delay = min(30.0, max(self._pace, 1.0) * 2 ** (attempt + 1))
                continue
            if resp.status_code in RETRYABLE_STATUS and attempt < self._retries:
                delay = min(30.0, max(self._pace, 1.0) * 2 ** (attempt + 1))
                continue
            resp.raise_for_status()
            body = resp.json()
            break
        if body.get("error"):
            raise RuntimeError(f"RPC {method} failed: {body['error']}")
        return body.get("result")


def _addr(word: str) -> str:
    return "0x" + word[-40:].lower()


def _words(hex_data: str) -> list[str]:
    raw = hex_data[2:] if hex_data.startswith("0x") else hex_data
    return [raw[i : i + 64] for i in range(0, len(raw) - len(raw) % 64, 64)]


def address_candidates(topics: Sequence[str], data: str) -> list[str]:
    """Address-shaped 32-byte words from a log (topics after topic0, then data), de-duplicated."""
    seen: list[str] = []
    for word in [t[2:] for t in topics[1:]] + _words(data):
        if len(word) != 64 or word[:24] != "0" * 24:
            continue
        addr = _addr(word)
        if addr == ZERO_ADDRESS or int(addr, 16) < 2**96:
            continue
        if addr not in seen:
            seen.append(addr)
    return seen


def parse_launch_struct(result_hex: str, expected_token: str) -> LaunchInfo | None:
    """Decode ``getLaunchedToken`` output; None unless word0 echoes the queried token."""
    words = _words(result_hex)
    if len(words) != STRUCT_WORDS:
        return None
    if _addr(words[0]) != expected_token.lower() or _addr(words[0]) == ZERO_ADDRESS:
        return None
    return LaunchInfo(
        token=_addr(words[0]),
        curve=_addr(words[1]),
        pair_token=_addr(words[4]),
        phase=int(words[10], 16),
    )


async def get_launch_info(rpc: Rpc, factory: str, token: str) -> LaunchInfo | None:
    data = SELECTOR_GET_LAUNCHED_TOKEN + token.lower()[2:].rjust(64, "0")
    try:
        result = await rpc.request("eth_call", [{"to": factory, "data": data}, "latest"])
    except RuntimeError:
        return None
    return parse_launch_struct(str(result), token)


async def resolve_launched_token(rpc: Rpc, factory: str, log: dict[str, Any]) -> LaunchInfo | None:
    for candidate in address_candidates(log.get("topics", []), log.get("data", "0x")):
        info = await get_launch_info(rpc, factory, candidate)
        if info is not None:
            return info
    return None


def _decode_string(result_hex: str) -> str:
    raw = bytes.fromhex(result_hex[2:])
    if len(raw) >= 64:
        length = int.from_bytes(raw[32:64], "big")
        return raw[64 : 64 + length].decode("utf-8", errors="replace")
    return raw.rstrip(b"\x00").decode("utf-8", errors="replace")


async def token_symbol_name(rpc: Rpc, token: str) -> tuple[str, str]:
    async def read(selector: str) -> str:
        try:
            return _decode_string(
                str(await rpc.request("eth_call", [{"to": token, "data": selector}, "latest"]))
            )
        except (RuntimeError, ValueError):
            return ""

    return await read("0x95d89b41"), await read("0x06fdde03")


async def block_timestamp(rpc: Rpc, block_number: int | str) -> int:
    tag = block_number if isinstance(block_number, str) else hex(block_number)
    block = await rpc.request("eth_getBlockByNumber", [tag, False])
    return int(block["timestamp"], 16)


async def curve_quote_reserve(rpc: Rpc, curve: str) -> int | None:
    """Quote tokens raised on the bonding curve (pair-token units); None if unreadable."""
    try:
        result = await rpc.request(
            "eth_call", [{"to": curve, "data": SELECTOR_REAL_QUOTE_RESERVE}, "latest"]
        )
        return int(str(result), 16)
    except (RuntimeError, ValueError):
        return None
