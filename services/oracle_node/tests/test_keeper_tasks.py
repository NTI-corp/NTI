"""Keeper automation tasks against in-memory fake contracts."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from eth_abi import encode as abi_encode
from eth_utils import keccak
from nti_oracle.chain import ChainRpcError
from nti_oracle.keeper_tasks import (
    _guard,
    distribute_fees,
    manage_grant_round,
    run_buyback,
    settle_markets,
    sync_radar_alerts,
    velocity_alert_rows,
)

KEY = "0x" + "11" * 32
ROUND_TYPES = ["uint256", "uint64", "uint64", "uint64", "uint256", "uint256", "bool"]
MARKET_TYPES = [
    "uint8", "uint8", "uint32", "uint32", "uint32",
    "uint256", "uint256", "uint256", "uint256", "uint256", "uint8", "bool",
]


def sel(sig: str) -> bytes:
    return keccak(text=sig)[:4]


class FakeContract:
    def __init__(
        self, answers: dict[str, tuple[list[str], list[Any]]], fail_send: bool = False
    ) -> None:
        self.answers = answers
        self.sent: list[bytes] = []
        self.fail_send = fail_send

    async def _call(self, sig: str, arg_types: Any, args: Any) -> bytes:
        types, values = self.answers[sig if not args else f"{sig}:{args[0]}"]
        return abi_encode(types, values)

    async def _send_tx(self, private_key: str, calldata: bytes) -> str:
        if self.fail_send:
            raise ChainRpcError("NoAvailableBudget")
        self.sent.append(calldata)
        return "0x" + "ab" * 32


def market_row(settle_epoch: int, settled: bool) -> tuple[list[str], list[Any]]:
    return (MARKET_TYPES, [1, 2, 10, settle_epoch, 1, 0, 0, 0, 0, 0, 0, settled])


def test_settle_markets_only_settles_final_or_timed_out() -> None:
    market = FakeContract(
        {
            "nextMarketId()": (["uint256"], [5]),
            "markets(uint256):1": market_row(100, True),
            "markets(uint256):2": market_row(101, False),
            "markets(uint256):3": market_row(102, False),
            "markets(uint256):4": market_row(103, False),
        }
    )
    oracle = FakeContract(
        {
            "epochStatus(uint32):101": (["uint8"], [3]),
            "epochStatus(uint32):102": (["uint8"], [1]),
            "epochStatus(uint32):103": (["uint8"], [0]),
            "epochBoundary(uint32):101": (["uint64"], [1_000]),
            "epochBoundary(uint32):102": (["uint64"], [1_000_000 - 3600]),
            "epochBoundary(uint32):103": (["uint64"], [1_000]),
        }
    )
    res = asyncio.run(settle_markets(market, oracle, private_key=KEY, now=1_000_000))
    assert [s["market_id"] for s in res["settled"]] == [2, 4]
    assert all(c[:4] == sel("settle(uint256)") for c in market.sent)


def test_distribute_fees_idle_then_send() -> None:
    idle = FakeContract(
        {"undistributedBalance()": (["uint256"], [0]), "pendingStakingETH()": (["uint256"], [0])}
    )
    assert asyncio.run(distribute_fees(idle, private_key=KEY))["status"] == "idle"
    assert idle.sent == []
    busy = FakeContract(
        {
            "undistributedBalance()": (["uint256"], [10**15]),
            "pendingStakingETH()": (["uint256"], [0]),
        }
    )
    assert asyncio.run(distribute_fees(busy, private_key=KEY))["status"] == "ok"
    assert busy.sent == [sel("distribute()")]


def _router(pool: int, last: int) -> FakeContract:
    return FakeContract(
        {
            "buybackPool()": (["uint256"], [pool]),
            "maxPerCall()": (["uint256"], [2 * 10**17]),
            "lastBuybackAt()": (["uint256"], [last]),
        }
    )


def test_buyback_respects_ready_flag_minimum_and_cooldown() -> None:
    not_ready = FakeContract({"buybackReady()": (["bool"], [False])})
    ready = FakeContract({"buybackReady()": (["bool"], [True])})
    now = 1_000_000

    res = asyncio.run(run_buyback(_router(10**18, 0), not_ready, private_key=KEY, now=now))
    assert res["reason"] == "buyback_not_ready"
    res = asyncio.run(run_buyback(_router(10, 0), ready, private_key=KEY, now=now))
    assert res["reason"] == "pool_below_minimum"
    res = asyncio.run(run_buyback(_router(10**18, now - 10), ready, private_key=KEY, now=now))
    assert res["reason"] == "cooldown"

    router = _router(10**18, now - 10_000)
    res = asyncio.run(run_buyback(router, ready, private_key=KEY, now=now))
    assert res["status"] == "ok" and res["amount_wei"] == 2 * 10**17
    assert router.sent[0][:4] == sel("executeBuyback(uint256,uint256,uint256,bytes)")


def test_grant_round_finalizes_ended_round_then_starts_next() -> None:
    now = 2_000_000
    grants = FakeContract(
        {
            "currentRoundId()": (["uint256"], [3]),
            "rounds(uint256):3": (ROUND_TYPES, [1, 1, 1, now - 5, 0, 1, False]),
        }
    )
    res = asyncio.run(
        manage_grant_round(grants, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert [a["action"] for a in res["actions"]] == ["finalize", "start"]
    assert grants.sent[0][:4] == sel("finalizeRound(uint256)")
    assert grants.sent[1][:4] == sel("startRound(uint64)")


def test_grant_round_waits_while_vote_is_active_and_skips_empty_budget() -> None:
    now = 2_000_000
    active = FakeContract(
        {
            "currentRoundId()": (["uint256"], [1]),
            "rounds(uint256):1": (ROUND_TYPES, [1, 1, 1, now + 500, 0, 0, False]),
        }
    )
    res = asyncio.run(
        manage_grant_round(active, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert res["status"] == "idle" and active.sent == []

    empty = FakeContract({"currentRoundId()": (["uint256"], [0])}, fail_send=True)
    res = asyncio.run(
        manage_grant_round(empty, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert res["actions"][0]["action"] == "start_skipped"


def test_guard_isolates_failures() -> None:
    async def boom() -> dict[str, Any]:
        raise ChainRpcError("rpc down")

    res = asyncio.run(_guard("buyback", boom))
    assert res["status"] == "error" and res["task"] == "buyback"


def test_velocity_alert_rows_threshold_and_flags() -> None:
    at = datetime(2026, 11, 20, 13, 15, tzinfo=UTC)
    rows = velocity_alert_rows(
        1,
        at,
        [
            {"narrative_id": 2, "v_bps": 7450, "v_flag": None},
            {"narrative_id": 3, "v_bps": 9000, "v_flag": "too_small"},
            {"narrative_id": 4, "v_bps": 5000, "v_flag": None},
            {"narrative_id": 5, "v_bps": None, "v_flag": None},
        ],
    )
    assert [r["narrative_id"] for r in rows] == [2]
    assert rows[0]["public_at"] > rows[0]["detected_at"]


class FakeStorage:
    def __init__(self) -> None:
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
        if table == "epochs":
            return [{"epoch_id": 7, "finalized_at": "2026-11-20T13:15:02+00:00"}]
        if table == "narrative_epoch":
            return [{"narrative_id": 2, "v_bps": 8000, "v_flag": None}]
        if table == "radar_alerts":
            nid = int(filters["narrative_id"].split(".")[1])
            at = filters["detected_at"].split("eq.")[1]
            return [a for a in self.alerts if a["narrative_id"] == nid and a["detected_at"] == at]
        return []

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> None:
        self.alerts.extend(rows)


def test_sync_radar_alerts_is_idempotent() -> None:
    st = FakeStorage()
    assert asyncio.run(sync_radar_alerts(st))["created"] == 1
    assert asyncio.run(sync_radar_alerts(st))["created"] == 0
    assert len(st.alerts) == 1
