"""Operational monitor: epoch timeliness, wallet balances and fetch health -> Telegram.

Meant to run from a PM2 cron every ~30 minutes. Alerts are de-duplicated through a small JSON state
file so a persistent problem pings at most once per cooldown window.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from nti_oracle.node import DisputeWatcher, TelegramNotifier

EPOCH_SECONDS = 14_400
DEFAULT_COOLDOWN_SECONDS = 6 * 3600
# Gas on 4663 is ~0.02 gwei: a commit costs ~0.00003 ETH plus an L1 data share that spikes with
# Ethereum gas. 0.001 ETH is days of normal use: refill when the alert fires.
DEFAULT_MIN_ETH = {4663: Decimal("0.001"), 46630: Decimal("0.0003")}


@dataclass(frozen=True, slots=True)
class MonitorInputs:
    now: int
    genesis_timestamp: int
    last_processed_epoch: int
    latest_final_epoch: int
    balances_eth: dict[str, tuple[str, Decimal]]  # role -> (address, balance)
    fetch_failure_pct: float | None
    fetch_epoch_id: int | None


def default_min_eth(chain_id: int) -> Decimal:
    return DEFAULT_MIN_ETH.get(chain_id, Decimal("0.05"))


class AlertDeduper:
    """Persist alert keys with their last send time so repeats respect a cooldown."""

    def __init__(self, path: Path | None, cooldown_seconds: int = DEFAULT_COOLDOWN_SECONDS) -> None:
        self._path = path
        self._cooldown = cooldown_seconds
        self._state: dict[str, int] = {}
        if path is not None and path.exists():
            try:
                self._state = {str(k): int(v) for k, v in json.loads(path.read_text()).items()}
            except (ValueError, OSError):
                self._state = {}

    def allow(self, key: str, now: int) -> bool:
        last = self._state.get(key)
        if last is not None and now - last < self._cooldown:
            return False
        self._state[key] = now
        return True

    def save(self) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._state))


class _GatedNotifier(TelegramNotifier):
    """Notifier that drops messages the deduper has already sent recently."""

    def __init__(self, inner: TelegramNotifier, deduper: AlertDeduper, now: int) -> None:
        super().__init__("", "")
        self._inner = inner
        self._deduper = deduper
        self._now = now
        self.sent: list[str] = []

    async def send(self, text: str) -> None:
        if self._deduper.allow(text.split(" (+")[0].split(" ETH")[0][:120], self._now):
            self.sent.append(text)
            await self._inner.send(text)


async def run_monitor(
    inputs: MonitorInputs,
    notifier: TelegramNotifier,
    *,
    chain_id: int,
    deduper: AlertDeduper | None = None,
    min_eth: Decimal | None = None,
) -> dict[str, Any]:
    """Evaluate all SLOs once; returns the findings and the alerts actually sent."""
    deduper = deduper or AlertDeduper(None)
    gated = _GatedNotifier(notifier, deduper, inputs.now)
    watcher = DisputeWatcher(gated, min_eth_balance=min_eth or default_min_eth(chain_id))
    findings: list[str] = []

    current_epoch = (inputs.now - inputs.genesis_timestamp) // EPOCH_SECONDS
    for epoch_id in (current_epoch - 1, current_epoch):
        boundary = inputs.genesis_timestamp + epoch_id * EPOCH_SECONDS
        minutes = max(0, (inputs.now - boundary) // 60)
        committed = inputs.last_processed_epoch >= epoch_id
        finalized = inputs.latest_final_epoch >= epoch_id
        if await watcher.check_epoch_timeliness(
            epoch_id, int(minutes), committed=committed, finalized=finalized
        ):
            findings.append(f"epoch_{epoch_id}_late")

    for role, (address, balance) in sorted(inputs.balances_eth.items()):
        if await watcher.check_eth_balance(role, address, balance):
            findings.append(f"low_eth_{role}")

    if inputs.fetch_failure_pct is not None and inputs.fetch_epoch_id is not None:
        if await watcher.check_fetch_health(
            inputs.fetch_epoch_id, inputs.fetch_failure_pct, failover_used=False
        ):
            findings.append("fetch_failures")

    deduper.save()
    return {"role": "monitor", "findings": findings, "alerts_sent": len(gated.sent)}


def default_state_path(repo_root: Path) -> Path:
    return repo_root / "data" / "state" / "monitor_alerts.json"


def now_unix() -> int:
    return int(time.time())
