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
from statistics import median
from typing import Any, Protocol

from nti_discovery.kol_harvest import poll_tier_for


class Storage(Protocol):
    async def select(self, table: str, **kw: Any) -> list[dict[str, Any]]: ...
    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> Any: ...
    async def patch(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> Any: ...


class ProfileSource(Protocol):
    async def profile(self, user_id: int) -> tuple[str, int, str, str] | None:
        """Return (handle, followers, display_name, avatar_url); None when the account is gone."""


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
    batch: int = 300,
) -> dict[str, int]:
    cutoff = (now - timedelta(days=stale_days)).isoformat()
    stale = await storage.select(
        "kols",
        columns="user_id,handle",
        filters={
            "active": "eq.true",
            "or": (
                f"(followers_updated_at.is.null,followers_updated_at.lt.{cutoff},"
                "avatar_url.is.null)"
            ),
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
        handle, followers, display_name, avatar_url = prof
        await storage.patch(
            "kols",
            {"user_id": f"eq.{uid}"},
            {
                "handle": handle,
                "followers": followers,
                "display_name": display_name or None,
                "avatar_url": avatar_url or None,
                "followers_updated_at": now.isoformat(),
            },
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


async def retire_inactive(
    storage: Storage,
    now: datetime,
    *,
    inactive_days: int = 30,
    max_retire: int = 30,
) -> int:
    """Deactivate KOLs inactive for ``inactive_days`` so rising KOLs can rotate in."""
    since = (now - timedelta(days=inactive_days)).isoformat()
    recent_posts = await storage.select(
        "posts", columns="user_id", filters={"created_at": f"gte.{since}"}
    )
    active_posters = {int(p["user_id"]) for p in recent_posts}
    if not active_posters:
        return 0  # guard against empty post table wiping the universe
    kols = await storage.select(
        "kols",
        columns="user_id,followers_updated_at",
        filters={"active": "eq.true"},
        order="followers_updated_at.asc.nullsfirst",
    )
    cutoff = (now - timedelta(days=inactive_days)).isoformat()
    retired = 0
    for k in kols:
        if retired >= max_retire:
            break
        uid = int(k["user_id"])
        updated = str(k.get("followers_updated_at") or "")
        # Only retire established KOLs older than inactive_days that never posted recently
        if uid not in active_posters and updated and updated < cutoff:
            await storage.patch("kols", {"user_id": f"eq.{uid}"}, {"active": False})
            retired += 1
    return retired


def compute_reputation(
    followers: int,
    engagements: list[int],
    classified_max_q: list[float],
) -> tuple[float, int]:
    """Compute dynamic reputation ``r_k`` in [0.25, 1.50] and human guard ``h_k`` (0 or 1).

    Combines:
    - Median engagement-to-follower ratio against a sub-linear baseline (anti-fake-followers).
    - Signal-to-noise ratio of classified posts with max(q) >= 0.25 (anti-off-topic spam).
    - Bot/dead-audience guard: >= 50K followers with >= 10 recent posts and 0 median engagement.
    """
    if not engagements:
        return 1.0, 1

    med_eng = float(median(engagements))
    if followers >= 50_000 and len(engagements) >= 10 and med_eng <= 0.0:
        return 0.25, 0

    expected = max(5.0, (max(0, followers) ** 0.5) * 0.45)
    eng_ratio = max(0.0, med_eng / expected)
    eng_score = 0.35 + min(1.0, (eng_ratio**0.5) * 0.70)

    if classified_max_q:
        relevant = sum(1 for q in classified_max_q if q >= 0.25)
        snr = relevant / len(classified_max_q)
    else:
        snr = 0.70
    snr_mult = 0.55 + 0.65 * snr

    r_k = round(min(1.50, max(0.25, eng_score * snr_mult)), 4)
    return r_k, 1


async def recompute_reputation(
    storage: Storage,
    now: datetime,
    *,
    window_days: int = 14,
    min_posts: int = 2,
) -> dict[str, int]:
    """Recalibrate dynamic ``r_k`` and ``h_k`` across active KOLs from recent post telemetry."""
    since = (now - timedelta(days=window_days)).isoformat()
    kols = await storage.select(
        "kols",
        columns="user_id,followers,r_k,h_k",
        filters={"active": "eq.true"},
    )
    posts = await storage.select(
        "posts",
        columns="tweet_id,user_id",
        filters={"created_at": f"gte.{since}"},
    )
    if not posts or not kols:
        return {"evaluated": 0, "updated": 0, "flagged_bots": 0}

    eng_rows = await storage.select(
        "post_engagement",
        columns="tweet_id,likes,reposts,quotes,replies",
        filters={"fetched_at": f"gte.{since}"},
    )
    cls_rows = await storage.select(
        "classifications",
        columns="tweet_id,q",
    )

    best_eng: dict[int, int] = {}
    for e in eng_rows:
        tid = int(e["tweet_id"])
        score = (
            int(e.get("likes", 0))
            + 2 * int(e.get("reposts", 0))
            + 3 * int(e.get("quotes", 0))
            + int(e.get("replies", 0))
        )
        if score > best_eng.get(tid, -1):
            best_eng[tid] = score

    best_q: dict[int, float] = {}
    for c in cls_rows:
        tid = int(c["tweet_id"])
        q_obj = c.get("q")
        if isinstance(q_obj, dict) and q_obj:
            mx = max(float(v) for v in q_obj.values())
            if mx > best_q.get(tid, -1.0):
                best_q[tid] = mx

    posts_by_user: dict[int, list[int]] = {}
    for p in posts:
        posts_by_user.setdefault(int(p["user_id"]), []).append(int(p["tweet_id"]))

    evaluated = updated = flagged_bots = 0
    for k in kols:
        uid = int(k["user_id"])
        tids = posts_by_user.get(uid)
        if not tids or len(tids) < min_posts:
            continue
        evaluated += 1
        engs = [best_eng.get(t, 0) for t in tids]
        qs = [best_q[t] for t in tids if t in best_q]
        new_rk, new_hk = compute_reputation(int(k.get("followers", 0)), engs, qs)
        cur_rk = float(k.get("r_k", 1.0))
        cur_hk = int(k.get("h_k", 1))
        if new_hk == 0:
            flagged_bots += 1
        if abs(new_rk - cur_rk) >= 0.03 or new_hk != cur_hk:
            await storage.patch(
                "kols",
                {"user_id": f"eq.{uid}"},
                {"r_k": new_rk, "h_k": new_hk},
            )
            updated += 1
    return {"evaluated": evaluated, "updated": updated, "flagged_bots": flagged_bots}


class TwscrapeProfiles:
    """ProfileSource on top of the shared twscrape accounts.db."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = str(db_path)
        self._api: Any | None = None

    async def profile(self, user_id: int) -> tuple[str, int, str, str] | None:
        if self._api is None:
            from nti_fetcher.adapters import TwscrapeSource

            self._api = TwscrapeSource(db_path=self._db_path)._ensure_api()  # noqa: SLF001
        u = await self._api.user_by_id(user_id)
        if u is None:
            return None
        return (
            str(u.username),
            int(getattr(u, "followersCount", 0)),
            str(getattr(u, "displayname", "") or ""),
            str(getattr(u, "profileImageUrl", "") or ""),
        )


def utcnow() -> datetime:
    return datetime.now(UTC)
