"""Monitor SLO checks and alert de-duplication."""

from __future__ import annotations

import asyncio
from decimal import Decimal
from pathlib import Path

from nti_oracle.monitor import AlertDeduper, MonitorInputs, default_min_eth, run_monitor
from nti_oracle.node import TelegramNotifier

GENESIS = 0
EPOCH = 14_400


def inputs(now: int, last_processed: int, latest_final: int, **kw: object) -> MonitorInputs:
    return MonitorInputs(
        now=now,
        genesis_timestamp=GENESIS,
        last_processed_epoch=last_processed,
        latest_final_epoch=latest_final,
        balances_eth=kw.get("balances_eth", {}),  # type: ignore[arg-type]
        fetch_failure_pct=kw.get("fetch_failure_pct"),  # type: ignore[arg-type]
        fetch_epoch_id=kw.get("fetch_epoch_id"),  # type: ignore[arg-type]
    )


def run(i: MonitorInputs, sink: list[str], deduper: AlertDeduper | None = None) -> dict:
    return asyncio.run(
        run_monitor(i, TelegramNotifier("", "", sink=sink), chain_id=46630, deduper=deduper)
    )


def test_healthy_pipeline_sends_nothing() -> None:
    now = 100 * EPOCH + 30 * 60  # 30 minutes into epoch 100; epoch 99 final, 100 not yet due
    sink: list[str] = []
    res = run(inputs(now, last_processed=99, latest_final=99), sink)
    assert res["findings"] == [] and sink == []


def test_late_commit_and_finalize_alerts() -> None:
    now = 100 * EPOCH + 130 * 60  # epoch 100 not committed after 130 minutes
    sink: list[str] = []
    res = run(inputs(now, last_processed=99, latest_final=99), sink)
    assert "epoch_100_late" in res["findings"]
    assert any("stage 'commit'" in m for m in sink)

    now = 100 * EPOCH + 250 * 60  # committed but never finalized
    sink = []
    res = run(inputs(now, last_processed=100, latest_final=99), sink)
    assert "epoch_100_late" in res["findings"]
    assert any("stage 'finalize'" in m for m in sink)


def test_low_eth_threshold_is_chain_specific() -> None:
    assert default_min_eth(4663) == Decimal("0.003")
    assert default_min_eth(46630) < Decimal("0.01")
    sink: list[str] = []
    res = run(
        inputs(
            100 * EPOCH + 60,
            99,
            99,
            balances_eth={
                "operator": ("0xaaa", Decimal("0.0001")),
                "keeper": ("0xbbb", Decimal("0.01")),
            },
        ),
        sink,
    )
    assert res["findings"] == ["low_eth_operator"]


def test_fetch_failure_alert() -> None:
    sink: list[str] = []
    res = run(inputs(100 * EPOCH + 60, 99, 99, fetch_failure_pct=4.5, fetch_epoch_id=100), sink)
    assert res["findings"] == ["fetch_failures"]


def test_deduper_suppresses_repeats_within_cooldown(tmp_path: Path) -> None:
    state = tmp_path / "state" / "alerts.json"
    now = 100 * EPOCH + 130 * 60
    sink: list[str] = []
    first = run(inputs(now, 99, 99), sink, AlertDeduper(state, cooldown_seconds=3600))
    again = run(inputs(now + 600, 99, 99), sink, AlertDeduper(state, cooldown_seconds=3600))
    later = run(inputs(now + 7200, 99, 99), sink, AlertDeduper(state, cooldown_seconds=3600))
    assert first["alerts_sent"] == 1
    assert again["alerts_sent"] == 0
    assert later["alerts_sent"] == 1
