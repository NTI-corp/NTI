"""Hands-off KOL universe upkeep, run by the daily harvest job.

* ``import_seed``       curated ``data/kols.json`` is mirrored into Supabase (one source of truth).
* ``adaptive_budget``   growth speed follows recent fetch-cycle health (pause / slow / full).
* ``refresh_profiles``  stale follower counts refresh; suspended or deleted accounts deactivate.
* ``retier``            poll tier follows how often a KOL actually posted in the last 7 days.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

from nti_discovery.kol_harvest import poll_tier_for


class Storage(Protocol):
    async def select(self, table: str, **kw: Any) -> list[dict[str, Any]]: ...
    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> Any: ...
    async def patch(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> Any: ...


class ProfileSource(Protocol):
    async def profile(self, user_id: int) -> tuple[str, int] | None:
        """Return (handle, followers) or None when the account no longer exists."""


async def import_seed(storage: Storage, seed_path: Path) -> int:
    """Insert curated KOLs that Supabase does not know yet (never overwrites existing rows)."""
    if not seed_path.exists():
        return 0
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    known = {int(r["user_id"]) for r in await storage.select("kols", columns="user_id")}
    rows = [
        {
            "user_id": int(k["user_id"]),
            "handle": str(k["handle"]),
            "followers": int(k.get("followers", 0)),
            "h_k": int(k.get("h_k", 1)),
            "poll_tier": int(k.get("poll_tier", 1)),
            "active": bool(k.get("active", True)),
        }
        for k in seed
        if int(k["user_id"]) not in known
    ]
    await storage.upsert("kols", rows, on_conflict="user_id")
    return len(rows)


async def adaptive_budget(storage: Storage, full: int, *, cycles: int = 4) -> tuple[int, str]:
    """Growth budget from the failure ratio of the most recent fetch cycles."""
    rows = await storage.select(
        "fetch_cycles",
        columns="accounts_ok,accounts_failed",
        order="id.desc",
        limit=cycles,
    )
    ok = sum(int(r["accounts_ok"]) for r in rows)
    failed = sum(int(r["accounts_failed"]) for r in rows)
    total = ok + failed
    if total == 0:
        return full // 3, "no_history"
    ratio = failed / total
    if ratio > 0.30:
        return 0, f"paused_failure_ratio_{ratio:.2f}"
    if ratio > 0.10:
        return full // 3, f"slow_failure_ratio_{ratio:.2f}"
    return full, f"full_failure_ratio_{ratio:.2f}"


async def refresh_profiles(
    storage: Storage,
    source: ProfileSource,
    now: datetime,
    *,
    stale_days: int = 7,
    batch: int = 100,
) -> dict[str, int]:
    cutoff = (now - timedelta(days=stale_days)).isoformat()
    stale = await storage.select(
        "kols",
        columns="user_id,handle",
        filters={
            "active": "eq.true",
            "or": f"(followers_updated_at.is.null,followers_updated_at.lt.{cutoff})",
        },
        order="followers_updated_at.asc.nullsfirst",
        limit=batch,
    )
    refreshed = deactivated = failed = 0
    for r in stale:
        uid = int(r["user_id"])
        try:
            prof = await source.profile(uid)
        except Exception:  # noqa: BLE001 - transient scraper errors must not deactivate anyone
            failed += 1
            continue
        if prof is None:
            await storage.patch("kols", {"user_id": f"eq.{uid}"}, {"active": False})
            deactivated += 1
            continue
        handle, followers = prof
        await storage.patch(
            "kols",
            {"user_id": f"eq.{uid}"},
            {"handle": handle, "followers": followers, "followers_updated_at": now.isoformat()},
        )
        refreshed += 1
    return {"refreshed": refreshed, "deactivated": deactivated, "failed": failed}


async def retier(storage: Storage, now: datetime) -> int:
    """Move KOLs between poll tiers from their real posting frequency in the last 7 days."""
    since = (now - timedelta(days=7)).isoformat()
    posts = await storage.select("posts", columns="user_id", filters={"created_at": f"gte.{since}"})
    counts: dict[int, int] = {}
    for p in posts:
        counts[int(p["user_id"])] = counts.get(int(p["user_id"]), 0) + 1
    kols = await storage.select("kols", columns="user_id,poll_tier", filters={"active": "eq.true"})
    changed = 0
    for k in kols:
        uid = int(k["user_id"])
        if uid not in counts:
            continue  # no evidence yet: keep whatever the harvest estimated
        tier = poll_tier_for(counts[uid])
        if tier != int(k["poll_tier"]):
            await storage.patch("kols", {"user_id": f"eq.{uid}"}, {"poll_tier": tier})
            changed += 1
    return changed


class TwscrapeProfiles:
    """ProfileSource on top of the shared twscrape accounts.db."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = str(db_path)
        self._api: Any | None = None

    async def profile(self, user_id: int) -> tuple[str, int] | None:
        if self._api is None:
            from nti_fetcher.adapters import TwscrapeSource

            self._api = TwscrapeSource(db_path=self._db_path)._ensure_api()  # noqa: SLF001
        u = await self._api.user_by_id(user_id)
        if u is None:
            return None
        return str(u.username), int(getattr(u, "followersCount", 0))


def utcnow() -> datetime:
    return datetime.now(UTC)
