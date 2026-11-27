"""Check that stored KOL posts are real, against X's public tweet endpoint (no login, no paid API).

For a random sample of stored posts this asks the public syndication endpoint for the same tweet id and
compares author id, creation time and text. It measures PRECISION: how many stored posts are real and
unaltered. It cannot measure how many real posts were missed (recall); that is the validator omission check,
which re-reads a seeded 10% of KOLs with a separate account pool every epoch.

Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python infra/scripts/source_audit.py --samples 200
Posts younger than --min-age-hours are skipped: edits and deletions settle with time. Exit 1 below --min-match.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta

ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result?id={id}&token=a"


@dataclass(frozen=True, slots=True)
class AuditReport:
    sampled: int
    resolved: int
    retweets: int
    gone: int
    unreachable: int
    author_match: float
    time_match: float
    text_match: float
    passed: bool
    note: str


def normalize(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text or "")
    return re.sub(r"\s+", " ", text).strip().lower()


def text_matches(stored: str, public: str) -> bool:
    a, b = normalize(stored), normalize(public)
    if not a or not b:
        return a == b
    return a == b or a.startswith(b[:60]) or b.startswith(a[:60])


RETWEET = re.compile(r"^RT @\w+:\s*")


def is_retweet(row: dict) -> bool:
    return bool(RETWEET.match(str(row.get("body") or "")))


def compare_post(row: dict, public: dict) -> tuple[bool, bool, bool]:
    """(author, time, text) matches. A stored retweet has its own id, but X serves the original tweet,
    so only the retweeted text can be compared."""
    if is_retweet(row):
        body = RETWEET.sub("", str(row.get("body") or ""), count=1)
        same = text_matches(body, str(public.get("text") or ""))
        return same, same, same
    author = str(row["user_id"]) == str((public.get("user") or {}).get("id_str"))
    stored_at = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
    public_at = datetime.fromisoformat(str(public.get("created_at", "")).replace("Z", "+00:00"))
    return author, abs((stored_at - public_at).total_seconds()) <= 2, text_matches(
        str(row.get("body") or ""), str(public.get("text") or "")
    )


def supabase_get(path: str) -> list[dict]:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}", headers={"apikey": key, "Authorization": f"Bearer {key}"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def fetch_public(tweet_id: int) -> tuple[str, dict | None]:
    """('ok', data) | ('gone', None) when X no longer serves it | ('error', None)."""
    req = urllib.request.Request(ENDPOINT.format(id=tweet_id), headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
    except urllib.error.HTTPError as exc:
        return ("gone", None) if exc.code in (404, 410) else ("error", None)
    except (urllib.error.URLError, TimeoutError):
        return "error", None
    if not body.strip():
        return "gone", None
    data = json.loads(body)
    if data.get("__typename") != "Tweet":
        return "gone", None
    return "ok", data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--min-age-hours", type=int, default=6)
    parser.add_argument("--min-match", type=float, default=0.95)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--pause", type=float, default=0.25)
    args = parser.parse_args()

    cutoff = (datetime.now(UTC) - timedelta(hours=args.min_age_hours)).isoformat()
    since = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    rows = supabase_get(
        "posts?select=tweet_id,user_id,created_at,body&body=not.is.null"
        f"&created_at=lt.{urllib.parse.quote(cutoff)}&created_at=gte.{urllib.parse.quote(since)}"
        f"&order=created_at.desc&limit={args.samples * 8}"
    )
    random.Random(args.seed).shuffle(rows)
    sample = rows[: args.samples]

    resolved = retweets = gone = unreachable = 0
    author = when = text = 0
    for row in sample:
        status, data = fetch_public(int(row["tweet_id"]))
        if status == "ok" and data is not None:
            resolved += 1
            retweets += is_retweet(row)
            a, t, x = compare_post(row, data)
            author, when, text = author + a, when + t, text + x
        elif status == "gone":
            gone += 1
        else:
            unreachable += 1
        time.sleep(args.pause)

    def rate(n: int) -> float:
        return round(n / resolved, 4) if resolved else 0.0

    checked = resolved + gone
    passed = bool(checked) and resolved / checked >= args.min_match and min(
        rate(author), rate(when), rate(text)
    ) >= args.min_match
    report = AuditReport(
        sampled=len(sample),
        resolved=resolved,
        retweets=retweets,
        gone=gone,
        unreachable=unreachable,
        author_match=rate(author),
        time_match=rate(when),
        text_match=rate(text),
        passed=passed,
        note="Precision only: proves stored posts are real; missed posts are not measured here.",
    )
    print(json.dumps(asdict(report), indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
