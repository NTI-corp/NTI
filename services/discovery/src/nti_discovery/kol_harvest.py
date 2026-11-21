"""Automatic KOL universe growth: search X per narrative, gate the authors numerically, store them.

Flow (daily job, ``python -m nti_discovery.kol_harvest``):

1. Per narrative, run a few X searches (last 7 days, engagement floor); collect the authors.
2. Aggregate per author: followers, themed posts, average likes, best-matching narrative.
3. Gate with :func:`filter_kol_candidates` (followers, likes, frequency); skip known KOLs.
4. Cap the intake per run and per narrative so the fetch cycle grows gradually, then upsert
   ``kols`` + ``kol_narratives`` with a poll tier derived from posting frequency.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

from nti_discovery.kol_discovery import KolCandidateMetrics, filter_kol_candidates

REPO_ROOT = Path(__file__).resolve().parents[4]

# Seed searches per narrative id (ids match packages/sdk narratives). Broad on purpose: the numeric
# gates, not the keywords, decide who is accepted.
NARRATIVE_QUERIES: dict[int, tuple[str, ...]] = {
    1: (
        "zero knowledge proof",
        "zk rollup OR zkVM",
        "privacy protocol crypto",
        "FHE OR MPC onchain",
    ),
    2: ("AI agents crypto", "agentic payments", "autonomous agent onchain", "x402 OR ERC-8004"),
    3: (
        "tokenized real world assets",
        "RWA tokenization",
        "tokenized treasuries OR tokenized stocks",
    ),
    4: ("stablecoin", "stablecoins regulation OR GENIUS Act", "stablechain OR USDC OR USDT"),
    5: ("DePIN", "decentralized GPU compute", "decentralized physical infrastructure"),
    6: ("prediction markets", "Polymarket OR Kalshi", "onchain prediction market"),
    7: ("perp DEX", "perpetual DEX Hyperliquid", "onchain perps OR perpetual futures DEX"),
    8: ("DeFi yield", "DeFi lending OR DeFi TVL", "liquid staking OR restaking"),
    9: ("memecoin", "memecoins trenches", "pump.fun OR bonding curve memecoin"),
    10: ("web3 gaming", "onchain gaming", "crypto game GameFi"),
}


@dataclass(frozen=True, slots=True)
class SearchHit:
    user_id: int
    handle: str
    followers: int
    likes: int
    created_at: datetime
    display_name: str = ""
    avatar_url: str = ""


class SearchSource(Protocol):
    async def search(self, query: str, limit: int) -> list[SearchHit]: ...


class TwscrapeSearch:
    """twscrape search adapter (same accounts.db as the fetcher)."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = str(db_path)
        self._api: Any | None = None

    def _ensure_api(self) -> Any:
        if self._api is None:
            # Reuse the fetcher's xclid fallback patch so search survives X bundle changes.
            from nti_fetcher.adapters import TwscrapeSource

            src = TwscrapeSource(db_path=self._db_path)
            self._api = src._ensure_api()  # noqa: SLF001
        return self._api

    async def search(self, query: str, limit: int) -> list[SearchHit]:
        api = self._ensure_api()
        hits: list[SearchHit] = []
        async for tw in api.search(query, limit=limit):
            u = getattr(tw, "user", None)
            if u is None:
                continue
            date = (
                tw.date if isinstance(tw.date, datetime) else datetime.fromisoformat(str(tw.date))
            )
            hits.append(
                SearchHit(
                    user_id=int(u.id),
                    handle=str(u.username),
                    followers=int(getattr(u, "followersCount", 0)),
                    likes=int(getattr(tw, "likeCount", 0)),
                    created_at=date,
                    display_name=str(getattr(u, "displayname", "") or ""),
                    avatar_url=str(getattr(u, "profileImageUrl", "") or ""),
                )
            )
        return hits


def build_search_query(seed: str, since: datetime, min_faves: int) -> str:
    flags = "lang:en -filter:replies -filter:retweets"
    return f"({seed}) {flags} min_faves:{min_faves} since:{since:%Y-%m-%d}"


