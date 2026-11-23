"""Batch classification pipeline with half-batch retry, zero-q fallback, and 429/quota failover."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from nti_classifier.adapters import InvalidResponseError, RateLimitError
from nti_classifier.protocol import LLM, ClassResult, PostIn, PromptSpec

DEFAULT_NARRATIVES: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
DEFAULT_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


def load_prompt_spec(
    version: str = "v1",
    prompts_dir: str | Path | None = None,
    narratives: tuple[int, ...] = DEFAULT_NARRATIVES,
) -> PromptSpec:
    base = Path(prompts_dir) if prompts_dir is not None else DEFAULT_PROMPTS_DIR
    prompt_path = base / version / "system.txt"
    text = prompt_path.read_text(encoding="utf-8").strip()
    return PromptSpec(version=version, system_prompt=text, narratives=narratives)


class DailyQuotaTracker:
    """Persists daily request count for the primary Gemini LLM."""

    def __init__(self, limit: int = 1000, state_path: str | Path | None = None) -> None:
        self._limit = limit
        self._state_path = Path(state_path) if state_path is not None else None
        self._counts: dict[str, int] = self._load()

    @staticmethod
    def _day(now: datetime | None = None) -> str:
        ts = now or datetime.now(UTC)
        return ts.astimezone(UTC).strftime("%Y-%m-%d")

    def count(self, now: datetime | None = None) -> int:
        return self._counts.get(self._day(now), 0)

    def remaining(self, now: datetime | None = None) -> int:
        return max(0, self._limit - self.count(now))

    def has_quota(self, now: datetime | None = None) -> bool:
        return self.count(now) < self._limit

    def consume(self, amount: int = 1, now: datetime | None = None) -> int:
        day = self._day(now)
        self._counts[day] = self._counts.get(day, 0) + amount
        self._save()
        return self._counts[day]

    def _load(self) -> dict[str, int]:
        if self._state_path is None or not self._state_path.exists():
            return {}
        data = json.loads(self._state_path.read_text(encoding="utf-8"))
        return {str(k): int(v) for k, v in data.items()}

    def _save(self) -> None:
        if self._state_path is None:
            return
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        self._state_path.write_text(json.dumps(self._counts, sort_keys=True), encoding="utf-8")


@dataclass(frozen=True, slots=True)
class LlmRunRecord:
    model_version: str
    prompt_version: str
    total_posts: int
    succeeded_posts: int
    retried_half_batch: int
    fallback_zero_count: int
    used_fallback_provider: bool
    invalid_ratio: float
    started_at: str
    finished_at: str


@dataclass(frozen=True, slots=True)
class PipelineOutput:
    results: tuple[ClassResult, ...]
    run_record: LlmRunRecord
    failed_tweet_ids: tuple[int, ...] = ()


class ClassifierPipeline:
    """Runs batched classification (size 100) with half-batch retries and provider failover."""

    def __init__(
        self,
        primary: LLM,
        fallback: LLM | None = None,
        batch_size: int = 100,
        daily_primary_limit: int = 1000,
        quota_state_path: str | Path | None = None,
        max_split_depth: int = 1,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self._primary = primary
        self._max_split_depth = max_split_depth
        self._failed_ids: set[int] = set()
        self._fallback = fallback
        self._batch_size = batch_size
        self._quota = DailyQuotaTracker(limit=daily_primary_limit, state_path=quota_state_path)

    async def _call_provider(
        self,
        batch: list[PostIn],
        spec: PromptSpec,
    ) -> tuple[list[ClassResult], bool]:
        """Call primary if quota allows; failover to fallback on 429 or exhausted quota."""
        if self._quota.has_quota():
            self._quota.consume()
            try:
                return await self._primary.classify(batch, spec), False
            except RateLimitError:
                if self._fallback is None:
                    raise
                return await self._fallback.classify(batch, spec), True

        if self._fallback is None:
            raise RateLimitError("Primary daily quota exhausted and no fallback configured")
        return await self._fallback.classify(batch, spec), True

    async def _classify_chunk(
        self,
        chunk: list[PostIn],
        spec: PromptSpec,
        *,
        allow_split: bool,
        depth_remaining: int | None = None,
    ) -> tuple[list[ClassResult], int, int, bool]:
        """Return (results, half_batch_retries, zero_q_fallbacks, used_fallback)."""
        depth_remaining = self._max_split_depth if depth_remaining is None else depth_remaining
        try:
            res, used_fb = await self._call_provider(chunk, spec)
            return res, 0, 0, used_fb
        except InvalidResponseError:
            if allow_split and depth_remaining > 0 and len(chunk) > 1:
                mid = len(chunk) // 2
                left_res, l_ret, l_zero, l_fb = await self._classify_chunk(
                    chunk[:mid], spec, allow_split=True, depth_remaining=depth_remaining - 1
                )
                right_res, r_ret, r_zero, r_fb = await self._classify_chunk(
                    chunk[mid:], spec, allow_split=True, depth_remaining=depth_remaining - 1
                )
                return (
                    left_res + right_res,
                    1 + l_ret + r_ret,
                    l_zero + r_zero,
                    l_fb or r_fb,
                )
            zeros = [ClassResult(tweet_id=p.tweet_id, q={}) for p in chunk]
            self._failed_ids.update(p.tweet_id for p in chunk)
            return zeros, 0, len(chunk), False

    async def run(self, posts: Sequence[PostIn], spec: PromptSpec) -> PipelineOutput:
        started = datetime.now(UTC).isoformat()
        self._failed_ids.clear()
        ordered = sorted(posts, key=lambda p: p.tweet_id)
        all_results: list[ClassResult] = []
        total_retries = 0
        total_zeros = 0
        used_fallback_any = False

        for start in range(0, len(ordered), self._batch_size):
            chunk = ordered[start : start + self._batch_size]
            res, retries, zeros, used_fb = await self._classify_chunk(chunk, spec, allow_split=True)
            all_results.extend(res)
            total_retries += retries
            total_zeros += zeros
            used_fallback_any = used_fallback_any or used_fb

        all_results.sort(key=lambda r: r.tweet_id)
        total_posts = len(ordered)
        succeeded = total_posts - total_zeros
        invalid_ratio = (total_zeros / total_posts) if total_posts > 0 else 0.0
        finished = datetime.now(UTC).isoformat()

        model_ver = self._primary.version
        if used_fallback_any and self._fallback is not None:
            model_ver = f"{self._primary.version}+{self._fallback.version}"

        record = LlmRunRecord(
            model_version=model_ver,
            prompt_version=spec.version,
            total_posts=total_posts,
            succeeded_posts=succeeded,
            retried_half_batch=total_retries,
            fallback_zero_count=total_zeros,
            used_fallback_provider=used_fallback_any,
            invalid_ratio=invalid_ratio,
            started_at=started,
            finished_at=finished,
        )
        return PipelineOutput(
            results=tuple(all_results), run_record=record,
            failed_tweet_ids=tuple(sorted(self._failed_ids)),
        )
