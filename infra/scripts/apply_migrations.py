"""Apply supabase/migrations/*.sql to a Postgres database in order, once each.

Usage:
    uv run --directory services --with "psycopg[binary]" python ../infra/scripts/apply_migrations.py \
        --database-url "$DATABASE_URL" [--dry-run]

Applied files are recorded in public.nti_schema_migrations (name, sha256). A file that was applied and has since
changed is reported and stops the run, so a database can never silently drift from the repository. Every
migration runs in its own transaction. Use it for the fresh mainnet project; testnet was migrated by hand.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "supabase" / "migrations"

LEDGER_SQL = """
create table if not exists public.nti_schema_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
)
"""


def migration_files(directory: Path = MIGRATIONS) -> list[Path]:
    return sorted(directory.glob("*.sql"), key=lambda p: p.name)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plan(files: list[Path], applied: dict[str, str]) -> tuple[list[Path], list[str]]:
    """Return (pending files in order, names whose content changed after being applied)."""
    pending: list[Path] = []
    changed: list[str] = []
    for path in files:
        recorded = applied.get(path.name)
        if recorded is None:
            pending.append(path)
        elif recorded != digest(path):
            changed.append(path.name)
    return pending, changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        import psycopg
    except ImportError:
        print('psycopg is required: run with `uv run --with "psycopg[binary]" ...`', file=sys.stderr)
        return 2

    files = migration_files()
    with psycopg.connect(args.database_url, autocommit=True, connect_timeout=30) as conn:
        conn.execute(LEDGER_SQL)
        applied = {name: sha for name, sha in conn.execute("select name, sha256 from public.nti_schema_migrations")}
        pending, changed = plan(files, applied)
        if changed:
            print("these migrations were applied and have changed since: " + ", ".join(changed), file=sys.stderr)
            return 1
        if not pending:
            print(f"up to date ({len(files)} migrations applied)")
            return 0
        for path in pending:
            print(f"{'would apply' if args.dry_run else 'applying'} {path.name}")
            if args.dry_run:
                continue
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute(
                    "insert into public.nti_schema_migrations (name, sha256) values (%s, %s)",
                    (path.name, digest(path)),
                )
        if not args.dry_run:
            conn.execute("notify pgrst, 'reload schema'")
            print(f"applied {len(pending)} migration(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
