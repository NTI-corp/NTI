"""TDD tests for nti_classifier: prompts, adapters, pipeline retries/429 failover, evaluator."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from nti_classifier.protocol import ClassResult, PostIn, PromptSpec


def _make_posts(n: int) -> list[PostIn]:
    return [
        PostIn(tweet_id=1000 + i, handle=f"kol_{i}", text=f"post about ai agents {i}")
        for i in range(n)
    ]


def test_v1_system_prompt_exists_and_lists_all_10_narratives() -> None:
    from nti_classifier.pipeline import load_prompt_spec

    spec = load_prompt_spec("v1")
    assert spec.version == "v1"
    assert spec.narratives == (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    for name in (
        "privacy",
        "ai_agents",
        "rwa",
        "stablecoins",
        "depin",
        "prediction_markets",
        "perp_dex",
        "defi",
        "memecoin",
        "gaming",
    ):
        assert name in spec.system_prompt.lower()


@pytest.mark.asyncio
async def test_gemini_adapter_payload_and_429_rate_limit() -> None:
    from nti_classifier.adapters import GeminiAdapter, RateLimitError

    captured: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured.append({"url": str(request.url), "body": body})
        if len(captured) == 1:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps(
                                            [{"tweet_id": 1000, "q": {"2": 0.92, "8": 0.15}}]
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                },
            )
        return httpx.Response(429, json={"error": {"code": 429, "message": "quota exceeded"}})

    spec = PromptSpec(
        version="v1", system_prompt="classify", narratives=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        adapter = GeminiAdapter(api_key="gem-key", client=client)
        assert "gemini-4-hydrogen" in adapter.version
        res = await adapter.classify([PostIn(1000, "alice", "ai agent")], spec)
        assert len(res) == 1
        assert res[0].tweet_id == 1000
        assert res[0].q[2] == pytest.approx(0.92)
        assert "gemini-4-hydrogen:generateContent" in captured[0]["url"]
        assert captured[0]["body"]["generationConfig"]["temperature"] == 0
        assert captured[0]["body"]["generationConfig"]["responseMimeType"] == "application/json"

        with pytest.raises(RateLimitError):
            await adapter.classify([PostIn(1000, "alice", "ai agent")], spec)


@pytest.mark.asyncio
async def test_mimo_adapter_openai_compatible_with_thinking_disabled() -> None:
    from nti_classifier.adapters import MiMoAdapter

    captured_body: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_body
        captured_body = json.loads(request.content.decode("utf-8"))
        assert str(request.url).endswith("/chat/completions")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": json.dumps([{"tweet_id": 2001, "q": {"1": 0.85}}])}}
                ]
            },
        )

    spec = PromptSpec(
        version="v1", system_prompt="classify", narratives=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        adapter = MiMoAdapter(
            api_key="mimo-key", base_url="https://api.mimo.example/v1", client=client
        )
        assert "mimo-v2.5" in adapter.version
        res = await adapter.classify([PostIn(2001, "bob", "zk privacy")], spec)
        assert len(res) == 1 and res[0].q[1] == pytest.approx(0.85)
        assert captured_body["model"] == "mimo-v2.5"
        assert captured_body["temperature"] == 0
        assert captured_body["thinking"] == {"type": "disabled"}


@pytest.mark.asyncio
async def test_pipeline_batch_100_half_batch_retry_and_zero_q_fallback(tmp_path: Path) -> None:
    from nti_classifier.adapters import InvalidResponseError
    from nti_classifier.pipeline import ClassifierPipeline

    call_sizes: list[int] = []

    class FlakyLLM:
        version = "gemini-4-hydrogen@test"

        async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
            call_sizes.append(len(batch))
            # Fail full 100-post batch with malformed JSON -> triggers two 50-post half-batches
            if len(batch) == 100:
                raise InvalidResponseError("malformed json")
            # Fail the second half-batch (tweet_ids >= 1050) permanently -> falls back to zero-q
            if batch[0].tweet_id >= 1050 and batch[0].tweet_id < 1100:
                raise InvalidResponseError("still malformed")
            return [ClassResult(tweet_id=p.tweet_id, q={2: 0.8}) for p in batch]

    spec = PromptSpec(
        version="v1", system_prompt="classify", narratives=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    )
    pipe = ClassifierPipeline(
        primary=FlakyLLM(),
        batch_size=100,
        quota_state_path=tmp_path / "quota.json",
    )
    posts = _make_posts(120)  # 100 + 20
    output = await pipe.run(posts, spec)

    assert len(output.results) == 120
    # Batch 1: 100 -> retried as 50 + 50; Batch 2: 20
    assert call_sizes == [100, 50, 50, 20]
    by_id = {r.tweet_id: r for r in output.results}
    assert by_id[1000].q == {2: 0.8}
    assert by_id[1050].q == {}  # fell back to zero-q
    assert by_id[1100].q == {2: 0.8}
    assert output.run_record.retried_half_batch == 1
    assert output.run_record.fallback_zero_count == 50


@pytest.mark.asyncio
async def test_pipeline_auto_failover_gemini_429_and_daily_quota_to_mimo(tmp_path: Path) -> None:
    from nti_classifier.adapters import RateLimitError
    from nti_classifier.pipeline import ClassifierPipeline

    primary_calls = 0
    fallback_calls = 0

    class Primary429LLM:
        version = "gemini-4-hydrogen"

        async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
            nonlocal primary_calls
            primary_calls += 1
            if primary_calls == 2:
                raise RateLimitError("429")
            return [ClassResult(tweet_id=p.tweet_id, q={1: 0.7}) for p in batch]

    class BackupMiMoLLM:
        version = "mimo-v2.5"

        async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
            nonlocal fallback_calls
            fallback_calls += 1
            return [ClassResult(tweet_id=p.tweet_id, q={1: 0.6}) for p in batch]

    spec = PromptSpec(
        version="v1", system_prompt="classify", narratives=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
    )
    pipe = ClassifierPipeline(
        primary=Primary429LLM(),
        fallback=BackupMiMoLLM(),
        batch_size=10,
        daily_primary_limit=2,
        quota_state_path=tmp_path / "quota.json",
    )
    # 30 posts -> 3 batches of 10:
    # batch 1: primary ok (quota 1/2)
    # batch 2: primary raises 429 -> automatic failover to MiMo (quota 2/2)
    # batch 3: daily quota exhausted (2/2) -> goes directly to MiMo without calling primary
    output = await pipe.run(_make_posts(30), spec)
    assert len(output.results) == 30
    assert primary_calls == 2
    assert fallback_calls == 2
    assert output.run_record.used_fallback_provider is True


def test_agreement_evaluator_85_pct_and_99_pct_json_gate() -> None:
    from nti_classifier.evaluate import evaluate_agreement

    # 18/20 match (90% >= 85%), 99.5% JSON valid -> PASS
    ground_truth = {i: 2 for i in range(20)}
    predictions = [ClassResult(tweet_id=i, q={2: 0.9} if i < 18 else {9: 0.9}) for i in range(20)]
    report = evaluate_agreement(
        predictions=predictions,
        ground_truth=ground_truth,
        valid_responses=199,
        total_responses=200,
    )
    assert report.agreement == pytest.approx(0.90)
    assert report.json_validity == pytest.approx(0.995)
    assert report.passed is True

    # 16/20 match (80% < 85%) -> FAIL
    weak_preds = [ClassResult(tweet_id=i, q={2: 0.9} if i < 16 else {9: 0.9}) for i in range(20)]
    report_fail = evaluate_agreement(
        predictions=weak_preds,
        ground_truth=ground_truth,
        valid_responses=200,
        total_responses=200,
    )
    assert report_fail.passed is False
