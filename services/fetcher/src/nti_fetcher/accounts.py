"""X account pool management with 3 primary lanes, validator pool, and 800 req/day hard cap."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from errno import EACCES, EAGAIN, EDEADLK
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any


class AccountPoolExhaustedError(RuntimeError):
    """Raised when no unlocked, non-rate-limited account under daily cap remains."""


class FileLockBusyError(RuntimeError):
    """Another process holds the advisory lock."""


@contextmanager
def locked_file(path: Path, *, timeout: float = 10) -> Iterator[None]:
    """Hold a process-owned lock on a stable inode, including across atomic replacement."""
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout
    with path.open("a+b") as stream:
        while True:
            try:
                if os.name == "nt":
                    import msvcrt

                    stream.seek(0)
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError as exc:
                if exc.errno not in {EACCES, EAGAIN, EDEADLK}:
                    raise
                if time.monotonic() >= deadline:
                    raise FileLockBusyError(f"Lock already held: {path}") from exc
                time.sleep(0.025)
        yield


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False,
    ) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(payload, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
            stream.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


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
        names = [a.username.casefold() for accounts in self._pools.values() for a in accounts]
        if len(names) != len(set(names)):
            raise ValueError("X accounts must be unique across primary and validator pools")
        self._pools.update({
            f"validator_{i}": [account]
            for i, account in enumerate(self._pools.get("validator", []))
        })
        if not 1 <= daily_limit <= 800:
            raise ValueError("The X daily request limit must be between 1 and 800")
        self._state_path = state_path
        self._daily_limit = daily_limit
        self._cursors: dict[str, int] = {k: 0 for k in self._pools}
        self._locked: set[str] = set()
        self._cooldown_until: dict[str, float] = {}
        self._next_request_at: dict[str, float] = {}
        # { "YYYY-MM-DD": { username: count } }
        self._daily_counts: dict[str, dict[str, int]] = {}

    @classmethod
    def from_file(
        cls,
        path: str | Path,
        state_path: str | Path | None = None,
        daily_limit: int = 800,
    ) -> AccountPool:
        path = Path(path)
        raw = json.loads(path.read_text(encoding="utf-8"))
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
            state_path=Path(state_path) if state_path is not None else
            path.resolve().parent.parent / "data/state/x_budget.json",
            daily_limit=daily_limit,
        )

    def lane_accounts(self, lane: int) -> list[XAccount]:
        return self.accounts_for(f"lane_{lane}")

    def validator_accounts(self) -> list[XAccount]:
        return self.accounts_for("validator")

    def accounts_for(self, pool_key: str) -> list[XAccount]:
        return list(self._pools.get(pool_key, []))

    @staticmethod
    def _day_key(now: datetime | None) -> str:
        ts = now or datetime.now(UTC)
        return ts.astimezone(UTC).strftime("%Y-%m-%d")

    def daily_count(self, username: str, now: datetime | None = None) -> int:
        day = self._day_key(now)
        with self._state():
            return self._daily_counts.get(day, {}).get(username.casefold(), 0)

    def record_request(self, username: str, count: int = 1, now: datetime | None = None) -> int:
        """Reserve attempts before sending. An uncertain send still consumes its reservation."""
        username = username.casefold()
        now = now or datetime.now(UTC)
        if count < 1:
            raise ValueError("The number of X requests must be positive")
        with self._state():
            day_map = self._daily_counts.setdefault(self._day_key(now), {})
            new_count = day_map.get(username, 0) + count
            if not self._is_available(username, now) or new_count > self._daily_limit:
                raise AccountPoolExhaustedError("X account is unavailable for another request")
            day_map[username] = new_count
            self._save_state()
            return new_count

    def reserve_request_slot(
        self,
        username: str,
        min_interval_seconds: float,
        now: datetime | None = None,
    ) -> float:
        """Reserve a serialized request slot and return seconds to wait before sending."""
        username = username.casefold()
        if min_interval_seconds < 0:
            raise ValueError("The minimum X request interval cannot be negative")
        now_ts = (now or datetime.now(UTC)).timestamp()
        with self._state():
            scheduled_at = max(now_ts, self._next_request_at.get(username, 0.0))
            self._next_request_at[username] = scheduled_at + min_interval_seconds
            self._save_state()
            return max(0.0, scheduled_at - now_ts)

    def mark_rate_limited(
        self,
        username: str,
        cooldown_seconds: int = 900,
        now: datetime | None = None,
    ) -> None:
        ts = now or datetime.now(UTC)
        username = username.casefold()
        end = (ts + timedelta(seconds=cooldown_seconds)).timestamp()
        with self._state():
            self._cooldown_until[username] = max(self._cooldown_until.get(username, 0), end)
            self._save_state()

    def mark_locked(self, username: str) -> None:
        with self._state():
            self._locked.add(username.casefold())
            self._save_state()

    def is_available(self, username: str, now: datetime | None = None) -> bool:
        with self._state():
            return self._is_available(username.casefold(), now or datetime.now(UTC))

    def _is_available(self, username: str, now: datetime) -> bool:
        if username in self._locked:
            return False
        if self._daily_counts.get(self._day_key(now), {}).get(username, 0) >= self._daily_limit:
            return False
        return now.timestamp() >= self._cooldown_until.get(username, 0.0)

    def available_names(self, pool_key: str) -> list[str]:
        now = datetime.now(UTC)
        with self._state():
            return [
                account.username for account in self.accounts_for(pool_key)
                if self._is_available(account.username.casefold(), now)
            ]

    def seconds_until_available(
        self,
        pool_key: str,
        now: datetime | None = None,
    ) -> float | None:
        """Seconds until any non-locked, under-daily-cap account exits cooldown; None if none."""
        accounts = self._pools.get(pool_key, [])
        if not accounts:
            return None
        ts = now or datetime.now(UTC)
        now_ts = ts.timestamp()
        day = self._day_key(ts)
        waits: list[float] = []
        with self._state():
            day_map = self._daily_counts.get(day, {})
            for account in accounts:
                uname = account.username.casefold()
                if uname in self._locked:
                    continue
                if day_map.get(uname, 0) >= self._daily_limit:
                    continue
                until = self._cooldown_until.get(uname, 0.0)
                if now_ts >= until:
                    return 0.0
                waits.append(until - now_ts)
        return min(waits) if waits else None

    def acquire(self, pool_key: str, now: datetime | None = None) -> XAccount:
        accounts = self._pools.get(pool_key, [])
        if not accounts:
            raise AccountPoolExhaustedError(f"No accounts configured for pool {pool_key}")

        start = self._cursors.get(pool_key, 0) % len(accounts)
        now = now or datetime.now(UTC)
        with self._state():
            for offset in range(len(accounts)):
                idx = (start + offset) % len(accounts)
                candidate = accounts[idx]
                if self._is_available(candidate.username.casefold(), now):
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
        with self._state():
            day_map = self._daily_counts.get(day, {})
            return sorted((u, c) for u, c in day_map.items() if c >= cutoff)

    def locked_accounts(self) -> set[str]:
        with self._state():
            return set(self._locked)

    @contextmanager
    def _state(self) -> Iterator[None]:
        if self._state_path is None:
            yield
            return
        with locked_file(self._state_path.with_suffix(self._state_path.suffix + ".lock")):
            self._load_state()
            yield

    def _load_state(self) -> None:
        if self._state_path is None or not self._state_path.exists():
            return
        data: dict[str, Any] = json.loads(self._state_path.read_text(encoding="utf-8"))
        self._daily_counts = {
            str(day): {str(u).casefold(): int(c) for u, c in counts.items()}
            for day, counts in data.get("daily_counts", {}).items()
        }
        self._locked = {str(u).casefold() for u in data.get("locked", [])}
        self._cooldown_until = {
            str(u).casefold(): float(ts) for u, ts in data.get("cooldown_until", {}).items()
        }
        self._next_request_at = {
            str(u).casefold(): float(ts) for u, ts in data.get("next_request_at", {}).items()
        }

    def _save_state(self) -> None:
        if self._state_path is None:
            return
        payload = {
            "daily_counts": self._daily_counts,
            "locked": sorted(self._locked),
            "cooldown_until": self._cooldown_until,
            "next_request_at": self._next_request_at,
        }
        atomic_write_json(self._state_path, payload)
