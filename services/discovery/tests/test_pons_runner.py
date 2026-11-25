"""Pons discovery: struct decoding (mainnet sample), DexScreener parsing, and the runner."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from nti_discovery import pons
from nti_discovery.dex import TokenMarket, liquidity_eth, parse_pairs, weth_price_usd
from nti_discovery.runner import DiscoveryConfig, DiscoveryRunner, to_pg_bytea

TSUKI = "0xed6a144a9b4269f4474d2cb042db78c1c0711092"
CURVE = "0xfb45e2937fa56d583f375dd5b904b74badb05b63"
GME = "0x1b0e319c6a659f002271b69db8a7df2f911c153e"
FACTORY = pons.MAINNET_FACTORY
NOW = datetime(2026, 11, 20, 15, 0, tzinfo=UTC)


def word(value: int | str) -> str:
    if isinstance(value, str):
        return value.removeprefix("0x").rjust(64, "0")
    return f"{value:064x}"


def struct_hex(token: str, phase: int, curve: str = CURVE, pair: str = GME) -> str:
    # Layout observed on mainnet for TSUKI (graduated, phase 2).
    words = [
        token,
        curve,
        "0xdfd5468991d4a3bcd07031c3b56ad60c2e5864b1",
        "0xdfd5468991d4a3bcd07031c3b56ad60c2e5864b1",
        pair,
        369 * 10**18,
        0,
        200,
        140,
        0,
        phase,
        0,
        0,
        0,
        1,
    ]
    return "0x" + "".join(word(w) for w in words)


def test_event_topics_match_the_verified_signatures() -> None:
    assert pons.TOPIC_TOKEN_LAUNCHED.startswith("0x8d4aad49")
    assert pons.TOPIC_POOL_GRADUATED.startswith("0x0a44ef75")


def test_parse_launch_struct_decodes_real_layout_and_rejects_foreign_tokens() -> None:
    info = pons.parse_launch_struct(struct_hex(TSUKI, 2), TSUKI)
    assert info is not None
    assert (info.token, info.curve, info.pair_token, info.phase) == (TSUKI, CURVE, GME, 2)
    assert info.graduated
    assert pons.parse_launch_struct(struct_hex(TSUKI, 2), "0x" + "11" * 20) is None
    assert pons.parse_launch_struct("0x" + "00" * 32 * 15, TSUKI) is None
    assert pons.parse_launch_struct("0x" + "00" * 32 * 3, TSUKI) is None
    assert pons.parse_launch_struct(struct_hex(TSUKI, 1), TSUKI).graduated is False  # type: ignore[union-attr]


def test_address_candidates_skip_small_numbers_and_duplicates() -> None:
    topics = [pons.TOPIC_TOKEN_LAUNCHED, "0x" + word(TSUKI)]
    data = "0x" + word(TSUKI) + word(GME) + word(1_000) + word(10**18)
    assert pons.address_candidates(topics, data) == [TSUKI, GME]


def test_dex_parsing_and_eth_conversion() -> None:
    pairs = [
        {
            "chainId": "robinhood",
            "pairAddress": "0xAA",
            "baseToken": {"address": TSUKI.upper()},
            "liquidity": {"usd": 5000.0},
            "txns": {"h24": {"buys": 65, "sells": 61}},
        },
        {
            "chainId": "robinhood",
            "pairAddress": "0xBB",
            "baseToken": {"address": TSUKI},
            "liquidity": {"usd": 100.0},
            "txns": {"h24": {"buys": 1, "sells": 0}},
        },
        {
            "chainId": "solana",
            "pairAddress": "0xCC",
            "baseToken": {"address": "0x1"},
            "liquidity": {"usd": 9},
        },
    ]
    markets = parse_pairs(pairs)
    assert list(markets) == [TSUKI.lower()]
    assert markets[TSUKI].pool == "0xaa" and markets[TSUKI].txs_24h == 126
    assert liquidity_eth(markets[TSUKI], Decimal(2500)) == Decimal(2)
    weth = pons.MAINNET_WETH
    price = weth_price_usd(
        [
            {"baseToken": {"address": weth}, "priceUsd": "2500", "liquidity": {"usd": 1}},
            {"baseToken": {"address": weth}, "priceUsd": "2600", "liquidity": {"usd": 9}},
        ],
        weth,
    )
    assert price == Decimal(2600)


class FakeRpc:
    def __init__(self, launched: dict[str, int], head: int = 1_000) -> None:
        self.launched = launched  # token -> phase
        self.head = head
        self.log_calls: list[tuple[int, int]] = []

    async def request(self, method: str, params: list[Any]) -> Any:
        if method == "eth_blockNumber":
            return hex(self.head)
        if method == "eth_getLogs":
            flt = params[0]
            start, end = int(flt["fromBlock"], 16), int(flt["toBlock"], 16)
            self.log_calls.append((start, end))
            if start <= 500 <= end:
                return [
                    {
                        "topics": [
                            pons.TOPIC_TOKEN_LAUNCHED,
                            "0x" + word(0xCAFE),
                            "0x" + word(TSUKI),
                        ],
                        "data": "0x" + word(GME) + word(5) + word(6),
                        "blockNumber": hex(500),
                    }
                ]
            return []
        if method == "eth_getBlockByNumber":
            return {"timestamp": hex(int(NOW.timestamp()) - 600)}
        if method == "eth_call":
            call = params[0]
            data, to = call["data"], call["to"].lower()
            if to == FACTORY.lower() and data.startswith(pons.SELECTOR_GET_LAUNCHED_TOKEN):
                token = "0x" + data[-40:]
                if token in self.launched:
                    return struct_hex(token, self.launched[token])
                return "0x" + "00" * 32 * 15
            if data == "0x95d89b41":
                return "0x" + word(32) + word(5) + b"TSUKI".hex().ljust(64, "0")
            if data == "0x06fdde03":
                return "0x" + word(32) + word(5) + b"TSUKI".hex().ljust(64, "0")
            raise RuntimeError("execution reverted")
        raise AssertionError(method)


class FakeStorage:
    def __init__(self) -> None:
        self.tokens: dict[str, dict[str, Any]] = {}
        self.alerts: list[dict[str, Any]] = []

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        filters = filters or {}
        if table == "tokens":
            return list(self.tokens.values())
        if table == "posts":
            return [{"tweet_id": 1, "body": "huge $TSUKI narrative, AI agents are early"}]
        if table == "classifications":
            return [{"tweet_id": 1, "q": {"2": 0.9, "9": 0.1}}]
        if table == "epochs":
            return [{"epoch_id": 7}]
        if table == "narrative_epoch":
            return [
                {"narrative_id": 2, "v_bps": 3500, "v_flag": None},
                {"narrative_id": 9, "v_bps": 100, "v_flag": None},
            ]
        if table == "radar_alerts":
            token = filters["token"].removeprefix("eq.")
            return [a for a in self.alerts if a["token"] == token]
        return []

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> None:
        if table == "tokens":
            for row in rows:
                self.tokens[row["address"]] = row
        elif table == "radar_alerts":
            self.alerts.extend(rows)


class FakeMarket:
    def __init__(self, usd: str = "5000", fail: bool = False) -> None:
        self.usd, self.fail = Decimal(usd), fail

    async def markets(self, addresses: list[str]) -> dict[str, TokenMarket]:
        if self.fail:
            raise RuntimeError("dex down")
        return {a: TokenMarket(a, "0xpool", self.usd, 126) for a in addresses}

    async def eth_usd(self, weth: str) -> Decimal | None:
        return Decimal(2500)


def run(
    rpc: FakeRpc, storage: FakeStorage, market: FakeMarket | None, state: Path
) -> dict[str, Any]:
    cfg = DiscoveryConfig(log_range=300, lookback_blocks=900, state_path=state)
    return asyncio.run(DiscoveryRunner(rpc, storage, market, cfg, now=NOW).run())


def test_runner_discovers_launch_enriches_attributes_and_alerts_once(tmp_path: Path) -> None:
    rpc, storage, state = FakeRpc({TSUKI: 2}), FakeStorage(), tmp_path / "state" / "d.json"
    first = run(rpc, storage, FakeMarket(), state)
    assert first["status"] == "ok" and first["new_tokens"] == 1 and first["market_data"] == "ok"
    assert rpc.log_calls == [(100, 399), (400, 699), (700, 999), (1000, 1000)]  # 300-block windows

    row = storage.tokens[to_pg_bytea(TSUKI)]
    assert (row["symbol"], row["source"], row["graduated"]) == ("TSUKI", "pons_v2", True)
    assert Decimal(row["liquidity_eth"]) == Decimal(2) and row["txs_7d"] == 126
    assert row["narrative_id"] == 2  # attributed from the KOL post, not from the log

    assert first["alerts_created"] == 1
    assert storage.alerts[0]["kind"] == "new_token" and storage.alerts[0]["narrative_id"] == 2

    rpc.head = 1_200
    again = run(rpc, storage, FakeMarket(), state)
    assert again["scanned"] == [1001, 1200] and again["new_tokens"] == 0
    assert again["alerts_created"] == 0 and len(storage.alerts) == 1


def test_runner_tolerates_dex_outage_and_marks_up_to_date(tmp_path: Path) -> None:
    rpc, storage, state = FakeRpc({TSUKI: 1}), FakeStorage(), tmp_path / "d.json"
    res = run(rpc, storage, FakeMarket(fail=True), state)
    assert res["market_data"].startswith("error")
    row = storage.tokens[to_pg_bytea(TSUKI)]
    assert row["graduated"] is False and Decimal(row["liquidity_eth"]) == 0
    assert storage.alerts == []  # no liquidity, no alert
    assert run(rpc, storage, None, state)["status"] == "up_to_date"


def test_runner_ignores_logs_for_tokens_the_factory_does_not_know(tmp_path: Path) -> None:
    rpc, storage = FakeRpc({}), FakeStorage()
    res = run(rpc, storage, FakeMarket(), tmp_path / "d.json")
    assert res["new_tokens"] == 0 and storage.tokens == {}


@pytest.mark.parametrize("value", ["0xABCDEF", "abcdef"])
def test_bytea_helpers_roundtrip(value: str) -> None:
    from nti_discovery.runner import from_pg_bytea

    assert from_pg_bytea(to_pg_bytea(value)) == "0xabcdef"


def test_ecosystem_tokens_use_live_market_and_keep_first_seen_time() -> None:
    from datetime import UTC, datetime
    from decimal import Decimal

    from nti_discovery.dex import TokenMarket
    from nti_discovery.runner import ecosystem_tokens

    nvda = "0xAAA0000000000000000000000000000000000001"
    none = "0xBBB0000000000000000000000000000000000002"
    entries = [
        {"address": nvda, "symbol": "NVDA", "narrative_id": 3},
        {"address": none, "symbol": "NONE", "narrative_id": 9},
    ]
    a = entries[0]["address"].lower()
    markets = {a: TokenMarket(address=a, pool="0xpool", liquidity_usd=Decimal("3000"), txs_24h=40)}
    now = datetime(2026, 11, 25, 17, 0, tzinfo=UTC)
    rows = ecosystem_tokens(entries, markets, Decimal("3000"), {}, now)
    by_symbol = {r.symbol: r for r in rows}
    assert by_symbol["NVDA"].liquidity_eth == Decimal("1.0000")
    assert by_symbol["NVDA"].txs_7d == 40 and by_symbol["NVDA"].narrative_id == 3
    assert by_symbol["NVDA"].source == "uniswap" and by_symbol["NVDA"].graduated
    # no market data: nothing is invented
    assert by_symbol["NONE"].liquidity_eth == Decimal(0) and by_symbol["NONE"].txs_7d == 0
    # a second run keeps the first-seen time and never lowers the activity count
    known = {r.address: r for r in rows}
    again = ecosystem_tokens(entries, {}, Decimal("3000"), known, now.replace(hour=21))
    assert {r.symbol: r.created_at for r in again}["NVDA"] == now
    assert {r.symbol: r.txs_7d for r in again}["NVDA"] == 40
