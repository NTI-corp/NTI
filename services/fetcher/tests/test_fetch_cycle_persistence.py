from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from nti_core.types import KolProfile
from nti_fetcher.__main__ import (
    _epoch_id_at,
    _fetch_jitter_range,
    _persist_to_supabase,
    _request_min_interval_seconds,
)
from nti_fetcher.adapters import InMemoryMockSource
from nti_fetcher.runner import FetchRunner


class CaptureStorage:
    def __init__(self) -> None:
        self.inserts: dict[str, list[dict[str, Any]]] = {}
        self.operations: list[str] = []

    async def insert_returning(
        self, table: str, rows: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        self.operations.append(table)
        self.inserts[table] = rows
        return [{"id": 1}]

    async def upsert_posts(self, rows: list[dict[str, Any]]) -> None:
        raise AssertionError("This fixture has no posts")

    async def upsert_post_engagement(self, rows: list[dict[str, Any]]) -> None:
        raise AssertionError("This fixture has no engagement rows")


def test_fetch_epoch_is_relative_to_oracle_genesis():
    assert _epoch_id_at(1_000_000 + 14_399, 1_000_000, 14_400) == 0
    assert _epoch_id_at(1_000_000 + 14_400, 1_000_000, 14_400) == 1


def test_fetch_jitter_defaults_to_rate_limit_safe_pacing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("FETCHER_JITTER_MIN_SECONDS", raising=False)
    monkeypatch.delenv("FETCHER_JITTER_MAX_SECONDS", raising=False)
    assert _fetch_jitter_range() == (2.0, 4.0)
    monkeypatch.setenv("FETCHER_JITTER_MIN_SECONDS", "20")
    monkeypatch.setenv("FETCHER_JITTER_MAX_SECONDS", "10")
    with pytest.raises(ValueError, match="0 <= minimum <= maximum"):
        _fetch_jitter_range()


def test_x_request_interval_defaults_to_conservative_per_account_pacing(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("X_REQUEST_MIN_INTERVAL_SECONDS", raising=False)
    assert _request_min_interval_seconds() == 5.0
    monkeypatch.setenv("X_REQUEST_MIN_INTERVAL_SECONDS", "-1")
    with pytest.raises(ValueError, match="cannot be negative"):
        _request_min_interval_seconds()


@pytest.mark.asyncio
async def test_persists_one_epoch_level_fetch_run_with_coverage_evidence(tmp_path: Any) -> None:
    kols = [
        KolProfile(user_id=1, handle="first", followers=100),
        KolProfile(user_id=2, handle="omitted", followers=10),
    ]
    runner = FetchRunner(
        primary=InMemoryMockSource(name="mock", timelines={}),
        output_dir=tmp_path / "snapshots",
        lock_path=tmp_path / "fetch.lock",
        jitter_range=(0, 0),
        max_kols=1,
    )
    result = await runner.run_cycle(
        12,
        datetime(2026, 11, 24, tzinfo=UTC),
        kols,
    )
    storage = CaptureStorage()

    await _persist_to_supabase(storage, 12, result)

    assert result.status.value == "incomplete"
    run = storage.inserts["fetch_cycle_runs"][0]
    assert run["epoch_id"] == 12
    assert run["status"] == "incomplete"
    assert run["total_eligible"] == 2
    assert run["accounts_ok"] == 1
    assert run["accounts_failed"] == 0
    assert run["due_user_ids"] == [1, 2]
    assert run["omitted_user_ids"] == [2]
    assert run["manifest_sha256"] == result.manifest_sha256
    assert run["failure_types"] == {}
    assert run["started_at"] == result.started_at
    assert run["finished_at"] == result.finished_at
    assert storage.operations[-1] == "fetch_cycle_runs"
