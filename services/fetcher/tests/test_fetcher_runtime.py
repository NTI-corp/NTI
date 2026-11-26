"""Production fetcher integration at the external HTTP boundary."""

from __future__ import annotations

import asyncio
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from nti_core.types import EpochStatus, KolProfile
from nti_fetcher.accounts import AccountPool, AccountPoolExhaustedError
from nti_fetcher.adapters import InMemoryMockSource, TwscrapeSource
from nti_fetcher.runner import (
    CycleLock,
    CycleLockedError,
    FetchRunner,
    stagger_tiers_enabled,
)
from twscrape import API, account, queue_client
from twscrape.http import Response


def account_file(path: Path, *, lane: list[str], validators: list[str]) -> Path:
    path.write_text(json.dumps({
        "lanes": {"0": [{"username": name} for name in lane]},
        "validator_pool": [{"username": name} for name in validators],
    }), encoding="utf-8")
    return path


async def seed_accounts(db: Path, names: list[str]) -> None:
    pool = API(str(db)).pool
    for name in names:
        await pool.add_account(name, "", "", "", cookies=f"auth_token={name}; ct0=fixture")


def mock_x(
    monkeypatch: pytest.MonkeyPatch,
    status_codes: dict[str, list[int]],
    request_times: list[float] | None = None,
) -> list[str]:
    attempts: list[str] = []

    class TransactionId:
        def calc(self, method: str, path: str) -> str:
            return "fixture"

    async def transaction_id(*args: Any, **kwargs: Any) -> TransactionId:
        return TransactionId()

    class Transport:
        backend = "fixture"

        def __init__(self, username: str) -> None:
            self.username = username

        async def request(self, method: str, url: str, **kwargs: Any) -> Response:
            attempts.append(self.username)
            if request_times is not None:
                request_times.append(time.monotonic())
            status = status_codes.get(self.username, [])
            code = status.pop(0) if status else 200
            return Response(httpx.Response(
                code, request=httpx.Request(method, url), json={"data": {"user": {}}},
            ))

        async def aclose(self) -> None:
            pass

    monkeypatch.setattr(queue_client.XClIdGenStore, "get", transaction_id)
    monkeypatch.delattr(queue_client.XClIdGenStore, "_nti_fallback", raising=False)
    monkeypatch.setattr(
        account, "_make_http_client", lambda **kw: Transport(kw["cookies"]["auth_token"]),
    )
    return attempts


