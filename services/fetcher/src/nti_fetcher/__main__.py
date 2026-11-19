"""CLI entrypoint: python -m nti_fetcher --epoch <id>."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path

from nti_core.config import load_config
from nti_core.types import KolProfile

from nti_fetcher.accounts import AccountPool
from nti_fetcher.adapters import HttpFallbackSource, TwscrapeSource
from nti_fetcher.runner import FetchRunner


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nti_fetcher", description="NTI multi-lane X fetcher")
    parser.add_argument("--epoch", type=int, required=True, help="Target epoch ID")
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
        help="Path to KOL universe JSON file",
    )
    parser.add_argument(
        "--accounts",
        type=Path,
        default=Path(os.environ.get("X_ACCOUNTS_FILE", "x_accounts.json")),
        help="Path to X accounts cookie file",
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
        default=Path("data/fetcher.lock"),
        help="Lockfile path",
    )
    return parser


async def _main_async(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    boundary = datetime.fromtimestamp(args.epoch * cfg.epoch_seconds, tz=UTC)
    pool = AccountPool.from_file(args.accounts) if args.accounts.exists() else None
    kols = _load_kols_json(args.kols) if args.kols.exists() else []

    primary = TwscrapeSource(account_pool=pool)
    fallback_url = os.environ.get("X_HTTP_FALLBACK_URL")
    fallback = (
        HttpFallbackSource(base_url=fallback_url, account_pool=pool) if fallback_url else None
    )

    runner = FetchRunner(
        primary=primary,
        fallback=fallback,
        output_dir=args.output_dir,
        lock_path=args.lock_path,
    )
    result = await runner.run_cycle(epoch_id=args.epoch, boundary=boundary, kols=kols)
    print(
        json.dumps(
            {
                "epoch_id": result.epoch_id,
                "status": str(result.status),
                "total_ok": result.total_ok,
                "total_failed": result.total_failed,
                "total_posts": result.total_posts,
                "manifest_sha256": result.manifest_sha256,
            }
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