def poll_tier_for(posts_in_window: int) -> int:
    """Frequent posters are checked every cycle, quieter ones every 2nd or 4th."""
    if posts_in_window >= 6:
        return 1
    if posts_in_window >= 3:
        return 2
    return 4


@dataclass(slots=True)
class _Agg:
    user_id: int
    handle: str
    display_name: str = ""
    avatar_url: str = ""
    followers: int = 0
    posts: int = 0
    likes: int = 0
    narrative_posts: dict[int, int] | None = None

    def add(self, narrative_id: int, hit: SearchHit) -> None:
        self.posts += 1
        self.likes += hit.likes
        self.followers = max(self.followers, hit.followers)
        self.display_name = hit.display_name or self.display_name
        self.avatar_url = hit.avatar_url or self.avatar_url
        if self.narrative_posts is None:
            self.narrative_posts = defaultdict(int)
        self.narrative_posts[narrative_id] += 1


def aggregate_hits(
    per_narrative: dict[int, Sequence[SearchHit]],
) -> list[tuple[KolCandidateMetrics, int]]:
    """Merge hits into one record per author; returns (metrics, posts_in_window)."""
    by_user: dict[int, _Agg] = {}
    seen_tweets: set[tuple[int, int, datetime]] = set()
    for narrative_id, hits in per_narrative.items():
        for h in hits:
            key = (h.user_id, narrative_id, h.created_at)
            if key in seen_tweets:
                continue
            seen_tweets.add(key)
            by_user.setdefault(h.user_id, _Agg(h.user_id, h.handle)).add(narrative_id, h)
    out: list[tuple[KolCandidateMetrics, int]] = []
    for agg in by_user.values():
        assert agg.narrative_posts
        primary = sorted(agg.narrative_posts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        out.append(
            (
                KolCandidateMetrics(
                    user_id=agg.user_id,
                    handle=agg.handle,
                    followers=agg.followers,
                    avg_likes=agg.likes / max(1, agg.posts),
                    themed_posts_per_week=agg.posts,
                    narrative_id=primary,
                    display_name=agg.display_name,
                    avatar_url=agg.avatar_url,
                ),
                agg.posts,
            )
        )
    return out


@dataclass(frozen=True, slots=True)
class HarvestConfig:
    window_days: int = 7
    per_query_limit: int = 120
    min_faves: int = 15
    min_followers: int = 5_000
    min_avg_likes: float = 15.0
    min_posts_per_week: int = 2
    max_new_per_run: int = 150
    max_new_per_narrative: int = 25
    max_total: int = 1_500


async def harvest(
    source: SearchSource,
    known_user_ids: set[int],
    *,
    now: datetime | None = None,
    cfg: HarvestConfig = HarvestConfig(),  # noqa: B008
) -> list[tuple[KolCandidateMetrics, int]]:
    """Return the accepted new KOLs (metrics, posts_in_window), best first, caps applied."""
    now = now or datetime.now(UTC)
    since = now - timedelta(days=cfg.window_days)
    per_narrative: dict[int, list[SearchHit]] = defaultdict(list)
    for narrative_id, seeds in NARRATIVE_QUERIES.items():
        for seed in seeds:
            try:
                hits = await source.search(
                    build_search_query(seed, since, cfg.min_faves), cfg.per_query_limit
                )
            except Exception as exc:  # noqa: BLE001 - one failed query must not stop the run
                print(
                    json.dumps(
                        {"role": "kol_harvest", "query_failed": seed, "error": str(exc)[:160]}
                    )
                )
                continue
            per_narrative[narrative_id].extend(h for h in hits if h.created_at >= since)

    posts_by_user = {m.user_id: p for m, p in aggregate_hits(per_narrative)}
    accepted = filter_kol_candidates(
        [m for m, _ in aggregate_hits(per_narrative)],
        existing_user_ids=known_user_ids,
        min_followers=cfg.min_followers,
        min_avg_likes=cfg.min_avg_likes,
        min_themed_posts_per_week=cfg.min_posts_per_week,
    )

    room = max(0, cfg.max_total - len(known_user_ids))
    budget = min(cfg.max_new_per_run, room)
    result: list[tuple[KolCandidateMetrics, int]] = []
    added_this_run: dict[int, int] = defaultdict(int)
    for cand in accepted:
        if len(result) >= budget:
            break
        if added_this_run[cand.narrative_id] >= cfg.max_new_per_narrative:
            continue
        added_this_run[cand.narrative_id] += 1
        result.append((cand, posts_by_user[cand.user_id]))
    return result


def to_rows(
    accepted: Sequence[tuple[KolCandidateMetrics, int]], now: datetime
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    kols = [
        {
            "user_id": m.user_id,
            "handle": m.handle,
            "followers": m.followers,
            "display_name": m.display_name or None,
            "avatar_url": m.avatar_url or None,
            "followers_updated_at": now.isoformat(),
            "h_k": 1,
            "r_k": 1,
            "poll_tier": poll_tier_for(posts),
            "active": True,
        }
        for m, posts in accepted
    ]
    links = [{"user_id": m.user_id, "narrative_id": m.narrative_id} for m, _ in accepted]
    return kols, links


async def run(args: argparse.Namespace) -> dict[str, Any]:
    from nti_fetcher.storage import SupabaseStorage

    from nti_discovery import kol_maintain

    storage = SupabaseStorage(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    db_path = Path(os.environ.get("TWSCRAPE_DB_PATH", "data/state/accounts.db"))
    if not db_path.is_absolute():
        db_path = REPO_ROOT / db_path
    now = datetime.now(UTC)
    report: dict[str, Any] = {"role": "kol_harvest", "dry_run": args.dry_run}

    # pm2 starts cron apps on every (re)deploy; once per ~day is enough, so extra starts exit early.
    state_path = REPO_ROOT / "data" / "state" / "kol_harvest.json"
    if not args.dry_run and not args.force and state_path.exists():
        try:
            last = datetime.fromisoformat(json.loads(state_path.read_text())["last_run"])
        except (ValueError, KeyError, OSError):
            last = None
        if last and now - last < timedelta(hours=20):
            return {**report, "status": "skipped", "reason": "ran_within_20h"}

    if not args.dry_run:
        report["seed_imported"] = await kol_maintain.import_seed(
            storage, REPO_ROOT / "data" / "kols.json"
        )
        report["profiles"] = await kol_maintain.refresh_profiles(
            storage, kol_maintain.TwscrapeProfiles(db_path), now
        )
        report["retiered"] = await kol_maintain.retier(storage, now)

    existing = await storage.select("kols", columns="user_id,handle")
    known = {int(r["user_id"]) for r in existing}
    known_handles = {str(r["handle"]).lower() for r in existing}

    if args.max_new is not None:
        budget, reason = args.max_new, "fixed"
    else:
        budget, reason = await kol_maintain.adaptive_budget(storage, full=150)
    report["growth"] = {"budget": budget, "reason": reason}

    kol_rows: list[dict[str, Any]] = []
    if budget > 0:
        cfg = HarvestConfig(max_new_per_run=budget, max_total=args.max_total)
        accepted = await harvest(TwscrapeSearch(db_path), known, now=now, cfg=cfg)
        accepted = [(m, p) for m, p in accepted if m.handle.lower() not in known_handles]
        kol_rows, link_rows = to_rows(accepted, now)
        if args.dry_run:
            print(json.dumps({"would_add": kol_rows}, default=str, indent=2))
        else:
            await storage.upsert("kols", kol_rows, on_conflict="user_id")
            await storage.upsert("kol_narratives", link_rows, on_conflict="user_id,narrative_id")
    if not args.dry_run:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"last_run": now.isoformat()}))
    report.update(
        known=len(known),
        added=len(kol_rows),
        total=len(known) + (0 if args.dry_run else len(kol_rows)),
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="ignore the once-per-day guard")
    parser.add_argument(
        "--max-new", type=int, default=None, help="fixed intake; default adapts to fetch health"
    )
    parser.add_argument(
        "--max-total", type=int, default=int(os.environ.get("KOL_HARVEST_MAX_TOTAL", "1500"))
    )
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(args))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
