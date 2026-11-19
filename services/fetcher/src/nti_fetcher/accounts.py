"""X account pool management with 3 primary lanes, validator pool, and 800 req/day hard cap."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


class AccountPoolExhaustedError(RuntimeError):
    """Raised when no unlocked, non-rate-limited account under daily cap remains."""


@dataclass(frozen=True, slots=True)
class XAccount:
    username: str
    auth_token: str
    ct0: str
    pool_key: str
    proxy: str | None = None


class AccountPool:
    """Tracks X account cookies across 3 primary lanes + validator pool with daily limits."""

    def __init__(
        self,
        pools: dict[str, list[XAccount]],
        state_path: Path | None = None,
        daily_limit: int = 800,
    ) -> None:
        self._pools = {k: list(v) for k, v in pools.items()}
        self._state_path = state_path
        self._daily_limit = daily_limit
        self._cursors: dict[str, int] = {k: 0 for k in self._pools}
        self._locked: set[str] = set()
        self._cooldown_until: dict[str, float] = {}
        # { "YYYY-MM-DD": { username: count } }
        self._daily_counts: dict[str, dict[str, int]] = {}
        self._load_state()

    @classmethod
    def from_file(
        cls,
        path: str | Path,
        state_path: str | Path | None = None,
        daily_limit: int = 800,
    ) -> AccountPool:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        pools: dict[str, list[XAccount]] = {}

        lanes_raw = raw.get("lanes")
        if lanes_raw is None:
            lanes_raw = raw.get("primary_lanes", {})

        if isinstance(lanes_raw, list):
            for idx, entry in enumerate(lanes_raw):
                if isinstance(entry, dict) and "accounts" in entry:
                    lane_num = int(entry.get("lane", idx + 1))
                    key = f"lane_{lane_num - 1}" if lane_num >= 1 else f"lane_{idx}"
                    items = entry["accounts"]
                else:
                    key = f"lane_{idx}"
                    items = entry
                pools[key] = [
                    XAccount(
                        username=a["username"],
                        auth_token=a.get("auth_token", ""),
                        ct0=a.get("ct0", ""),
                        pool_key=key,
                        proxy=a.get("proxy"),
                    )
                    for a in items
                ]
        elif isinstance(lanes_raw, dict):
            for lane_id, items in lanes_raw.items():
                key = lane_id if str(lane_id).startswith("lane_") else f"lane_{lane_id}"
                pools[key] = [
                    XAccount(
                        username=a["username"],
                        auth_token=a.get("auth_token", ""),
                        ct0=a.get("ct0", ""),
                        pool_key=key,
                        proxy=a.get("proxy"),
                    )
                    for a in items
                ]

        val_raw = raw.get("validator_pool", [])
        pools["validator"] = [
            XAccount(
                username=a["username"],
                auth_token=a.get("auth_token", ""),
                ct0=a.get("ct0", ""),
                pool_key="validator",
                proxy=a.get("proxy"),
            )
            for a in val_raw
        ]

        return cls(
            pools=pools,
            state_path=Path(state_path) if state_path is not None else None,
            daily_limit=daily_limit,
        )

    def lane_accounts(self, lane: int) -> list[XAccount]:
        return list(self._pools.get(f"lane_{lane}", []))

    def validator_accounts(self) -> list[XAccount]:
        return list(self._pools.get("validator", []))

    @staticmethod
    def _day_key(now: datetime | None) -> str:
        ts = now or datetime.now(UTC)
        return ts.astimezone(UTC).strftime("%Y-%m-%d")

    def daily_count(self, username: str, now: datetime | None = None) -> int:
        day = self._day_key(now)
        return self._daily_counts.get(day, {}).get(username, 0)

    def record_request(self, username: str, count: int = 1, now: datetime | None = None) -> int:
        day = self._day_key(now)
        day_map = self._daily_counts.setdefault(day, {})
        day_map[username] = day_map.get(username, 0) + count
        self._save_state()
        return day_map[username]

    def mark_rate_limited(
        self,
        username: str,
        cooldown_seconds: int = 900,
        now: datetime | None = None,
    ) -> None:
        ts = now or datetime.now(UTC)
        self._cooldown_until[username] = (ts + timedelta(seconds=cooldown_seconds)).timestamp()
        self._save_state()

    def mark_locked(self, username: str) -> None:
        self._locked.add(username)
        self._save_state()

    def is_available(self, username: str, now: datetime | None = None) -> bool:
        if username in self._locked:
            return False
        if self.daily_count(username, now=now) >= self._daily_limit:
            return False
        ts = (now or datetime.now(UTC)).timestamp()
        until = self._cooldown_until.get(username, 0.0)
        return ts >= until

    def acquire(self, pool_key: str, now: datetime | None = None) -> XAccount:
        accounts = self._pools.get(pool_key, [])
        if not accounts:
            raise AccountPoolExhaustedError(f"No accounts configured for pool {pool_key}")

        start = self._cursors.get(pool_key, 0) % len(accounts)
        for offset in range(len(accounts)):
            idx = (start + offset) % len(accounts)
            candidate = accounts[idx]
            if self.is_available(candidate.username, now=now):
                self._cursors[pool_key] = (idx + 1) % len(accounts)
                return candidate

        raise AccountPoolExhaustedError(f"All accounts exhausted in pool {pool_key}")

    def near_limit_accounts(
        self,
        threshold_ratio: float = 0.9,
        now: datetime | None = None,
    ) -> list[tuple[str, int]]:
        cutoff = int(self._daily_limit * threshold_ratio)
        day = self._day_key(now)
        day_map = self._daily_counts.get(day, {})
        return sorted((u, c) for u, c in day_map.items() if c >= cutoff)

    def locked_accounts(self) -> set[str]:
        return set(self._locked)

    def _load_state(self) -> None:
        if self._state_path is None or not self._state_path.exists():
            return
        data: dict[str, Any] = json.loads(self._state_path.read_text(encoding="utf-8"))
        self._daily_counts = {
            str(day): {str(u): int(c) for u, c in counts.items()}
            for day, counts in data.get("daily_counts", {}).items()
        }
        self._locked = set(data.get("locked", []))
        self._cooldown_until = {
            str(u): float(ts) for u, ts in data.get("cooldown_until", {}).items()
        }

    def _save_state(self) -> None:
        if self._state_path is None:
            return
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "daily_counts": self._daily_counts,
            "locked": sorted(self._locked),
            "cooldown_until": self._cooldown_until,
        }
        self._state_path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
