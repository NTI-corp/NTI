"""Automatic classifier check with no human labels: self-consistency and cross-model agreement.

What this proves: the model answers the same way twice (consistency) and a second, independent model
mostly agrees (cross-model). What it does not prove: that either is right. Reports say so.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

from nti_classifier.adapters import GeminiAdapter, MiMoAdapter
from nti_classifier.evaluate import _top_narrative
from nti_classifier.pipeline import ClassifierPipeline, PipelineOutput, load_prompt_spec
from nti_classifier.protocol import LLM, ClassResult, PostIn

MIN_AGREEMENT = 0.85
MIN_JSON_VALIDITY = 0.99


@dataclass(frozen=True, slots=True)
class PairReport:
    name: str
    compared: int
    agree: int
    agreement: float
    agreement_on_labeled: float
    passed: bool


@dataclass(frozen=True, slots=True)
class AutoEvalReport:
    samples: int
    prompt_version: str
    json_validity: float
    pairs: tuple[PairReport, ...]
    passed: bool
    second_model: str
    note: str


def top_map(results: Sequence[ClassResult], threshold: float = 0.5) -> dict[int, int | None]:
    return {r.tweet_id: _top_narrative(r.q, threshold) for r in results}


def compare(name: str, a: dict[int, int | None], b: dict[int, int | None]) -> PairReport:
    """Top-narrative agreement per post; the labeled figure skips posts both runs left unlabeled."""
    ids = sorted(set(a) & set(b))
    agree = sum(1 for i in ids if a[i] == b[i])
    labeled = [i for i in ids if a[i] is not None or b[i] is not None]
    agree_labeled = sum(1 for i in labeled if a[i] == b[i])
    agreement = agree / len(ids) if ids else 0.0
    on_labeled = agree_labeled / len(labeled) if labeled else 1.0
    return PairReport(
        name=name,
        compared=len(ids),
        agree=agree,
        agreement=round(agreement, 4),
        agreement_on_labeled=round(on_labeled, 4),
        passed=bool(ids) and agreement >= MIN_AGREEMENT,
    )


def build_report(
    prompt_version: str,
    samples: int,
    json_validity: float,
    pairs: Sequence[PairReport],
    second_model: str = "not run",
) -> AutoEvalReport:
    passed = json_validity >= MIN_JSON_VALIDITY and bool(pairs) and all(p.passed for p in pairs)
    return AutoEvalReport(
        samples=samples,
        prompt_version=prompt_version,
        json_validity=round(json_validity, 4),
        pairs=tuple(pairs),
        passed=passed,
        second_model=second_model,
        note=(
            "Consistency and agreement between models, not accuracy against human labels: "
            "two models can be wrong in the same way."
        ),
    )


def _validity(out: PipelineOutput) -> float:
    total = out.run_record.total_posts
    return out.run_record.succeeded_posts / total if total else 1.0


async def run_eval(
    posts: Sequence[PostIn],
    primary: LLM,
    second: LLM | None,
    prompt_dir: Path,
    prompt_version: str,
    narratives: tuple[int, ...],
) -> AutoEvalReport:
    spec = load_prompt_spec(prompt_version, prompt_dir, narratives)

    def pipeline(adapter: LLM) -> ClassifierPipeline:
        return ClassifierPipeline(adapter, None, daily_primary_limit=10**9, max_split_depth=6)

    first = await pipeline(primary).run(posts, spec)
    again = await pipeline(primary).run(posts, spec)
    pairs = [compare("same model, run twice", top_map(first.results), top_map(again.results))]
    validity = min(_validity(first), _validity(again))
    second_status = "not run"
    if second is not None:
        other = await pipeline(second).run(posts, spec)
        if _validity(other) < 0.5:
            second_status = f"unavailable (valid answers {_validity(other):.0%}), not counted"
        else:
            second_status = "compared"
            pairs.append(
                compare("two different models", top_map(first.results), top_map(other.results))
            )
            validity = min(validity, _validity(other))
    return build_report(prompt_version, len(posts), validity, pairs, second_status)


async def sample_posts(url: str, key: str, count: int, seed: int) -> list[PostIn]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    async with httpx.AsyncClient(
        base_url=f"{url.rstrip('/')}/rest/v1", headers=headers, timeout=60
    ) as c:
        posts = (
            await c.get(
                "/posts",
                params={
                    "select": "tweet_id,user_id,body",
                    "body": "not.is.null",
                    "order": "created_at.desc",
                    "limit": str(count * 6),
                },
            )
        ).json()
        kols = (await c.get("/kols", params={"select": "user_id,handle", "limit": "5000"})).json()
    handles = {int(k["user_id"]): str(k["handle"]) for k in kols}
    usable = [p for p in posts if str(p.get("body") or "").strip() and int(p["user_id"]) in handles]
    random.Random(seed).shuffle(usable)
    return [
        PostIn(int(p["tweet_id"]), handles[int(p["user_id"])], str(p["body"]))
        for p in usable[:count]
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--prompt", default=os.environ.get("CLASSIFIER_PROMPT_VERSION", "v2"))
    parser.add_argument("--no-second-model", action="store_true")
    parser.add_argument("--second-gemini-model", help="use another Gemini model as the second")
    args = parser.parse_args()

    url, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"]
    posts = asyncio.run(sample_posts(url, key, args.samples, args.seed))
    primary = GeminiAdapter()
    second: LLM | None
    if args.no_second_model:
        second = None
    elif args.second_gemini_model:
        second = GeminiAdapter(model=args.second_gemini_model)
    else:
        second = MiMoAdapter() if os.environ.get("MIMO_API_KEY") else None
    prompts = Path(__file__).resolve().parents[2] / "prompts"
    narratives = tuple(range(1, 11))
    report = asyncio.run(run_eval(posts, primary, second, prompts, args.prompt, narratives))
    print(json.dumps(asdict(report), indent=2))
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
