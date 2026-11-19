"""CLI entrypoint: python -m nti_fetcher [--epoch <id>]."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

from nti_core.config import load_config
from nti_core.types import KolProfile

from nti_fetcher.accounts import AccountPool
from nti_fetcher.adapters import HttpFallbackSource, TwscrapeSource
from nti_fetcher.runner import FetchRunner
from nti_fetcher.storage import SupabaseStorage

REPO_ROOT = Path(__file__).resolve().parents[4]


def _resolve_repo_path(raw: str | Path) -> Path:
    p = Path(raw)
    if p.is_absolute() or p.exists():
        return p
    alt = REPO_ROOT / p
    return alt if alt.exists() else p


def _load_kols_json(path: Path) -> list[KolProfile]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [
        KolProfile(
            user_id=int(item["user_id"]),
            handle=str(item["handle"]),
            followers=int(item.get("followers", 0)),
            h_k=int(item.get("h_k", 1)),
            poll_tier=int(item.get("poll_tier", 1)),
            active=bool(item.get("active", True)),
        )
        for item in data
    ]


async def _load_kols_from_supabase(storage: SupabaseStorage) -> list[KolProfile]:
    rows = await storage.select(
        "kols",
        columns="user_id,handle,followers,h_k,poll_tier,active",
        filters={"active": "eq.true"},
        order="user_id.asc",
    )
    return [
        KolProfile(
            user_id=int(r["user_id"]),
            handle=str(r["handle"]),
            followers=int(r.get("followers", 0)),
            h_k=int(r.get("h_k", 1)),
            poll_tier=int(r.get("poll_tier", 1)),
            active=bool(r.get("active", True)),
        )
        for r in rows
    ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nti_fetcher", description="NTI multi-lane X fetcher")
    parser.add_argument(
        "--epoch",
        type=int,
        default=None,
        help="Target epoch ID (defaults to current epoch = floor(now / epoch_seconds))",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(os.environ.get("NTI_CONFIG_PATH", "config/nti.v1.json")),
        help="Path to NTI config JSON",
    )
    parser.add_argument(
        "--kols",
        type=Path,
        default=Path(os.environ.get("NTI_KOLS_FILE", "data/kols.json")),
        help="Path to KOL universe JSON file (falls back to Supabase kols)",
    )
    parser.add_argument(
        "--accounts",
        type=Path,
        default=Path(os.environ.get("X_ACCOUNTS_FILE", "secrets/x_accounts.json")),
        help="Path to X accounts cookie file",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(os.environ.get("TWSCRAPE_DB_PATH", "data/state/accounts.db")),
        help="Path to twscrape accounts.db",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/snapshots"),
        help="Snapshot output directory",
    )
    parser.add_argument(
        "--lock-path",
        type=Path,
        default=Path("data/state/fetcher.lock"),
        help="Lockfile path",
    )
    parser.add_argument(
        "--no-supabase",
        action="store_true",
        help="Skip persisting fetched posts and cycles to Supabase",
    )
    return parser


async def _persist_to_supabase(
    storage: SupabaseStorage,
    epoch_id: int,
    result: object,
) -> int:
    from nti_fetcher.runner import FetchCycleResult

    assert isinstance(result, FetchCycleResult)
    cycle_rows = [
        {
            "epoch_id": epoch_id,
            "lane": lane.lane,
            "source": lane.source,
            "started_at": lane.started_at,
            "finished_at": lane.finished_at,
            "accounts_ok": lane.accounts_ok,
            "accounts_failed": lane.accounts_failed,
            "post_count": lane.post_count,
            "manifest_sha256": lane.sha256,
        }
        for lane in result.lanes
    ]
    inserted_cycles = await storage.insert_returning("fetch_cycles", cycle_rows)
    cycle_id = int(inserted_cycles[0]["id"]) if inserted_cycles else 1

    if result.posts:
        post_rows = [
            {
                "tweet_id": p.tweet_id,
                "user_id": p.user_id,
                "created_at": p.created_at.astimezone(UTC).isoformat(),
                "body": p.text,
            }
            for p in result.posts
        ]
        await storage.upsert_posts(post_rows)

        eng_rows = [
            {
                "tweet_id": p.tweet_id,
                "cycle_id": cycle_id,
                "likes": p.likes,
                "reposts": p.reposts,
                "quotes": p.quotes,
                "replies": p.replies,
                "fetched_at": p.fetched_at.astimezone(UTC).isoformat(),
            }
            for p in result.posts
        ]
        await storage.upsert_post_engagement(eng_rows)

    return cycle_id


async def _main_async(args: argparse.Namespace) -> int:
    cfg = load_config(_resolve_repo_path(args.config))
    now_ts = int(time.time())
    epoch_id = args.epoch if args.epoch is not None else (now_ts // cfg.epoch_seconds)
    # Match OracleCommit.epochBoundary(epochId) when epoch is explicit; live clock when omitted
    boundary_ts = (epoch_id * cfg.epoch_seconds) if args.epoch is not None else now_ts
    boundary = datetime.fromtimestamp(boundary_ts, tz=UTC)

    sb_url = os.environ.get("SUPABASE_URL", "")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    storage = (
        SupabaseStorage(sb_url, sb_key)
        if (not args.no_supabase and sb_url and sb_key)
        else None
    )

    kols_path = _resolve_repo_path(args.kols)
    if kols_path.exists():
        kols = _load_kols_json(kols_path)
    elif storage is not None:
        kols = await _load_kols_from_supabase(storage)
    else:
        kols = []

    accounts_path = _resolve_repo_path(args.accounts)
    pool = AccountPool.from_file(accounts_path) if accounts_path.exists() else None
    db_path = _resolve_repo_path(args.db)

    primary = TwscrapeSource(db_path=db_path, account_pool=pool)
    fallback_url = os.environ.get("X_HTTP_FALLBACK_URL")
    fallback = (
        HttpFallbackSource(base_url=fallback_url, account_pool=pool) if fallback_url else None
    )

    out_dir = args.output_dir if args.output_dir.is_absolute() else (REPO_ROOT / args.output_dir)
    lock_file = args.lock_path if args.lock_path.is_absolute() else (REPO_ROOT / args.lock_path)
    runner = FetchRunner(
        primary=primary,
        fallback=fallback,
        output_dir=out_dir,
        lock_path=lock_file,
        page_limit=60,
        max_pages=1,
    )
    result = await runner.run_cycle(epoch_id=epoch_id, boundary=boundary, kols=kols)

    persisted_cycle_id: int | None = None
    if storage is not None:
        persisted_cycle_id = await _persist_to_supabase(storage, epoch_id, result)

    print(
        json.dumps(
            {
                "epoch_id": result.epoch_id,
                "status": str(result.status),
                "kol_count": len(kols),
                "total_ok": result.total_ok,
                "total_failed": result.total_failed,
                "total_posts": result.total_posts,
                "manifest_sha256": result.manifest_sha256,
                "supabase_cycle_id": persisted_cycle_id,
            }
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
