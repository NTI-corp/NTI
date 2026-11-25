"""Copy the mainnet deployment manifest into the SDK so the web app and services know the addresses.

Usage (from the repo root, after DeployMainnet and after committing contracts/deployments/4663.json):
    python infra/scripts/mainnet_wire.py [--manifest contracts/deployments/4663.json] [--check]

It rewrites the ROBINHOOD_MAINNET_ID entry of PROTOCOL_ADDRESSES in packages/sdk/src/addresses.ts and prints
the values that belong in the mainnet .env (INDEXER_START_BLOCK). With --check it changes nothing and exits 1
when the SDK is out of date, which CI can run.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADDRESSES_TS = REPO_ROOT / "packages" / "sdk" / "src" / "addresses.ts"
ZERO = "0x0000000000000000000000000000000000000000"

# SDK field -> manifest key (same names today; kept explicit so a rename in one place fails loudly)
FIELDS = (
    "registry",
    "ntiToken",
    "staking",
    "configRegistry",
    "oracleCommit",
    "dispute",
    "narrativeMarket",
    "feeRouter",
    "buybackAdapterV3",
    "buybackAdapterV4",
    "basketFactory",
    "grants",
    "governor",
    "timelock",
    "insuranceFund",
    "kolRegistry",
)
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
MAINNET_ENTRY = re.compile(
    r"(\[ROBINHOOD_MAINNET_ID\]:\s*)(\{\s*\.\.\.EMPTY_PROTOCOL\s*\}|\{[^{}]*\})(,)",
    re.DOTALL,
)


def render_entry(manifest: dict[str, object]) -> str:
    lines = ["{"]
    for field in FIELDS:
        raw = str(manifest.get(field, ZERO))
        if not ADDRESS.match(raw):
            raise ValueError(f"manifest field {field} is not an address: {raw!r}")
        value = "null" if raw.lower() == ZERO else f'"{raw}"'
        lines.append(f"    {field}: {value},")
    lines.append("  }")
    return "\n".join(lines)


def rewrite(source: str, manifest: dict[str, object]) -> str:
    # Only the PROTOCOL_ADDRESSES table: EXTERNAL_ADDRESSES has a mainnet entry of the same shape.
    marker = source.find("export const PROTOCOL_ADDRESSES")
    if marker < 0:
        raise ValueError("could not find PROTOCOL_ADDRESSES in addresses.ts")
    head, tail = source[:marker], source[marker:]
    if not MAINNET_ENTRY.search(tail):
        raise ValueError("could not find the ROBINHOOD_MAINNET_ID entry in addresses.ts")
    return head + MAINNET_ENTRY.sub(lambda m: m.group(1) + render_entry(manifest) + m.group(3), tail, count=1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=REPO_ROOT / "contracts" / "deployments" / "4663.json")
    parser.add_argument("--check", action="store_true", help="exit 1 if the SDK is out of date, change nothing")
    args = parser.parse_args()

    if not args.manifest.exists():
        print(f"{args.manifest} not found: deploy first", file=sys.stderr)
        return 2
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if int(manifest.get("chainId", 0)) != 4663:
        print("manifest chainId is not 4663", file=sys.stderr)
        return 2

    current = ADDRESSES_TS.read_text(encoding="utf-8")
    updated = rewrite(current, manifest)
    if args.check:
        if updated != current:
            print("packages/sdk/src/addresses.ts is out of date with the mainnet manifest", file=sys.stderr)
            return 1
        print("SDK matches the mainnet manifest")
        return 0
    if updated != current:
        ADDRESSES_TS.write_text(updated, encoding="utf-8")
        print("updated packages/sdk/src/addresses.ts (run `pnpm build:sdk` next)")
    else:
        print("packages/sdk/src/addresses.ts already matches")
    print(f"INDEXER_START_BLOCK={manifest.get('deployedAtBlock', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
