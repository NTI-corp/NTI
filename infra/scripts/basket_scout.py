"""Find tokens that can fill a narrative basket and add them to config/mainnet_baskets.json.

Usage (needs SUPABASE_URL, SUPABASE_SERVICE_KEY and RPC_URL_MAINNET in the environment or --env-file):
    uv run --directory services python ../infra/scripts/basket_scout.py --env-file ../.env [--apply]

The discovery job already attributes every token it finds to a narrative from the KOL posts that mention it.
The scout takes those tokens, keeps the ones with a Uniswap V3 pool against WETH (the only pools a basket can
price, see MAINNET.md), and shows which narratives now reach the three tokens a basket needs (the 40% weight cap
makes fewer impossible). With --apply it merges the new tokens into the config; then run
`mainnet_launch.py --go --from baskets` to create the baskets and whitelist the tokens (the contract still
re-checks liquidity and price history, so a token that fails is skipped, never trusted).

Limit: tokens added to a narrative whose basket already exists are whitelisted but only join its allocation after
the keeper's rebalance logic is extended to pick them up; the scout is for narratives that have no basket yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Callable
from pathlib import Path

import httpx
from eth_abi import decode, encode
from eth_utils import keccak, to_checksum_address

REPO = Path(__file__).resolve().parents[2]
CONFIG = REPO / "config" / "mainnet_baskets.json"
MIN_TOKENS = 3
NAMES = {
    1: ("NTI Privacy Basket", "nPRIV"),
    2: ("NTI AI Agents Basket", "nAI"),
    3: ("NTI RWA Basket", "nRWA"),
    4: ("NTI Stablecoins Basket", "nSTBL"),
    5: ("NTI DePIN Basket", "nDEPIN"),
    6: ("NTI Prediction Markets Basket", "nPRED"),
    7: ("NTI Perp DEX Basket", "nPERP"),
    8: ("NTI DeFi Basket", "nDEFI"),
    9: ("NTI Memecoin Basket", "nMEME"),
    10: ("NTI Gaming Basket", "nGAME"),
}


def merge(config: dict, found: dict[int, list[str]]) -> tuple[dict, list[str]]:
    """Add found tokens to the config's baskets; return the new config and a human readable change list."""
    baskets = {int(b["narrativeId"]): b for b in config.get("baskets", [])}
    changes: list[str] = []
    for narrative, tokens in sorted(found.items()):
        existing = baskets.get(narrative)
        have = {t.lower() for t in (existing["tokens"] if existing else [])}
        fresh = [t for t in tokens if t.lower() not in have]
        total = len(have) + len(fresh)
        if total < MIN_TOKENS:
            changes.append(f"narrative {narrative}: {total} usable token(s), needs {MIN_TOKENS}; nothing added")
            continue
        if existing is None:
            name, symbol = NAMES[narrative]
            existing = baskets[narrative] = {"narrativeId": narrative, "name": name, "symbol": symbol, "tokens": []}
        existing["tokens"].extend(fresh)
        if fresh:
            changes.append(f"narrative {narrative}: +{len(fresh)} token(s), {total} in total")
    return {**config, "baskets": [baskets[k] for k in sorted(baskets)]}, changes


def usable(rows: list[dict], has_pool: Callable[[str], bool]) -> dict[int, list[str]]:
    out: dict[int, list[str]] = {}
    for row in rows:
        narrative = row.get("narrative_id")
        raw = str(row.get("address") or "").removeprefix("\\x").removeprefix("0x")
        if not narrative or not re.fullmatch(r"[0-9a-fA-F]{40}", raw):
            continue
        address = to_checksum_address("0x" + raw)
        if has_pool(address):
            out.setdefault(int(narrative), []).append(address)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.env_file:
        for line in args.env_file.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))
    base, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    rpc = os.environ.get("RPC_URL_MAINNET", "").split(",")[0].strip()
    if not (base and key and rpc):
        print("SUPABASE_URL, SUPABASE_SERVICE_KEY and RPC_URL_MAINNET are required", file=sys.stderr)
        return 2
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    factory, fees = config["uniswapV3Factory"], config["fees"]
    weth = os.environ.get("WETH_ADDRESS", "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73")

    def has_pool(token: str) -> bool:
        for fee in fees:
            data = keccak(text="getPool(address,address,uint24)")[:4] + encode(
                ["address", "address", "uint24"], [token, weth, fee]
            )
            body = {"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": factory, "data": "0x" + data.hex()}, "latest"]}
            result = httpx.post(rpc, json=body, timeout=30).json().get("result", "0x")
            if result not in ("0x", "0x0") and int(decode(["address"], bytes.fromhex(result[2:]))[0], 16) != 0:
                return True
        return False

    resp = httpx.get(
        f"{base.rstrip('/')}/rest/v1/tokens",
        params={"select": "address,symbol,narrative_id", "narrative_id": "not.is.null"},
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=60,
    )
    resp.raise_for_status()
    found = usable(resp.json(), has_pool)
    merged, changes = merge(config, found)
    print("\n".join(changes) if changes else "no tokens with a V3 WETH pool and a narrative yet")
    if args.apply and merged != config:
        CONFIG.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
        print(f"{CONFIG} updated; run mainnet_launch.py --go --from baskets to create the baskets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