@pytest.mark.asyncio
async def test_real_twscrape_queue_rotation_cannot_cross_a_lane_or_validator(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = tmp_path / "accounts.db"
    await seed_accounts(db, ["a_outside", "b_lane", "c_lane", "d_val", "e_val", "f_val"])
    cfg = account_file(tmp_path / "accounts.json", lane=["b_lane", "c_lane"],
                       validators=["d_val", "e_val", "f_val"])
    pool = AccountPool.from_file(cfg, state_path=tmp_path / "budget.json")
    attempts = mock_x(monkeypatch, {"b_lane": [429], "e_val": [429]})

    lane = TwscrapeSource(db, pool, "lane_0")
    assert await lane.user_timeline(1, None) == []
    validator = TwscrapeSource(db, pool, "validator_1")
    with pytest.raises(AccountPoolExhaustedError):
        await asyncio.wait_for(validator.user_timeline(1, None), timeout=2)

    assert attempts == ["b_lane", "c_lane", "e_val"]
    assert pool.daily_count("b_lane") == 1
    assert pool.daily_count("c_lane") == 1
    assert pool.daily_count("e_val") == 1


@pytest.mark.asyncio
async def test_real_twscrape_counts_404_retry_and_refuses_send_after_restart(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = tmp_path / "accounts.db"
    await seed_accounts(db, ["lane"])
    cfg = account_file(tmp_path / "accounts.json", lane=["lane"], validators=[])
    budget = tmp_path / "budget.json"
    attempts = mock_x(monkeypatch, {"lane": [404, 200]})

    src = TwscrapeSource(db, AccountPool.from_file(cfg, budget, daily_limit=2))
    assert await src.user_timeline(1, None) == []
    assert attempts == ["lane", "lane"]
    restarted_pool = AccountPool.from_file(cfg, budget, daily_limit=2)
    assert restarted_pool.daily_count("lane") == 2
    with pytest.raises(AccountPoolExhaustedError):
        await asyncio.wait_for(TwscrapeSource(db, restarted_pool).user_timeline(1, None), timeout=2)
    assert attempts == ["lane", "lane"]


@pytest.mark.asyncio
async def test_twscrape_spaces_real_requests_per_account(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = tmp_path / "accounts.db"
    await seed_accounts(db, ["lane"])
    cfg = account_file(tmp_path / "accounts.json", lane=["lane"], validators=[])
    request_times: list[float] = []
    attempts = mock_x(monkeypatch, {}, request_times)
    src = TwscrapeSource(
        db,
        AccountPool.from_file(cfg, tmp_path / "budget.json"),
        request_min_interval_seconds=0.03,
    )

    await src.user_timeline(1, None)
    await src.user_timeline(2, None)

    assert attempts == ["lane", "lane"]
    assert len(request_times) == 2
    assert request_times[1] - request_times[0] >= 0.025


def test_concurrent_budget_instances_never_overwrite_or_exceed_the_shared_cap(
    tmp_path: Path,
) -> None:
    cfg = account_file(tmp_path / "accounts.json", lane=["lane"], validators=[])
    state = tmp_path / "budget.json"
    pools = [AccountPool.from_file(cfg, state, daily_limit=4) for _ in range(12)]

    def reserve(pool: AccountPool) -> bool:
        try:
            pool.record_request("lane")
        except AccountPoolExhaustedError:
            return False
        return True

    with ThreadPoolExecutor(max_workers=len(pools)) as workers:
        accepted = list(workers.map(reserve, pools))

    assert sum(accepted) == 4
    assert AccountPool.from_file(cfg, state).daily_count("lane") == 4


def test_request_spacing_is_shared_and_persists_across_pool_restarts(tmp_path: Path) -> None:
    cfg = account_file(tmp_path / "accounts.json", lane=["lane"], validators=[])
    state = tmp_path / "budget.json"
    now = datetime(2026, 11, 24, 2, 0, tzinfo=UTC)
    pool = AccountPool.from_file(cfg, state)

    assert pool.reserve_request_slot("lane", 20, now) == 0
    assert pool.reserve_request_slot("lane", 20, now) == 20

    restarted = AccountPool.from_file(cfg, state)
    assert restarted.reserve_request_slot("lane", 20, now) == 40
    assert restarted.reserve_request_slot("lane", 20, now + timedelta(seconds=45)) == 15


def test_stale_marker_cannot_unlock_an_active_collection(tmp_path: Path) -> None:
    path = tmp_path / "fetcher.lock"
    with CycleLock(path):
        old = (datetime.now(UTC) - timedelta(hours=3)).timestamp()
        os.utime(path, (old, old))
        with pytest.raises(CycleLockedError), CycleLock(path, stale_seconds=1):
            pass


@pytest.mark.asyncio
async def test_cycle_records_omitted_due_kols_as_incomplete(tmp_path: Path) -> None:
    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [
        KolProfile(user_id=1, handle="high", followers=1_000, poll_tier=1),
        KolProfile(user_id=2, handle="low", followers=1, poll_tier=4),
    ]
    runner = FetchRunner(
        primary=InMemoryMockSource(name="mock", timelines={}),
        output_dir=tmp_path / "snapshots", lock_path=tmp_path / "fetcher.lock",
        jitter_range=(0, 0), max_kols=1,
    )
    result = await runner.run_cycle(4, boundary, kols)
    assert result.status == EpochStatus.INCOMPLETE
    manifest = json.loads(result.manifest_path.read_text())
    assert manifest["due_user_ids"] == [1, 2]
    assert manifest["omitted_user_ids"] == [2]
    assert manifest["total_eligible"] == 2


@pytest.mark.asyncio
async def test_runner_waits_out_temporary_rate_limit_cooldown_for_zero_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = tmp_path / "accounts.db"
    await seed_accounts(db, ["lane"])
    cfg = account_file(tmp_path / "accounts.json", lane=["lane"], validators=[])
    pool = AccountPool.from_file(cfg, state_path=tmp_path / "budget.json")
    pool.mark_rate_limited("lane", cooldown_seconds=0.05)  # type: ignore[arg-type]
    assert pool.seconds_until_available("lane_0") is not None

    mock_x(monkeypatch, {"lane": [200]})
    src = TwscrapeSource(db, pool, "lane_0", request_min_interval_seconds=0.0)
    runner = FetchRunner(
        primary=src,
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        num_lanes=1,
        jitter_range=(0.0, 0.0),
        max_cooldown_wait_seconds=5.0,
    )
    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    result = await runner.run_cycle(
        1, boundary, [KolProfile(user_id=1, handle="alpha", followers=5_000, poll_tier=1)]
    )
    assert result.total_ok == 1
    assert result.total_failed == 0
    assert result.status == EpochStatus.COLLECTING


def test_stagger_tiers_spreads_tier4_evenly_across_four_epochs() -> None:
    kols = [
        KolProfile(user_id=100 + i, handle=f"k{i}", followers=10_000, poll_tier=4)
        for i in range(40)
    ]
    seen: set[int] = set()
    for ep in range(100, 104):
        due = FetchRunner.eligible_kols(kols, ep, stagger_tiers=True)
        assert len(due) == 10
        seen.update(k.user_id for k in due)
    assert len(seen) == 40


def test_stagger_tier_policy_is_shared_and_can_be_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FETCHER_STAGGER_TIERS", raising=False)
    assert stagger_tiers_enabled()
    monkeypatch.setenv("FETCHER_STAGGER_TIERS", "0")
    assert not stagger_tiers_enabled()


@pytest.mark.asyncio
async def test_failed_kols_are_recovered_in_a_later_round_of_the_same_cycle(tmp_path: Path) -> None:
    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [KolProfile(user_id=i, handle=f"k{i}", followers=1_000, poll_tier=1) for i in (1, 2, 3)]
    # KOL 2 fails more times than one fetch's retries allow, then recovers in a later round.
    source = InMemoryMockSource(name="mock", timelines={}, transient_failures={2: 3})
    runner = FetchRunner(
        primary=source,
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        num_lanes=1,
        jitter_range=(0, 0),
        max_retries=3,
        recovery_rounds=2,
        recovery_wait_seconds=0.0,
        recovery_deadline_seconds=60.0,
    )
    result = await runner.run_cycle(1, boundary, kols)
    assert result.total_ok == 3
    assert result.total_failed == 0
    assert result.status == EpochStatus.COLLECTING


@pytest.mark.asyncio
async def test_permanently_failing_kol_stays_failed_after_recovery_rounds(tmp_path: Path) -> None:
    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [KolProfile(user_id=i, handle=f"k{i}", followers=1_000, poll_tier=1) for i in (1, 2)]
    runner = FetchRunner(
        primary=InMemoryMockSource(name="mock", timelines={}, permanent_fail_ids={2}),
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        num_lanes=1,
        jitter_range=(0, 0),
        recovery_rounds=2,
        recovery_wait_seconds=0.0,
        recovery_deadline_seconds=60.0,
    )
    result = await runner.run_cycle(1, boundary, kols)
    assert (result.total_ok, result.total_failed) == (1, 1)
    assert result.status == EpochStatus.INCOMPLETE


@pytest.mark.asyncio
async def test_recovery_stops_at_the_deadline(tmp_path: Path) -> None:
    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [KolProfile(user_id=1, handle="k1", followers=1_000, poll_tier=1)]
    runner = FetchRunner(
        primary=InMemoryMockSource(name="mock", timelines={}, permanent_fail_ids={1}),
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        num_lanes=1,
        jitter_range=(0, 0),
        recovery_rounds=5,
        recovery_wait_seconds=30.0,  # a single wait would already pass the deadline
        recovery_deadline_seconds=1.0,
    )
    result = await asyncio.wait_for(runner.run_cycle(1, boundary, kols), timeout=10)
    assert result.total_failed == 1


def test_oracle_genesis_read_tries_each_comma_separated_endpoint(monkeypatch) -> None:
    import asyncio

    import httpx
    from nti_fetcher import __main__ as fetcher_main

    seen: list[str] = []
    genesis = "0x" + (0).to_bytes(32, "big").hex()

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:
            return None

        async def post(self, url, json=None):
            seen.append(url)
            if "bad" in url:
                raise httpx.ConnectError("Name or service not known")
            request = httpx.Request("POST", url)
            return httpx.Response(200, json={"result": genesis}, request=request)

    monkeypatch.setattr(fetcher_main.httpx, "AsyncClient", FakeClient)
    monkeypatch.setenv("RPC_URL_MAINNET", "https://bad.example,https://good.example")
    value = asyncio.run(fetcher_main._read_oracle_genesis(4663))
    assert value == 0
    assert seen == ["https://bad.example", "https://good.example"]
