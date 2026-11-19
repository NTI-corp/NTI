"""TDD tests for nti_fetcher: accounts, adapters, chaos/failover, storage, purge, profiles."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from nti_core.types import EpochStatus, KolProfile, RawPost
from nti_engine.calc import compute_a_max


def _make_post(
    tweet_id: int,
    user_id: int,
    created_at: datetime,
    handle: str = "kol",
) -> RawPost:
    return RawPost(
        tweet_id=tweet_id,
        user_id=user_id,
        handle=handle,
        created_at=created_at,
        text=f"post {tweet_id}",
        likes=10,
        reposts=2,
        quotes=1,
        replies=3,
        fetched_at=created_at + timedelta(minutes=5),
    )


def _write_accounts_file(path: Path) -> Path:
    payload = {
        "lanes": {
            "0": [
                {"username": "l0_a", "auth_token": "t0a", "ct0": "c0a"},
                {"username": "l0_b", "auth_token": "t0b", "ct0": "c0b"},
                {"username": "l0_c", "auth_token": "t0c", "ct0": "c0c"},
            ],
            "1": [
                {"username": "l1_a", "auth_token": "t1a", "ct0": "c1a"},
                {"username": "l1_b", "auth_token": "t1b", "ct0": "c1b"},
                {"username": "l1_c", "auth_token": "t1c", "ct0": "c1c"},
            ],
            "2": [
                {"username": "l2_a", "auth_token": "t2a", "ct0": "c2a"},
                {"username": "l2_b", "auth_token": "t2b", "ct0": "c2b"},
                {"username": "l2_c", "auth_token": "t2c", "ct0": "c2c"},
            ],
        },
        "validator_pool": [
            {"username": "val_a", "auth_token": "tva", "ct0": "cva"},
            {"username": "val_b", "auth_token": "tvb", "ct0": "cvb"},
            {"username": "val_c", "auth_token": "tvc", "ct0": "cvc"},
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_account_pool_loads_lanes_enforces_800_cap_and_rotates(tmp_path: Path) -> None:
    from nti_fetcher.accounts import AccountPool, AccountPoolExhaustedError

    acct_file = _write_accounts_file(tmp_path / "x_accounts.json")
    state_file = tmp_path / "account_state.json"
    now = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)

    pool = AccountPool.from_file(acct_file, state_path=state_file, daily_limit=800)
    assert len(pool.lane_accounts(0)) == 3
    assert len(pool.lane_accounts(1)) == 3
    assert len(pool.lane_accounts(2)) == 3
    assert len(pool.validator_accounts()) == 3

    # Rotate on rate limit and lock
    first = pool.acquire("lane_0", now=now)
    assert first.username == "l0_a"
    pool.mark_rate_limited("l0_a", cooldown_seconds=900, now=now)
    second = pool.acquire("lane_0", now=now)
    assert second.username == "l0_b"
    pool.mark_locked("l0_b")
    third = pool.acquire("lane_0", now=now)
    assert third.username == "l0_c"

    # Hit daily hard cap of 800 on l0_c and persist across reload
    for _ in range(800):
        pool.record_request("l0_c", now=now)

    reloaded = AccountPool.from_file(acct_file, state_path=state_file, daily_limit=800)
    assert reloaded.daily_count("l0_c", now=now) == 800
    reloaded.mark_rate_limited("l0_a", cooldown_seconds=900, now=now)
    reloaded.mark_locked("l0_b")
    with pytest.raises(AccountPoolExhaustedError):
        reloaded.acquire("lane_0", now=now)

    # Next UTC day resets daily counter for l0_c
    tomorrow = now + timedelta(days=1)
    assert reloaded.daily_count("l0_c", now=tomorrow) == 0
    recovered = reloaded.acquire("lane_0", now=tomorrow)
    assert recovered.username in {"l0_a", "l0_c"}


@pytest.mark.asyncio
async def test_twitterapi_io_strict_50_usd_monthly_cap(tmp_path: Path) -> None:
    from nti_fetcher.adapters import BudgetExceededError, TwitterApiIoSource

    ledger_path = tmp_path / "spend_ledger.json"
    now = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "tweets": [
                    {
                        "id": "101",
                        "author": {"id": "7", "userName": "alice"},
                        "createdAt": "2026-11-19T11:00:00Z",
                        "text": "privacy on chain",
                        "likeCount": 5,
                        "retweetCount": 1,
                        "quoteCount": 0,
                        "replyCount": 2,
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        src = TwitterApiIoSource(
            api_key="test-key",
            ledger_path=ledger_path,
            monthly_budget_usd=Decimal("50.00"),
            cost_per_request_usd=Decimal("25.00"),
            client=client,
            now_fn=lambda: now,
        )
        posts1 = await src.user_timeline(user_id=7, since_id=None)
        assert len(posts1) == 1 and posts1[0].tweet_id == 101
        posts2 = await src.user_timeline(user_id=7, since_id=None)
        assert len(posts2) == 1
        assert src.monthly_spend(now) == Decimal("50.00")

        # 3rd call exceeds $50/mo cap and MUST be refused before HTTP call
        with pytest.raises(BudgetExceededError):
            await src.user_timeline(user_id=7, since_id=None)

        # Persisted across restart
        src_reloaded = TwitterApiIoSource(
            api_key="test-key",
            ledger_path=ledger_path,
            monthly_budget_usd=Decimal("50.00"),
            cost_per_request_usd=Decimal("25.00"),
            client=client,
            now_fn=lambda: now,
        )
        with pytest.raises(BudgetExceededError):
            await src_reloaded.user_timeline(user_id=7, since_id=None)


@pytest.mark.asyncio
async def test_http_fallback_source_pure_http_no_browser() -> None:
    from nti_fetcher.adapters import HttpFallbackSource

    def handler(request: httpx.Request) -> httpx.Response:
        if "UserTweets" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "tweets": [
                        {
                            "tweet_id": 555,
                            "user_id": 42,
                            "handle": "bob",
                            "created_at": "2026-11-19T10:30:00Z",
                            "text": "ai agents momentum",
                            "likes": 40,
                            "reposts": 10,
                            "quotes": 2,
                            "replies": 5,
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={"user_id": 42, "handle": "bob", "followers": 12500},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        src = HttpFallbackSource(base_url="https://x-graphql.internal", client=client)
        posts = await src.user_timeline(user_id=42, since_id=None)
        assert len(posts) == 1
        assert posts[0].tweet_id == 555
        assert posts[0].likes == 40
        profile = await src.user_profile(user_id=42)
        assert profile.followers == 12500


@pytest.mark.asyncio
async def test_runner_tiered_polling_and_3_page_60_post_cap(tmp_path: Path) -> None:
    from nti_fetcher.adapters import InMemoryMockSource
    from nti_fetcher.runner import FetchRunner

    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [
        KolProfile(user_id=1, handle="tier1", followers=10_000, poll_tier=1),
        KolProfile(user_id=2, handle="tier2", followers=10_000, poll_tier=2),
        KolProfile(user_id=3, handle="tier4", followers=10_000, poll_tier=4),
    ]
    # Give KOL 1 85 posts (more than 3 pages x 20 = 60 cap) plus 1 post AFTER boundary
    posts_k1 = [
        _make_post(1000 + i, 1, boundary - timedelta(minutes=100 - i), "tier1") for i in range(85)
    ]
    posts_k1.append(_make_post(9999, 1, boundary + timedelta(minutes=1), "tier1"))
    posts_k2 = [_make_post(2001, 2, boundary - timedelta(minutes=10), "tier2")]
    posts_k3 = [_make_post(3001, 3, boundary - timedelta(minutes=10), "tier4")]

    primary = InMemoryMockSource(
        name="twscrape",
        timelines={1: posts_k1, 2: posts_k2, 3: posts_k3},
    )
    runner = FetchRunner(
        primary=primary,
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        jitter_range=(0.0, 0.0),
    )

    # epoch_id=3 -> only poll_tier=1 is eligible (3 % 2 != 0, 3 % 4 != 0)
    res = await runner.run_cycle(epoch_id=3, boundary=boundary, kols=kols)
    assert res.status == EpochStatus.COLLECTING
    assert res.total_ok == 1
    assert res.total_failed == 0
    # 3 pages x 20 fetched = 60 raw posts; 1 post after boundary dropped -> 59 eligible
    assert res.total_posts == 59
    assert 9999 not in {p.tweet_id for p in res.posts}

    # KOL with 85 pre-boundary posts caps cleanly at exactly 60 (3 pages x 20)
    posts_k1_all_valid = posts_k1[:-1]
    primary_clean = InMemoryMockSource(name="twscrape", timelines={1: posts_k1_all_valid})
    runner_clean = FetchRunner(
        primary=primary_clean,
        output_dir=tmp_path / "snapshots_clean",
        lock_path=tmp_path / "fetcher_clean.lock",
        jitter_range=(0.0, 0.0),
    )
    res_clean = await runner_clean.run_cycle(epoch_id=3, boundary=boundary, kols=[kols[0]])
    assert res_clean.total_posts == 60


@pytest.mark.asyncio
async def test_runner_chaos_failover_sha256_manifest_and_lockfile(tmp_path: Path) -> None:
    from nti_fetcher.adapters import InMemoryMockSource
    from nti_fetcher.runner import CycleLock, CycleLockedError, FetchRunner

    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    # 30 KOLs -> 10 per lane across 3 lanes
    kols = [
        KolProfile(user_id=uid, handle=f"kol_{uid}", followers=20_000, poll_tier=1)
        for uid in range(1, 31)
    ]
    timelines = {
        uid: [_make_post(uid * 100 + 1, uid, boundary - timedelta(minutes=30), f"kol_{uid}")]
        for uid in range(1, 31)
    }

    # Primary dies after 2 calls globally (killing primary mid-cycle -> >10% failure per lane)
    primary = InMemoryMockSource(
        name="twscrape",
        timelines=timelines,
        fail_after_calls=2,
    )
    backup = InMemoryMockSource(name="scweet", timelines=timelines)

    lock_path = tmp_path / "fetcher.lock"
    runner = FetchRunner(
        primary=primary,
        fallback=backup,
        output_dir=tmp_path / "snapshots",
        lock_path=lock_path,
        jitter_range=(0.0, 0.0),
        max_retries=2,
    )

    # Lockfile blocks overlapping run
    with CycleLock(lock_path):
        with pytest.raises(CycleLockedError):
            await runner.run_cycle(epoch_id=100, boundary=boundary, kols=kols)

    # Once released, cycle runs, triggers failover, recovers all 30 KOLs
    res = await runner.run_cycle(epoch_id=100, boundary=boundary, kols=kols)
    assert res.status == EpochStatus.COLLECTING
    assert res.total_ok == 30
    assert res.total_failed == 0
    assert any(lane.failover_triggered for lane in res.lanes)

    # Verify manifest and SHA-256 checksums for every lane file
    epoch_dir = tmp_path / "snapshots" / "100"
    manifest = json.loads((epoch_dir / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["epoch_id"] == 100
    assert len(manifest["lanes"]) == 3
    for lane_entry in manifest["lanes"]:
        lane_file = epoch_dir / lane_entry["file"]
        assert lane_file.exists()
        actual_sha = hashlib.sha256(lane_file.read_bytes()).hexdigest()
        assert actual_sha == lane_entry["sha256"]
    assert not lock_path.exists()


@pytest.mark.asyncio
async def test_runner_marks_incomplete_when_over_1_pct_fail_after_fallback(tmp_path: Path) -> None:
    from nti_fetcher.adapters import InMemoryMockSource
    from nti_fetcher.runner import FetchRunner

    boundary = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    kols = [
        KolProfile(user_id=uid, handle=f"kol_{uid}", followers=10_000, poll_tier=1)
        for uid in range(1, 21)
    ]
    timelines = {
        uid: [_make_post(uid * 10, uid, boundary - timedelta(minutes=15), f"kol_{uid}")]
        for uid in range(1, 21)
    }
    # Fail KOL 1 on both primary and fallback -> 1/20 = 5% > 1% -> INCOMPLETE
    primary = InMemoryMockSource(name="twscrape", timelines=timelines, permanent_fail_ids={1})
    backup = InMemoryMockSource(name="scweet", timelines=timelines, permanent_fail_ids={1})

    runner = FetchRunner(
        primary=primary,
        fallback=backup,
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetcher.lock",
        jitter_range=(0.0, 0.0),
        max_retries=2,
    )
    res = await runner.run_cycle(epoch_id=101, boundary=boundary, kols=kols)
    assert res.status == EpochStatus.INCOMPLETE
    assert res.total_failed == 1
    assert res.total_ok == 19


@pytest.mark.asyncio
async def test_storage_upserts_and_retention_purge_48h_10d() -> None:
    from nti_fetcher.purge import RetentionPurger
    from nti_fetcher.storage import SupabaseStorage

    calls: list[tuple[str, str, dict | list | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        calls.append((request.method, str(request.url), body))
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        store = SupabaseStorage(
            supabase_url="https://demo.supabase.co",
            service_key="svc-secret",
            client=client,
        )
        await store.upsert_fetch_cycles([{"epoch_id": 1, "lane": 0, "source": "twscrape"}])
        await store.upsert_posts([{"tweet_id": 10, "user_id": 1, "body": "hi"}])
        await store.upsert_post_engagement([{"tweet_id": 10, "cycle_id": 1, "likes": 5}])
        await store.upsert_classifications([{"tweet_id": 10, "q": {"1": 0.9}}])
        await store.upsert_epochs([{"epoch_id": 1, "series_id": 1, "status": "collecting"}])
        await store.upsert_narrative_epoch([{"epoch_id": 1, "narrative_id": 1, "i_bps": 1000}])
        await store.upsert_kol_contribution([{"epoch_id": 1, "user_id": 1, "share_bps": 500}])

        assert len(calls) == 7
        assert all(m == "POST" for m, _, _ in calls)

        now = datetime(2026, 11, 19, 2, 0, tzinfo=UTC)
        purger = RetentionPurger(storage=store)
        report = await purger.run(now=now)
        assert report.body_cutoff == now - timedelta(hours=48)
        assert report.metrics_cutoff == now - timedelta(days=10)

        purge_calls = calls[7:]
        assert any(
            m == "PATCH" and "/rest/v1/posts" in url and body == {"body": None}
            for m, url, body in purge_calls
        )
        assert any(m == "DELETE" and "/rest/v1/post_engagement" in url for m, url, _ in purge_calls)


@pytest.mark.asyncio
async def test_monthly_profile_refresh_recomputes_a_max() -> None:
    from nti_fetcher.adapters import InMemoryMockSource
    from nti_fetcher.profiles import refresh_kol_profiles

    existing = [
        KolProfile(user_id=1, handle="a", followers=1000),
        KolProfile(user_id=2, handle="b", followers=5000),
        KolProfile(user_id=3, handle="c", followers=10000),
    ]
    updated_profiles = {
        1: KolProfile(user_id=1, handle="a", followers=2000),
        2: KolProfile(user_id=2, handle="b", followers=8000),
        # user_id 3 fails to fetch -> retains existing followers (fault isolation)
    }
    src = InMemoryMockSource(
        name="twscrape",
        profiles=updated_profiles,
        permanent_fail_ids={3},
    )
    report = await refresh_kol_profiles(existing, source=src)
    assert report.updated_count == 2
    assert report.failed_ids == (3,)
    expected_a_max = compute_a_max([2000, 8000, 10000])
    assert report.a_max == expected_a_max
