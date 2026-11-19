"""Batch X account login helper via twscrape -> exports cookies into x_accounts.json.

Supports:
1. Shared catch-all Gmail IMAP inbox (e.g. custom domains forwarding OTPs to Gmail App Password)
2. Interactive --manual OTP prompt (no Gmail password required)
3. Zero-password cookie import from x_accounts.json into twscrape accounts.db
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from nti_fetcher.accounts import AccountPool


@dataclass(frozen=True, slots=True)
class AccountSeed:
    username: str
    password: str
    email: str


def parse_account_lines(raw_text: str, default_password: str = "") -> list[AccountSeed]:
    """Parse lines of 'identifier', 'identifier:password', or 'username:password:email'."""
    seeds: list[AccountSeed] = []
    for line in raw_text.splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.startswith("#"):
            continue
        parts = [p.strip() for p in cleaned.split(":")]
        if len(parts) == 1:
            ident = parts[0].lstrip("@") if parts[0].startswith("@") else parts[0]
            email = parts[0] if "@" in parts[0] and not parts[0].startswith("@") else ""
            seeds.append(AccountSeed(username=ident, password=default_password, email=email))
        elif len(parts) == 2:
            ident = parts[0].lstrip("@") if parts[0].startswith("@") else parts[0]
            email = parts[0] if "@" in parts[0] and not parts[0].startswith("@") else ""
            seeds.append(AccountSeed(username=ident, password=parts[1], email=email))
        else:
            ident = parts[0].lstrip("@") if parts[0].startswith("@") else parts[0]
            seeds.append(AccountSeed(username=ident, password=parts[1], email=parts[2]))
    return seeds


def distribute_accounts_to_x_json(
    cookies_by_user: list[dict[str, Any]],
    output_path: Path,
) -> dict[str, Any]:
    """Distribute (username, auth_token, ct0) across 3 primary lanes + validator_pool."""
    lanes: list[dict[str, Any]] = [
        {"lane": 1, "accounts": []},
        {"lane": 2, "accounts": []},
        {"lane": 3, "accounts": []},
    ]
    validator_pool: list[dict[str, Any]] = []

    for idx, entry in enumerate(cookies_by_user):
        item = {
            "username": entry["username"],
            "auth_token": entry["auth_token"],
            "ct0": entry["ct0"],
            "proxy": entry.get("proxy"),
        }
        if idx < 9:
            lanes[idx % 3]["accounts"].append(item)
        else:
            validator_pool.append(item)

    payload = {"primary_lanes": lanes, "validator_pool": validator_pool}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


async def import_cookies_to_twscrape_db(
    x_accounts_path: Path,
    db_path: Path,
) -> int:
    """Populate twscrape accounts.db using existing auth_token/ct0 cookies (zero passwords)."""
    import twscrape  # type: ignore[import-not-found]

    pool_cfg = AccountPool.from_file(x_accounts_path)
    api = twscrape.API(str(db_path))
    imported = 0

    all_accounts = [
        *pool_cfg.lane_accounts(0),
        *pool_cfg.lane_accounts(1),
        *pool_cfg.lane_accounts(2),
        *pool_cfg.validator_accounts(),
    ]
    for acct in all_accounts:
        if not acct.auth_token or not acct.ct0:
            continue
        cookie_str = f"auth_token={acct.auth_token}; ct0={acct.ct0}"
        await api.pool.add_account(
            username=acct.username,
            password="",
            email="",
            email_password="",
            proxy=acct.proxy,
            cookies=cookie_str,
        )
        imported += 1
    return imported


async def batch_login_and_export(
    *,
    seeds: list[AccountSeed],
    db_path: Path,
    output_json: Path,
    manual: bool = False,
    imap_user: str = "",
    imap_password: str = "",
) -> dict[str, Any]:
    """Login accounts via twscrape (manual OTP or shared Gmail IMAP) and export cookies."""
    import twscrape  # type: ignore[import-not-found]
    import twscrape.imap as tws_imap  # type: ignore[import-not-found]
    import twscrape.login as tws_login  # type: ignore[import-not-found]
    from twscrape.login import LoginConfig  # type: ignore[import-not-found]

    if not manual and imap_user and imap_password:
        async def _shared_imap_login(email: str, password: str) -> Any:  # noqa: ARG001
            return await tws_imap.imap_login(imap_user, imap_password)

        tws_imap.add_imap_mapping(imap_user.split("@")[-1], "imap.gmail.com")
        tws_login.imap_login = _shared_imap_login

    api = twscrape.API(str(db_path))
    for s in seeds:
        await api.pool.add_account(
            username=s.username,
            password=s.password,
            email=s.email or imap_user,
            email_password=imap_password,
        )

    cfg = LoginConfig(email_first=False, manual=manual)
    accounts = await api.pool.get_all()
    results = {"success": 0, "failed": 0, "errors": {}}
    exported: list[dict[str, Any]] = []

    for acc in accounts:
        try:
            if not acc.active:
                await tws_login.login(acc, cfg=cfg)
                await api.pool.save(acc)
            auth_token = (acc.cookies or {}).get("auth_token", "")
            ct0 = (acc.cookies or {}).get("ct0", "")
            if auth_token and ct0:
                exported.append({
                    "username": acc.username,
                    "auth_token": auth_token,
                    "ct0": ct0,
                    "proxy": acc.proxy,
                })
                results["success"] += 1
            else:
                results["failed"] += 1
                results["errors"][acc.username] = "missing auth_token/ct0 cookies"
        except Exception as exc:  # noqa: BLE001
            acc.error_msg = str(exc)
            await api.pool.save(acc)
            results["failed"] += 1
            results["errors"][acc.username] = str(exc)

    distribute_accounts_to_x_json(exported, output_json)
    return results


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="nti_fetcher.login_batch")
    p.add_argument("--accounts-file", type=Path, help="Text file of accounts (one per line)")
    p.add_argument("--default-password", default="", help="Default password if omitted per line")
    p.add_argument("--db", type=Path, default=Path("../data/state/accounts.db"))
    p.add_argument("--output", type=Path, default=Path("../secrets/x_accounts.json"))
    p.add_argument("--manual", action="store_true", help="Prompt OTP interactively in terminal")
    p.add_argument("--imap-user", default=os.environ.get("GMAIL_IMAP_USER", ""))
    p.add_argument("--imap-password", default=os.environ.get("GMAIL_IMAP_APP_PASSWORD", ""))
    p.add_argument(
        "--import-cookies-only",
        action="store_true",
        help="Populate twscrape accounts.db from existing x_accounts.json cookies",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.import_cookies_only:
        count = asyncio.run(import_cookies_to_twscrape_db(args.output, args.db))
        print(json.dumps({"imported_accounts": count, "db": str(args.db)}))
        return 0

    if not args.accounts_file:
        raise SystemExit("--accounts-file is required unless --import-cookies-only is set")

    seeds = parse_account_lines(
        args.accounts_file.read_text(encoding="utf-8"),
        default_password=args.default_password,
    )
    summary = asyncio.run(
        batch_login_and_export(
            seeds=seeds,
            db_path=args.db,
            output_json=args.output,
            manual=args.manual,
            imap_user=args.imap_user,
            imap_password=args.imap_password,
        )
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
