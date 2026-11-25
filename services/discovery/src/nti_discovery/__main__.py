"""Discover Pons mainnet and funded Robinhood testnet launches for Radar and Heatmap."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from nti_fetcher.storage import SupabaseStorage

from nti_discovery import pons
from nti_discovery.runner import DiscoveryConfig, DiscoveryRunner, build_market_source
from nti_discovery.testnet import TESTNET_CHAIN_ID, TestnetDiscoveryRunner

REPO_ROOT = Path(__file__).resolve().parents[4]


class DryRunStorage:
    """Print planned writes with optional real read-only Supabase context."""

    def __init__(self, reader: SupabaseStorage | None = None) -> None:
        self._reader = reader

    async def select(self, table: str, **kwargs: Any) -> list[dict[str, Any]]:
        return await self._reader.select(table, **kwargs) if self._reader else []

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> None:
        print(json.dumps({"would_upsert": table, "rows": rows}, default=str, indent=2))


def _testnet_factory() -> str:
    override = os.environ.get("DISCOVERY_TESTNET_FACTORY_ADDRESS", "")
    if override:
        return override
    dep = REPO_ROOT / "contracts" / "deployments"
    for path in (dep / "46630.discovery.json", dep / "46630.json"):
        if path.exists():
            factory = json.loads(path.read_text(encoding="utf-8")).get("discoveryFactory")
            if factory:
                return str(factory)
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="print writes instead of sending them"
    )
    parser.add_argument("--lookback", type=int, help="blocks to scan on first run")
    parser.add_argument("--no-dex", action="store_true", help="skip DexScreener enrichment")
    args = parser.parse_args()

    chain_id = int(os.environ.get("CHAIN_ID", str(TESTNET_CHAIN_ID)))
    is_testnet = chain_id == TESTNET_CHAIN_ID
    factory = (
        _testnet_factory()
        if is_testnet
        else os.environ.get("PONS_FACTORY_ADDRESS", pons.MAINNET_FACTORY)
        if chain_id == 4663
        else ""
    )
    if not factory:
        print(
            json.dumps(
                {
                    "role": "discovery",
                    "status": "skipped",
                    "reason": "testnet_launch_factory_unconfigured"
                    if is_testnet
                    else "unsupported_chain",
                    "chain_id": chain_id,
                }
            )
        )
        return 0

    rpc_var = "RPC_URL_TESTNET" if is_testnet else "RPC_URL_MAINNET"
    rpc_url = os.environ.get("DISCOVERY_RPC_URL") or os.environ.get(rpc_var)
    if not rpc_url:
        raise SystemExit(f"{rpc_var} (or DISCOVERY_RPC_URL) is required")

    state_file = f"discovery-{chain_id}-{factory.lower()}.json" if is_testnet else "discovery.json"
    cfg = DiscoveryConfig(
        factory=factory,
        weth=os.environ.get("WETH_ADDRESS", pons.MAINNET_WETH),
        log_range=int(os.environ.get("DISCOVERY_LOG_RANGE", "2000")),
        lookback_blocks=args.lookback
        if args.lookback is not None
        else int(os.environ.get("DISCOVERY_LOOKBACK_BLOCKS", "30000")),
        state_path=None if args.dry_run else REPO_ROOT / "data" / "state" / state_file,
    )
    url, service_key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if args.dry_run:
        storage = DryRunStorage(SupabaseStorage(url, service_key) if url and service_key else None)
    else:
        if not url or not service_key:
            raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
        storage = SupabaseStorage(url, service_key)

    rpc = pons.HttpRpc(rpc_url, pace=float(os.environ.get("DISCOVERY_RPC_PACE_SECONDS", "0.8")))
    if is_testnet:
        runner = TestnetDiscoveryRunner(rpc, storage, cfg, initial_lookback=args.lookback)
    else:
        market = build_market_source(
            not args.no_dex and os.environ.get("DISCOVERY_DEX", "1") == "1"
        )
        runner = DiscoveryRunner(rpc, storage, market, cfg)
    print(json.dumps(asyncio.run(runner.run()), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
