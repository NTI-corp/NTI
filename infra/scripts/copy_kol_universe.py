"""Copy the curated KOL universe from one Supabase project to another (testnet -> mainnet seed).

Usage:
    SRC_SUPABASE_URL=... SRC_SUPABASE_SERVICE_KEY=... DST_SUPABASE_URL=... DST_SUPABASE_SERVICE_KEY=... \
        python infra/scripts/copy_kol_universe.py [--limit 1500] [--dry-run]

Copies active rows of `kols` (profile, tier, followers, avatar) and their `kol_narratives`. Only configuration
is copied: no posts, engagement, classifications or epochs, so the mainnet data plane starts with a seeded
universe and an otherwise empty history. Rows that already exist in the destination are left untouched.
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx

KOL_COLUMNS = (
    "user_id,handle,followers,followers_updated_at,h_k,r_k,poll_tier,active,display_name,avatar_url"
)
PAGE = 1000


def fetch_all(base: str, key: str, table: str, columns: str, flt: str = "") -> list[dict]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows: list[dict] = []
    offset = 0
    while True:
        url = f"{base}/rest/v1/{table}?select={columns}{flt}&order=user_id.asc&limit={PAGE}&offset={offset}"
        resp = httpx.get(url, headers=headers, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE


def upsert(base: str, key: str, table: str, rows: list[dict], conflict: str) -> None:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # ignore-duplicates keeps whatever the destination already has
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }
    for i in range(0, len(rows), 500):
        resp = httpx.post(
            f"{base}/rest/v1/{table}?on_conflict={conflict}", headers=headers, json=rows[i : i + 500], timeout=120
        )
        resp.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=1500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    need = ("SRC_SUPABASE_URL", "SRC_SUPABASE_SERVICE_KEY", "DST_SUPABASE_URL", "DST_SUPABASE_SERVICE_KEY")
    missing = [n for n in need if not os.environ.get(n)]
    if missing:
        print("missing env: " + ", ".join(missing), file=sys.stderr)
        return 2
    src, skey = os.environ["SRC_SUPABASE_URL"].rstrip("/"), os.environ["SRC_SUPABASE_SERVICE_KEY"]
    dst, dkey = os.environ["DST_SUPABASE_URL"].rstrip("/"), os.environ["DST_SUPABASE_SERVICE_KEY"]
    if src == dst:
        print("source and destination are the same project", file=sys.stderr)
        return 2

    kols = fetch_all(src, skey, "kols", KOL_COLUMNS, "&active=eq.true")[: args.limit]
    ids = {int(k["user_id"]) for k in kols}
    links = [
        r
        for r in fetch_all(src, skey, "kol_narratives", "user_id,narrative_id")
        if int(r["user_id"]) in ids
    ]
    print(f"{len(kols)} KOLs and {len(links)} narrative links to copy")
    if args.dry_run:
        return 0
    upsert(dst, dkey, "kols", kols, "user_id")
    upsert(dst, dkey, "kol_narratives", links, "user_id,narrative_id")
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
