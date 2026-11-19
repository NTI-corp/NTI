"""Daily retention purge job keeping Supabase within the 500 MB free-tier ceiling.

Policy:
- Clear posts.body older than 48 hours.
- Delete raw engagement metrics and raw fetch_cycles older than 10 days.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from nti_fetcher.storage import SupabaseStorage


@dataclass(frozen=True, slots=True)
class PurgeReport:
    ran_at: datetime
    body_cutoff: datetime
    metrics_cutoff: datetime


class RetentionPurger:
    def __init__(
        self,
        storage: SupabaseStorage,
        body_retention_hours: int = 48,
        metrics_retention_days: int = 10,
    ) -> None:
        self._storage = storage
        self._body_retention_hours = body_retention_hours
        self._metrics_retention_days = metrics_retention_days

    async def run(self, now: datetime | None = None) -> PurgeReport:
        ts = (now or datetime.now(UTC)).astimezone(UTC)
        body_cutoff = ts - timedelta(hours=self._body_retention_hours)
        metrics_cutoff = ts - timedelta(days=self._metrics_retention_days)

        await self._storage.patch(
            "posts",
            filters={"created_at": f"lt.{body_cutoff.isoformat()}", "body": "not.is.null"},
            values={"body": None},
        )
        await self._storage.delete(
            "post_engagement",
            filters={"fetched_at": f"lt.{metrics_cutoff.isoformat()}"},
        )
        await self._storage.delete(
            "fetch_cycles",
            filters={"finished_at": f"lt.{metrics_cutoff.isoformat()}"},
        )

        return PurgeReport(
            ran_at=ts,
            body_cutoff=body_cutoff,
            metrics_cutoff=metrics_cutoff,
        )


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_KEY are required for purge")
    report = asyncio.run(RetentionPurger(SupabaseStorage(url, key)).run())
    print(
        json.dumps(
            {
                "ran_at": report.ran_at.isoformat(),
                "body_cutoff": report.body_cutoff.isoformat(),
                "metrics_cutoff": report.metrics_cutoff.isoformat(),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
