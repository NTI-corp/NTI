"""CLI entrypoint: python -m nti_fetcher [--epoch <id>]."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
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


def _epoch_id_at(now_ts: int, genesis_timestamp: int, epoch_seconds: int) -> int:
    return max(0, (int(now_ts) - int(genesis_timestamp)) // int(epoch_seconds))


def _fetch_jitter_range() -> tuple[float, float]:
    minimum = float(os.environ.get("FETCHER_JITTER_MIN_SECONDS", "15"))
    maximum = float(os.environ.get("FETCHER_JITTER_MAX_SECONDS", "20"))
    if minimum < 0 or maximum < minimum:
        raise ValueError("Fetcher jitter must satisfy 0 <= minimum <= maximum")
    return minimum, maximum


async def _read_oracle_genesis(chain_id: int) -> int:
    """Read the deployed oracle genesis; epoch IDs are relative to it, not Unix zero."""
    manifest_path = REPO_ROOT / "contracts" / "deployments" / f"{chain_id}.json"
    if not manifest_path.exists():
        raise RuntimeError(f"Oracle deployment manifest missing for chain {chain_id}")
    oracle = json.loads(manifest_path.read_text(encoding="utf-8")).get("oracleCommit")
    if not isinstance(oracle, str) or not oracle.startswith("0x"):
        raise RuntimeError(f"Oracle address missing for chain {chain_id}")
    rpc_url = os.environ.get(
        "RPC_URL_MAINNET" if chain_id == 4663 else "RPC_URL_TESTNET",
        "https://robinhood-rpc.publicnode.com"
        if chain_id == 4663
        else "https://robinhood-sepolia-rpc.publicnode.com",
    )
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": oracle, "data": "0xcacf66ab"}, "latest"],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(rpc_url, json=payload)
        response.raise_for_status()
        body = response.json()
    result = body.get("result")
    if body.get("error") or not isinstance(result, str) or len(result) < 66:
        raise RuntimeError("Could not read genesisTimestamp() from deployed OracleCommit")
    return int(result, 16)


async def _load_kols_from_supabase(storage: SupabaseStorage) -> list[KolProfile]:
    rows = await storage.select(
        "kols",
        columns="user_id,handle,followers,h_k,r_k,poll_tier,active",
        filters={"active": "eq.true"},
        order="followers.desc",
        limit=2000,
    )
    return [
        KolProfile(
            user_id=int(r["user_id"]),
            handle=str(r["handle"]),
            followers=int(r.get("followers", 0)),
            h_k=int(r.get("h_k", 1)),
            r_k=Decimal(str(r.get("r_k", "1"))),
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
        help="Target epoch ID (defaults to the current OracleCommit epoch)",
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

    # Persist the authoritative completion marker only after every related write succeeds.
    await storage.insert_returning(
        "fetch_cycle_runs",
        [
            {
                "run_id": str(uuid4()),
                "epoch_id": epoch_id,
                "status": result.status.value,
                "started_at": result.started_at,
                "finished_at": result.finished_at,
                "total_eligible": result.total_eligible,
                "accounts_ok": result.total_ok,
                "accounts_failed": result.total_failed,
                "due_user_ids": list(result.due_user_ids),
                "omitted_user_ids": list(result.omitted_user_ids),
                "post_count": result.total_posts,
                "manifest_sha256": result.manifest_sha256,
                "failure_types": dict(result.failure_types),
            }
        ],
    )

    return cycle_id


async def _main_async(args: argparse.Namespace) -> int:
    cfg = load_config(_resolve_repo_path(args.config))
    now_ts = int(time.time())
    chain_id = int(os.environ.get("CHAIN_ID", "46630"))
    genesis = await _read_oracle_genesis(chain_id)
    if args.epoch is not None:
        epoch_id = args.epoch
    else:
        epoch_id = _epoch_id_at(now_ts, genesis, cfg.epoch_seconds)
    boundary_ts = genesis + epoch_id * cfg.epoch_seconds
    boundary = datetime.fromtimestamp(boundary_ts, tz=UTC)

    sb_url = os.environ.get("SUPABASE_URL", "")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    storage = (
        SupabaseStorage(sb_url, sb_key) if (not args.no_supabase and sb_url and sb_key) else None
    )

    kols_path = _resolve_repo_path(args.kols)
    kols = _load_kols_json(kols_path) if kols_path.exists() else []
    if storage is not None:
        # The file holds the curated core; the discovery job grows the rest in Supabase.
        known_ids = {k.user_id for k in kols}
        kols += [k for k in await _load_kols_from_supabase(storage) if k.user_id not in known_ids]

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
    max_kols = int(os.environ.get("FETCHER_MAX_KOLS_PER_CYCLE", "0"))
    runner = FetchRunner(
        primary=primary,
        fallback=fallback,
        output_dir=out_dir,
        lock_path=lock_file,
        jitter_range=_fetch_jitter_range(),
        page_limit=60,
        max_pages=1,
        max_kols=max_kols,
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
                "failure_types": dict(result.failure_types),
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
