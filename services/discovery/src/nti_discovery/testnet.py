"""Robinhood testnet discovery from the dedicated launch factory and its funded pools."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from eth_utils import is_address, keccak

from nti_discovery import pons
from nti_discovery.runner import (
    RECENT_DAYS,
    DiscoveryConfig,
    DiscoveryRunner,
    Storage,
    _row_to_token,
    _token_to_row,
)
from nti_discovery.token_radar import DiscoveredToken

TESTNET_CHAIN_ID = 46630
TESTNET_SOURCE = "testnet_mock"
TOPIC_LAUNCH = "0x" + keccak(text="TestnetTokenLaunched(address,address,uint8)").hex()


def _words(raw: Any, expected_count: int) -> tuple[int, ...]:
    if not isinstance(raw, str) or not raw.startswith("0x") or len(raw) != 2 + 64 * expected_count:
        raise ValueError("Unexpected testnet discovery ABI response")
    return tuple(int(raw[i : i + 64], 16) for i in range(2, len(raw), 64))


def _address(value: int) -> str:
    if not 0 < value < 1 << 160:
        raise ValueError("Invalid testnet launch address")
    return f"0x{value:040x}"


class TestnetDiscoveryRunner(DiscoveryRunner):
    def __init__(
        self,
        rpc: pons.Rpc,
        storage: Storage,
        config: DiscoveryConfig,
        *,
        initial_lookback: int | None = None,
    ) -> None:
        if not is_address(config.factory) or int(config.factory, 16) == 0:
            raise ValueError("Invalid testnet discovery factory address")
        if initial_lookback is not None and initial_lookback < 0:
            raise ValueError("Discovery lookback must be nonnegative")
        if config.max_blocks_per_run < 1:
            raise ValueError("Discovery max blocks per run must be positive")
        super().__init__(rpc, storage, None, config)
        self._initial_lookback = initial_lookback

    async def _call_words(
        self, to: str, signature: str, block: int, count: int, *args: int
    ) -> tuple[int, ...]:
        data = "0x" + keccak(text=signature)[:4].hex() + "".join(f"{v:064x}" for v in args)
        result = await self._rpc.request("eth_call", [{"to": to, "data": data}, hex(block)])
        return _words(result, count)

    async def _resolve_launch(self, log: dict[str, Any], block: int) -> DiscoveredToken | None:
        if log.get("removed") or str(log.get("address", "")).lower() != self._cfg.factory.lower():
            return None
        topic, token_topic, pool_topic = log["topics"]
        if topic.lower() != TOPIC_LAUNCH:
            return None
        token = _address(_words(token_topic, 1)[0])
        pool = _address(_words(pool_topic, 1)[0])
        (narrative_id,) = _words(log["data"], 1)
        (registered_pool,) = await self._call_words(
            self._cfg.factory, "poolOf(address)", block, 1, int(token, 16)
        )
        (pool_token,) = await self._call_words(pool, "token()", block, 1)
        if registered_pool != int(pool, 16) or pool_token != int(token, 16):
            raise ValueError("Testnet launch token/pool does not match factory registration")
        if not 0 < narrative_id <= 32:
            raise ValueError("Testnet launch has an invalid narrative ID")
        symbol, name = await pons.token_symbol_name(self._rpc, token)
        if not symbol or not name.startswith("Testnet Narrative "):
            raise ValueError("Testnet launch token metadata is missing its fixture label")
        created = await pons.block_timestamp(self._rpc, str(log["blockNumber"]))
        return DiscoveredToken(
            address=token,
            symbol=symbol,
            name=name,
            created_at=datetime.fromtimestamp(created, UTC),
            source=TESTNET_SOURCE,
            graduated=True,
            pool=pool,
            liquidity_eth=Decimal(0),
            narrative_id=narrative_id,
        )

    async def _refresh_pool(
        self, token: DiscoveredToken, *, block: int, cutoff: int, block_ts: int
    ) -> DiscoveredToken:
        if token.pool is None:
            raise ValueError("Testnet launch has no registered pool")
        pool = token.pool
        (count, latest) = await self._call_words(
            pool, "tradeActivitySince(uint64)", block, 2, cutoff
        )
        if (count and not cutoff <= latest <= block_ts) or (not count and latest):
            raise ValueError("Invalid testnet pool activity window")
        reserve = await self._rpc.request("eth_getBalance", [pool, hex(block)])
        return replace(
            token,
            liquidity_eth=Decimal(int(reserve, 16)) / Decimal(10**18),
            txs_7d=count,
            last_activity_at=datetime.fromtimestamp(latest, UTC) if count else None,
        )

    async def run(self) -> dict[str, Any]:
        chain_id = int(await self._rpc.request("eth_chainId", []), 16)
        if chain_id != TESTNET_CHAIN_ID:
            raise ValueError("The testnet discovery source requires chain 46630")
        head = int(await self._rpc.request("eth_blockNumber", []), 16)
        last = self._load_last_block()
        if last is None:
            (start,) = await self._call_words(self._cfg.factory, "deploymentBlock()", head, 1)
            if self._initial_lookback is not None:
                start = max(start, head - self._initial_lookback)
        else:
            start = last + 1
        end = min(head, start + self._cfg.max_blocks_per_run - 1)
        result = {"role": "discovery", "chain_id": chain_id, "source": TESTNET_SOURCE}
        if start > end:
            return {**result, "status": "up_to_date", "head": head}

        logs = await self._scan(start, end, (TOPIC_LAUNCH,))
        known = await self._storage.select(
            "tokens", filters={"source": f"eq.{TESTNET_SOURCE}"}, order="address.asc"
        )
        tokens = {token.address: token for token in map(_row_to_token, known)}
        old_addresses = set(tokens)
        for log in sorted(
            logs, key=lambda log: (int(log["blockNumber"], 16), int(log["logIndex"], 16))
        ):
            new_token = await self._resolve_launch(log, end)
            if new_token:
                tokens[new_token.address] = new_token

        block_ts = await pons.block_timestamp(self._rpc, end)
        observed_at = datetime.fromtimestamp(block_ts, UTC)
        cutoff = observed_at - timedelta(days=RECENT_DAYS)
        enriched = []
        for token in tokens.values():
            if token.created_at <= observed_at:
                enriched.append(
                    await self._refresh_pool(
                        token, block=end, cutoff=max(0, int(cutoff.timestamp())), block_ts=block_ts
                    )
                )
        await self._storage.upsert("tokens", [_token_to_row(t) for t in enriched], "address")
        # Retry recently launched fixtures across discovery runs so an alert can be written after
        # a failed database write or when the first final rising epoch becomes available.
        alerts = await self._emit_token_alerts(
            [t for t in enriched if t.created_at >= cutoff], detected_at=observed_at
        )
        self._save_last_block(end)
        return {
            **result,
            "status": "ok",
            "scanned": [start, end],
            "logs": len(logs),
            "new_tokens": len(set(tokens) - old_addresses),
            "tracked_tokens": len(tokens),
            "market_data": "onchain_testnet_pool",
            "alerts_created": alerts,
        }
