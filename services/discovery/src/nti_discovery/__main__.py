"""CLI: python -m nti_discovery [--dry-run]. Scans Pons launches; updates tokens and Radar."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from nti_discovery import pons
from nti_discovery.runner import DiscoveryConfig, DiscoveryRunner, build_market_source

REPO_ROOT = Path(__file__).resolve().parents[4]


class DryRunStorage:
    """Reads return nothing and writes are printed, so a mainnet scan is safe."""

    async def select(self, table: str, **_: Any) -> list[dict[str, Any]]:
        return []

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> None:
        print(json.dumps({"would_upsert": table, "rows": rows}, default=str, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="print writes instead of sending them"
    )
    parser.add_argument("--lookback", type=int, help="blocks to scan on first run")
    parser.add_argument("--no-dex", action="store_true", help="skip DexScreener enrichment")
    args = parser.parse_args()

    chain_id = int(os.environ.get("CHAIN_ID", "46630"))
    factory = os.environ.get(
        "PONS_FACTORY_ADDRESS", pons.MAINNET_FACTORY if chain_id == 4663 else ""
    )
    if not factory:
        print(
            json.dumps(
                {
                    "role": "discovery",
                    "status": "skipped",
                    "reason": "pons_not_on_chain",
                    "chain_id": chain_id,
                }
            )
        )
        return 0

    rpc_url = os.environ.get("DISCOVERY_RPC_URL") or os.environ.get("RPC_URL_MAINNET", "")
    if not rpc_url:
        raise SystemExit("RPC_URL_MAINNET (or DISCOVERY_RPC_URL) is required")

    cfg = DiscoveryConfig(
        factory=factory,
        weth=os.environ.get("WETH_ADDRESS", pons.MAINNET_WETH),
        log_range=int(os.environ.get("DISCOVERY_LOG_RANGE", "2000")),
        lookback_blocks=args.lookback or int(os.environ.get("DISCOVERY_LOOKBACK_BLOCKS", "30000")),
        state_path=None if args.dry_run else REPO_ROOT / "data" / "state" / "discovery.json",
    )
    if args.dry_run:
        storage: Any = DryRunStorage()
    else:
        from nti_fetcher.storage import SupabaseStorage

        storage = SupabaseStorage(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

    runner = DiscoveryRunner(
        pons.HttpRpc(rpc_url),
        storage,
        build_market_source(not args.no_dex and os.environ.get("DISCOVERY_DEX", "1") == "1"),
        cfg,
    )
    print(json.dumps(asyncio.run(runner.run()), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
