"""Bounded-time, fully paginated live input preparation with resumable classification."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from nti_classifier.adapters import MiMoAdapter
from nti_classifier.pipeline import ClassifierPipeline, load_prompt_spec
from nti_classifier.protocol import PostIn
from nti_core.config import NTIConfig
from nti_core.types import KolProfile
from nti_engine.calc import select_engagement
from nti_engine.models import EngagementSnapshot, EnginePost
from nti_fetcher.storage import SupabaseStorage


def unix(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def iso(value: int) -> str:
    return datetime.fromtimestamp(value, UTC).isoformat()


async def prepare_engine_posts(
    *,
    storage: SupabaseStorage,
    cfg: NTIConfig,
    kols: list[KolProfile],
    epoch_id: int,
    boundary_unix: int,
    observation_cutoff_unix: int,
    repo_root: Path,
) -> tuple[list[EnginePost], str]:
    model = os.environ.get("MIMO_MODEL", "mimo-v2.6-pro")
    prompt = os.environ.get("CLASSIFIER_PROMPT_VERSION", "v2")
    lower = iso(boundary_unix - cfg.lookback_hours * 3600)
    kol_by_id = {k.user_id: k for k in kols}
    rows = await storage.select(
        "posts",
        columns="tweet_id,user_id,created_at,body",
        filters={"and": f"(created_at.gte.{lower},created_at.lt.{iso(boundary_unix)})"},
        order="tweet_id.asc",
    )
    posts = [
        r
        for r in rows
        if int(r["user_id"]) in kol_by_id and unix(str(r["created_at"])) < boundary_unix
    ]
    metrics: dict[int, list[EngagementSnapshot]] = {}
    q_by_id: dict[int, dict[int, Decimal]] = {}
    semaphore = asyncio.Semaphore(4)

    async def read_chunk(chunk: list[dict[str, Any]]) -> None:
        ids = ",".join(str(r["tweet_id"]) for r in chunk)
        async with semaphore:
            eng_rows = await storage.select(
                "post_engagement",
                columns="tweet_id,likes,reposts,quotes,replies,fetched_at",
                filters={
                    "tweet_id": f"in.({ids})",
                    "and": (
                        f"(fetched_at.gte.{lower},"
                        f"fetched_at.lte.{iso(observation_cutoff_unix)})"
                    ),
                },
                order="tweet_id.asc,fetched_at.asc",
            )
            cls_rows = await storage.select(
                "classifications",
                columns="tweet_id,q,model_version",
                filters={
                    "tweet_id": f"in.({ids})",
                    "prompt_version": f"eq.{prompt}",
                    "model_version": f"eq.{model}",
                },
                order="tweet_id.asc",
            )
        for row in eng_rows:
            observed = unix(str(row["fetched_at"]))
            if observed > observation_cutoff_unix:
                continue
            metrics.setdefault(int(row["tweet_id"]), []).append(
                EngagementSnapshot(
                    likes=int(row.get("likes", 0)),
                    reposts=int(row.get("reposts", 0)),
                    quotes=int(row.get("quotes", 0)),
                    replies=int(row.get("replies", 0)),
                    fetched_at_unix=observed,
                )
            )
        for row in cls_rows:
            if row.get("model_version") != model:
                continue
            q_by_id[int(row["tweet_id"])] = {
                int(k): Decimal(str(v)) for k, v in (row.get("q") or {}).items()
            }

    await asyncio.gather(*(read_chunk(posts[i : i + 150]) for i in range(0, len(posts), 150)))
    selected: dict[int, EngagementSnapshot] = {}
    for row in posts:
        tid = int(row["tweet_id"])
        snap = select_engagement(
            metrics.get(tid, []),
            unix(str(row["created_at"])),
            observation_cutoff_unix,
            cfg.engagement_reread_hours,
        )
        if snap is not None:
            selected[tid] = snap

    unclassified = [
        PostIn(
            int(r["tweet_id"]),
            kol_by_id[int(r["user_id"])].handle,
            str(r["body"]),
        )
        for r in posts
        if int(r["tweet_id"]) in selected and int(r["tweet_id"]) not in q_by_id and r.get("body")
    ]
    failed: set[int] = set()
    if unclassified:
        adapter = MiMoAdapter(api_key=os.environ.get("MIMO_API_KEY", ""), model=model)
        pipeline = ClassifierPipeline(
            primary=adapter,
            batch_size=min(cfg.classifier.batch_size, 30),
            max_split_depth=6,
            daily_primary_limit=100000,
        )
        spec = load_prompt_spec(prompt, repo_root / "services/classifier/prompts", cfg.narratives)
        # Persist each checkpoint before starting the next one. A restart never discards
        # a completed hour of provider work or records a failed response as "unrelated".
        for offset in range(0, len(unclassified), 150):
            output = await pipeline.run(unclassified[offset : offset + 150], spec)
            failed.update(output.failed_tweet_ids)
            good = [r for r in output.results if r.tweet_id not in output.failed_tweet_ids]
            await storage.upsert_classifications(
                [
                    {
                        "tweet_id": r.tweet_id,
                        "model_version": model,
                        "prompt_version": prompt,
                        "series_id": 0,
                        "q": {str(k): v for k, v in r.q.items()},
                    }
                    for r in good
                ]
            )
            await storage.upsert_llm_runs(
                [
                    {
                        "epoch_id": epoch_id,
                        "provider": "mimo",
                        "model_version": model,
                        "prompt_version": prompt,
                        "batch_size": min(cfg.classifier.batch_size, 30),
                        "valid_count": len(good),
                        "failed_count": len(output.failed_tweet_ids),
                    }
                ]
            )
            for result in good:
                q_by_id[result.tweet_id] = {int(k): Decimal(str(v)) for k, v in result.q.items()}

    ready = [
        EnginePost(
            tweet_id=int(r["tweet_id"]),
            user_id=int(r["user_id"]),
            created_at_unix=unix(str(r["created_at"])),
            engagements=(selected[int(r["tweet_id"])],),
            q=q_by_id[int(r["tweet_id"])],
        )
        for r in posts
        if int(r["tweet_id"]) in selected and int(r["tweet_id"]) in q_by_id
    ]
    report = {
        "epoch_id": epoch_id,
        "boundary_unix": boundary_unix,
        "observation_cutoff_unix": observation_cutoff_unix,
        "active_kols": len(kols),
        "window_posts": len(posts),
        "observed_posts": len(selected),
        "classified_posts": len(ready),
        "failed_classifications": len(failed),
        "missing_classification": len(selected) - len(ready),
        "contributing_kols": len({p.user_id for p in ready if p.q}),
        "model_version": model,
        "prompt_version": prompt,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    state_dir = repo_root / "data/state"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "oracle_inputs.json").write_text(
        json.dumps(report, sort_keys=True), encoding="utf-8"
    )
    print(json.dumps({"input_preparation": report}), flush=True)
    # Only abort on a systemic LLM outage (>20% failure with >10 failed posts, or zero ready posts).
    # A handful of malformed/emoji-only tweets must not deadlock an entire 4h epoch commit.
    attempted = len(unclassified)
    if not ready or (len(failed) > 10 and attempted > 0 and (len(failed) / attempted) > 0.20):
        raise RuntimeError(f"{len(failed)} classifications failed; checkpoint saved for retry")
    return ready, model
