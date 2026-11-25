"""Switch the existing stack (VPS, Supabase, Vercel) from the testnet to mainnet, once, on the host.

Run it on the VPS from the repo root, after the mainnet contracts are deployed and
contracts/deployments/4663.json is committed and pulled:

    uv run --directory services --with "psycopg[binary]" python ../infra/scripts/cutover_to_mainnet.py \
        --mainnet-env ../.env.mainnet [--dry-run] [--yes]

What it does, in order
  1. Checks that the mainnet manifest exists and that the database is reachable.
  2. Stops the nti-* PM2 apps so nothing writes while the data is switched.
  3. Exports every chain-specific table to data/state/cutover-backup-<time>/<table>.jsonl, then empties them.
     Kept on purpose, because they do not depend on the chain: kols, kol_narratives, posts, post_engagement,
     classifications, llm_runs, fetch_cycles, fetch_cycle_runs, config_versions and the migration ledger.
     Epoch ids are the same real-time numbers on both chains, so the epochs table must not carry testnet rows.
  4. Replaces the chain keys in the host .env (CHAIN_ID, RPC, role keys, ...) with the values in --mainnet-env.
  5. Starts the PM2 apps again.

The testnet history is preserved in the backup files; the testnet contracts keep existing on chain.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Tables whose content does not depend on which chain the protocol runs on.
KEEP_TABLES = frozenset(
    {
        "kols",
        "kol_narratives",
        "posts",
        "post_engagement",
        "classifications",
        "llm_runs",
        "fetch_cycles",
        "fetch_cycle_runs",
        "config_versions",
        "nti_schema_migrations",
    }
)

# Keys copied from the mainnet env file into the host .env. Everything else in .env stays as it is.
ENV_KEYS = (
    "CHAIN_ID",
    "NEXT_PUBLIC_CHAIN_ID",
    "RPC_URL_MAINNET",
    "INDEXER_RPC_URL",
    "INDEXER_START_BLOCK",
    "INDEXER_BATCH_BLOCKS",
    "INDEXER_POLL_MS",
    "DISCOVERY_RPC_URL",
    "DISCOVERY_LOG_RANGE",
    "PONS_FACTORY_ADDRESS",
    "WETH_ADDRESS",
    "OPERATOR_PRIVATE_KEY",
    "VALIDATOR_PRIVATE_KEY_1",
    "VALIDATOR_PRIVATE_KEY_2",
    "VALIDATOR_PRIVATE_KEY_3",
    "KEEPER_PRIVATE_KEY",
    "ATTESTER_PRIVATE_KEY",
    "PAUSER_ADDRESS",
    "RADAR_MIN_STAKE",
)


def tables_to_clear(all_tables: list[str]) -> list[str]:
    return sorted(t for t in all_tables if t not in KEEP_TABLES)


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip("\"'")
    return out


def apply_env_updates(existing: str, source: dict[str, str], keys: tuple[str, ...] = ENV_KEYS) -> str:
    """Replace (or append) the wanted keys in an env file's text; keys with an empty value are skipped."""
    updates = {k: source[k] for k in keys if source.get(k)}
    lines = existing.splitlines()
    seen: set[str] = set()
    for i, line in enumerate(lines):
        m = re.match(r"^([A-Z0-9_]+)=", line)
        if m and m.group(1) in updates:
            lines[i] = f"{m.group(1)}={updates[m.group(1)]}"
            seen.add(m.group(1))
    for key, value in updates.items():
        if key not in seen:
            lines.append(f"{key}={value}")
    return "\n".join(lines) + "\n"


def pm2(*args: str) -> None:
    if shutil.which("pm2"):
        subprocess.run(["pm2", *args], check=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mainnet-env", type=Path, required=True, help="env file holding the mainnet values")
    parser.add_argument("--host-env", type=Path, default=REPO_ROOT / ".env")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    manifest = REPO_ROOT / "contracts" / "deployments" / "4663.json"
    if not manifest.exists() or int(json.loads(manifest.read_text(encoding="utf-8")).get("chainId", 0)) != 4663:
        print("contracts/deployments/4663.json is missing: deploy the contracts and pull the manifest first", file=sys.stderr)
        return 2
    host_env = parse_env(args.host_env.read_text(encoding="utf-8"))
    database_url = host_env.get("DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    if not database_url:
        print("DATABASE_URL is not set in the host .env", file=sys.stderr)
        return 2
    mainnet_env = parse_env(args.mainnet_env.read_text(encoding="utf-8"))
    if mainnet_env.get("CHAIN_ID") != "4663":
        print("--mainnet-env must set CHAIN_ID=4663", file=sys.stderr)
        return 2

    try:
        import psycopg
    except ImportError:
        print('psycopg is required: run with `uv run --with "psycopg[binary]" ...`', file=sys.stderr)
        return 2

    with psycopg.connect(database_url, autocommit=True, connect_timeout=30) as conn:
        names = [r[0] for r in conn.execute("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")]
        clear = tables_to_clear(names)
        counts = {t: conn.execute(f'select count(*) from public."{t}"').fetchone()[0] for t in clear}
        print("tables that will be emptied (rows):")
        for t in clear:
            print(f"  {t}: {counts[t]}")
        print("kept: " + ", ".join(sorted(KEEP_TABLES & set(names))))
        print("env keys that will change: " + ", ".join(k for k in ENV_KEYS if mainnet_env.get(k)))
        if args.dry_run:
            print("dry run: nothing changed")
            return 0
        if not args.yes and input("type CUTOVER to continue: ").strip() != "CUTOVER":
            print("aborted")
            return 1

        pm2("stop", "all")
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        backup = REPO_ROOT / "data" / "state" / f"cutover-backup-{stamp}"
        backup.mkdir(parents=True, exist_ok=True)
        for t in clear:
            with (backup / f"{t}.jsonl").open("w", encoding="utf-8") as fh, conn.cursor() as cur:
                with cur.copy(f'copy (select row_to_json(x) from public."{t}" x) to stdout') as copy:
                    for chunk in copy:
                        fh.write(bytes(chunk).decode("utf-8"))
        print(f"backup written to {backup}")

        # One statement over every cleared table, without CASCADE: if a kept table referenced one of them,
        # Postgres refuses instead of silently emptying it.
        listing = ", ".join(f'public."{t}"' for t in clear)
        conn.execute(f"truncate {listing} restart identity")
        print(f"emptied {len(clear)} tables")

    shutil.copy2(args.host_env, args.host_env.with_name(args.host_env.name + f".testnet-{stamp}"))
    args.host_env.write_text(apply_env_updates(args.host_env.read_text(encoding="utf-8"), mainnet_env), encoding="utf-8")
    os.chmod(args.host_env, 0o600)
    print("host .env updated (the previous one is kept next to it as .env.testnet-<time>)")

    pm2("restart", "all", "--update-env")
    pm2("save")
    print("services restarted on mainnet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
