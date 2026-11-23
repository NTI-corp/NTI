"""Testnet launch events, pool state, Radar alerts and active Heatmap counts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from eth_utils import keccak
from nti_discovery.runner import DiscoveryConfig, to_pg_bytea
from nti_discovery.token_radar import compute_heatmap
from test_pons_runner import FakeStorage, word

FACTORY = "0x" + "aa" * 20
TOKEN = "0x" + "bb" * 20
POOL = "0x" + "cc" * 20
NOW = datetime(2026, 11, 23, 10, tzinfo=UTC)
LAUNCH_TOPIC = "0x" + keccak(text="TestnetTokenLaunched(address,address,uint8)").hex()


def selector(sig: str) -> str:
    return "0x" + keccak(text=sig)[:4].hex()


class FixtureRpc:
    def __init__(self, *, chain_id: int = 46630, activity: int = 10) -> None:
        self.head = 101
        self.chain_id = chain_id
        self.activity = activity

    async def request(self, method: str, params: list[Any]) -> Any:
        if method == "eth_chainId":
            return hex(self.chain_id)
        if method == "eth_blockNumber":
            return hex(self.head)
        if method == "eth_getBlockByNumber":
            block = int(params[0], 16)
            return {
                "timestamp": hex(int((NOW - timedelta(minutes=max(0, 101 - block))).timestamp()))
            }
        if method == "eth_getBalance":
            assert params == [POOL, hex(self.head)]
            return hex(1_250_000_000_000_000_000)
        if method == "eth_getLogs":
            flt = params[0]
            assert flt["address"] == FACTORY and flt["topics"] == [[LAUNCH_TOPIC]]
            if int(flt["fromBlock"], 16) <= 100 <= int(flt["toBlock"], 16):
                return [
                    {
                        "address": FACTORY,
                        "topics": [LAUNCH_TOPIC, "0x" + word(TOKEN), "0x" + word(POOL)],
                        "data": "0x" + word(2),
                        "blockNumber": hex(100),
                        "logIndex": hex(0),
                    }
                ]
            return []
        if method == "eth_call":
            call = params[0]
            data, to = call["data"], call["to"]
            if to == FACTORY and data == selector("deploymentBlock()"):
                return "0x" + word(99)
            if to == FACTORY and data == selector("poolOf(address)") + word(TOKEN):
                return "0x" + word(POOL)
            if to == POOL and data == selector("token()"):
                return "0x" + word(TOKEN)
            if to == POOL and data.startswith(selector("tradeActivitySince(uint64)")):
                assert int(data[-64:], 16) == int((NOW - timedelta(days=7)).timestamp())
                at = int(NOW.timestamp()) - 10 if self.activity else 0
                return "0x" + word(self.activity) + word(at)
            if to == TOKEN and data in ("0x95d89b41", "0x06fdde03"):
                label = "tNTAI" if data == "0x95d89b41" else "Testnet Narrative AI"
                return "0x" + word(32) + word(len(label)) + label.encode().hex().ljust(64, "0")
        raise AssertionError((method, params))


@pytest.mark.asyncio
async def test_onchain_launch_populates_testnet_alert_and_heatmap(tmp_path: Path) -> None:
    from nti_discovery.runner import _row_to_token
    from nti_discovery.testnet import TestnetDiscoveryRunner

    storage, rpc = FakeStorage(), FixtureRpc()
    config = DiscoveryConfig(factory=FACTORY, state_path=tmp_path / "testnet.json")
    runner = TestnetDiscoveryRunner(rpc, storage, config)
    result = await runner.run()

    assert result["new_tokens"] == 1 and result["alerts_created"] == 1
    row = storage.tokens[to_pg_bytea(TOKEN)]
    assert row["source"] == "testnet_mock" and row["name"] == "Testnet Narrative AI"
    assert row["pool"] == to_pg_bytea(POOL) and row["narrative_id"] == 2
    assert Decimal(row["liquidity_eth"]) == Decimal("1.25")
    assert row["txs_7d"] == 10
    assert len(storage.alerts) == 1
    assert storage.alerts[0]["token"] == to_pg_bytea(TOKEN)
    assert (
        compute_heatmap(mindshare_bps={2: 3000}, tokens=[_row_to_token(row)])[
            0
        ].active_projects_count
        == 1
    )

    rpc.head += 1
    rpc.activity = 0
    again = await runner.run()
    assert again["new_tokens"] == 0 and len(storage.alerts) == 1
    assert storage.tokens[to_pg_bytea(TOKEN)]["txs_7d"] == 0


@pytest.mark.asyncio
async def test_testnet_discovery_rejects_mainnet_rpc_before_reading_logs() -> None:
    from nti_discovery.testnet import TestnetDiscoveryRunner

    runner = TestnetDiscoveryRunner(
        FixtureRpc(chain_id=4663), FakeStorage(), DiscoveryConfig(factory=FACTORY)
    )
    with pytest.raises(ValueError, match="46630"):
        await runner.run()
