"""Multi-lane async KOL fetcher with jitter, pagination, failover, lockfile, and SHA-256."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import os
import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from nti_core.canonical import canonical_jsonl_bytes
from nti_core.types import EpochStatus, KolProfile, RawPost

from nti_fetcher.protocol import PostSource


class CycleLockedError(RuntimeError):
    """Raised when another fetcher cycle already holds the lockfile."""


class CycleLock:
    """Cross-platform atomic lockfile preventing overlapping fetch cycles."""

    def __init__(self, lock_path: str | Path) -> None:
        self.lock_path = Path(lock_path)
        self._acquired = False

    def acquire(self) -> None:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
        try:
            fd = os.open(str(self.lock_path), flags)
        except FileExistsError as exc:
            raise CycleLockedError(f"Lockfile already held: {self.lock_path}") from exc
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(json.dumps({"pid": os.getpid(), "acquired_at": datetime.now(UTC).isoformat()}))
        self._acquired = True

    def release(self) -> None:
        if self._acquired:
            try:
                self.lock_path.unlink(missing_ok=True)
            finally:
                self._acquired = False

    def __enter__(self) -> CycleLock:
        self.acquire()
        return self

    def __exit__(self, *_: object) -> None:
        self.release()


@dataclass(frozen=True, slots=True)
class LaneReport:
    lane: int
    file: str
    source: str
    failover_triggered: bool
    accounts_ok: int
    accounts_failed: int
    post_count: int
    sha256: str
    started_at: str
    finished_at: str
    failed_user_ids: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class FetchCycleResult:
    epoch_id: int
    status: EpochStatus
    started_at: str
    finished_at: str
    lanes: tuple[LaneReport, ...]
    total_ok: int
    total_failed: int
    total_posts: int
    manifest_path: Path
    manifest_sha256: str
    posts: tuple[RawPost, ...]


def _serialize_post(post: RawPost) -> dict[str, Any]:
    return {
        "tweet_id": post.tweet_id,
        "user_id": post.user_id,
        "handle": post.handle,
        "created_at": post.created_at.astimezone(UTC).isoformat(),
        "text": post.text,
        "likes": post.likes,
        "reposts": post.reposts,
        "quotes": post.quotes,
        "replies": post.replies,
        "fetched_at": post.fetched_at.astimezone(UTC).isoformat(),
    }


async def _fetch_kol_paginated(
    source: PostSource,
    user_id: int,
    since_id: int | None,
    boundary: datetime,
    page_limit: int = 20,
    max_pages: int = 3,
) -> list[RawPost]:
    """Fetch up to max_pages (default 3 x 20 = 60 posts) via cursor/max_id pagination."""
    collected: dict[int, RawPost] = {}
    max_id: int | None = None
    sig = inspect.signature(source.user_timeline)
    supports_max_id = "max_id" in sig.parameters

    for _ in range(max_pages):
        if supports_max_id:
            page = await source.user_timeline(  # type: ignore[call-arg]
                user_id=user_id,
                since_id=since_id,
                limit=page_limit,
                max_id=max_id,
            )
        else:
            page = await source.user_timeline(user_id=user_id, since_id=since_id, limit=page_limit)

        if not page:
            break

        for post in page:
            if post.created_at < boundary:
                collected[post.tweet_id] = post

        if len(page) < page_limit or not supports_max_id:
            break
        next_max_id = min(p.tweet_id for p in page)
        if max_id is not None and next_max_id >= max_id:
            break
        max_id = next_max_id

    return sorted(collected.values(), key=lambda p: p.tweet_id)


class FetchRunner:
    """3-lane parallel KOL post fetcher with retries, failover, manifest, and lockfile."""

    def __init__(
        self,
        primary: PostSource,
        fallback: PostSource | None = None,
        output_dir: str | Path = "data/snapshots",
        lock_path: str | Path = "data/fetcher.lock",
        num_lanes: int = 3,
        jitter_range: tuple[float, float] = (5.0, 8.0),
        page_limit: int = 20,
        max_pages: int = 3,
        max_retries: int = 3,
        failover_threshold: float = 0.10,
        incomplete_threshold: float = 0.01,
        rng_seed: int | None = None,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._output_dir = Path(output_dir)
        self._lock_path = Path(lock_path)
        self._num_lanes = num_lanes
        self._jitter_range = jitter_range
        self._page_limit = page_limit
        self._max_pages = max_pages
        self._max_retries = max_retries
        self._failover_threshold = failover_threshold
        self._incomplete_threshold = incomplete_threshold
        self._rng = random.Random(rng_seed)

    @staticmethod
    def eligible_kols(kols: Sequence[KolProfile], epoch_id: int) -> list[KolProfile]:
        ordered = sorted(kols, key=lambda k: k.user_id)
        return [
            k for k in ordered if k.active and k.poll_tier > 0 and (epoch_id % k.poll_tier == 0)
        ]

    async def _sleep_jitter(self) -> None:
        lo, hi = self._jitter_range
        if hi > 0:
            await asyncio.sleep(self._rng.uniform(lo, hi))

    async def _fetch_with_retries(
        self,
        source: PostSource,
        user_id: int,
        since_id: int | None,
        boundary: datetime,
    ) -> list[RawPost]:
        last_exc: Exception | None = None
        for _ in range(self._max_retries):
            try:
                return await _fetch_kol_paginated(
                    source=source,
                    user_id=user_id,
                    since_id=since_id,
                    boundary=boundary,
                    page_limit=self._page_limit,
                    max_pages=self._max_pages,
                )
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
        assert last_exc is not None
        raise last_exc

    async def _run_lane(
        self,
        lane_id: int,
        kols: list[KolProfile],
        since_ids: dict[int, int],
        boundary: datetime,
        epoch_dir: Path,
    ) -> tuple[LaneReport, list[RawPost]]:
        started = datetime.now(UTC).isoformat()
        active_source: PostSource = self._primary
        failover_triggered = False
        lane_posts: list[RawPost] = []
        ok_ids: set[int] = set()
        failed_ids: list[int] = []
        lane_total = len(kols)

        for kol in kols:
            await self._sleep_jitter()
            try:
                posts = await self._fetch_with_retries(
                    source=active_source,
                    user_id=kol.user_id,
                    since_id=since_ids.get(kol.user_id),
                    boundary=boundary,
                )
                lane_posts.extend(posts)
                ok_ids.add(kol.user_id)
            except Exception:  # noqa: BLE001
                failed_ids.append(kol.user_id)
                if (
                    not failover_triggered
                    and self._fallback is not None
                    and lane_total > 0
                    and (len(failed_ids) / lane_total) > self._failover_threshold
                ):
                    failover_triggered = True
                    active_source = self._fallback
                    # Retry previously failed KOLs in this lane on the backup source
                    still_failed: list[int] = []
                    for f_uid in failed_ids:
                        try:
                            recovered = await self._fetch_with_retries(
                                source=active_source,
                                user_id=f_uid,
                                since_id=since_ids.get(f_uid),
                                boundary=boundary,
                            )
                            lane_posts.extend(recovered)
                            ok_ids.add(f_uid)
                        except Exception:  # noqa: BLE001
                            still_failed.append(f_uid)
                    failed_ids = still_failed

        lane_posts.sort(key=lambda p: p.tweet_id)
        filename = f"{lane_id}.jsonl"
        file_path = epoch_dir / filename
        raw_bytes = canonical_jsonl_bytes(_serialize_post(p) for p in lane_posts)
        file_path.write_bytes(raw_bytes)
        file_sha = hashlib.sha256(raw_bytes).hexdigest()
        finished = datetime.now(UTC).isoformat()

        report = LaneReport(
            lane=lane_id,
            file=filename,
            source=active_source.name,
            failover_triggered=failover_triggered,
            accounts_ok=len(ok_ids),
            accounts_failed=len(failed_ids),
            post_count=len(lane_posts),
            sha256=file_sha,
            started_at=started,
            finished_at=finished,
            failed_user_ids=tuple(sorted(failed_ids)),
        )
        return report, lane_posts

    async def run_cycle(
        self,
        epoch_id: int,
        boundary: datetime,
        kols: Sequence[KolProfile],
        since_ids: dict[int, int] | None = None,
    ) -> FetchCycleResult:
        with CycleLock(self._lock_path):
            started = datetime.now(UTC).isoformat()
            epoch_dir = self._output_dir / str(epoch_id)
            epoch_dir.mkdir(parents=True, exist_ok=True)

            eligible = self.eligible_kols(kols, epoch_id)
            partitions: list[list[KolProfile]] = [[] for _ in range(self._num_lanes)]
            for idx, kol in enumerate(eligible):
                partitions[idx % self._num_lanes].append(kol)

            since_map = since_ids or {}
            tasks = [
                self._run_lane(lane_id, partitions[lane_id], since_map, boundary, epoch_dir)
                for lane_id in range(self._num_lanes)
            ]
            lane_outputs = await asyncio.gather(*tasks)

            reports: list[LaneReport] = []
            all_posts: list[RawPost] = []
            for rep, posts in lane_outputs:
                reports.append(rep)
                all_posts.extend(posts)

            all_posts.sort(key=lambda p: p.tweet_id)
            total_ok = sum(r.accounts_ok for r in reports)
            total_failed = sum(r.accounts_failed for r in reports)
            total_eligible = len(eligible)
            failed_ratio = (total_failed / total_eligible) if total_eligible > 0 else 0.0
            status = (
                EpochStatus.INCOMPLETE
                if failed_ratio > self._incomplete_threshold
                else EpochStatus.COLLECTING
            )
            finished = datetime.now(UTC).isoformat()

            manifest_body: dict[str, Any] = {
                "epoch_id": epoch_id,
                "status": str(status),
                "started_at": started,
                "finished_at": finished,
                "total_ok": total_ok,
                "total_failed": total_failed,
                "total_posts": len(all_posts),
                "lanes": [
                    {
                        "lane": r.lane,
                        "file": r.file,
                        "source": r.source,
                        "failover_triggered": r.failover_triggered,
                        "accounts_ok": r.accounts_ok,
                        "accounts_failed": r.accounts_failed,
                        "post_count": r.post_count,
                        "sha256": r.sha256,
                        "started_at": r.started_at,
                        "finished_at": r.finished_at,
                    }
                    for r in reports
                ],
            }
            manifest_bytes = json.dumps(manifest_body, sort_keys=True, indent=2).encode("utf-8")
            manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
            manifest_body["manifest_sha256"] = manifest_sha
            manifest_path = epoch_dir / "manifest.json"
            manifest_path.write_text(
                json.dumps(manifest_body, sort_keys=True, indent=2),
                encoding="utf-8",
            )

            return FetchCycleResult(
                epoch_id=epoch_id,
                status=status,
                started_at=started,
                finished_at=finished,
                lanes=tuple(reports),
                total_ok=total_ok,
                total_failed=total_failed,
                total_posts=len(all_posts),
                manifest_path=manifest_path,
                manifest_sha256=manifest_sha,
                posts=tuple(all_posts),
            )
