"""MiMo adapter records the token usage the provider reports."""

from __future__ import annotations

import asyncio
import json

import httpx
from nti_classifier.adapters import MiMoAdapter
from nti_classifier.protocol import PostIn, PromptSpec


def test_usage_is_summed_across_calls() -> None:
    answer = {"results": []}

    def handler(request: httpx.Request) -> httpx.Response:
        body = {
            "choices": [{"message": {"content": json.dumps(answer)}}],
            "usage": {"prompt_tokens": 1200, "completion_tokens": 80},
        }
        return httpx.Response(200, json=body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = MiMoAdapter(api_key="k", client=client)
    spec = PromptSpec(version="v2", system_prompt="classify", narratives=(1,))

    async def run() -> None:
        for _ in range(2):
            try:
                await adapter.classify([PostIn(1, "alice", "hello")], spec)
            except Exception:  # an empty answer is invalid; only the usage bookkeeping matters here
                pass

    asyncio.run(run())
    assert adapter.calls == 2
    assert adapter.input_tokens == 2400
    assert adapter.output_tokens == 160


def test_rate_limit_is_retried_with_backoff(monkeypatch) -> None:
    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr("nti_classifier.adapters.asyncio.sleep", fake_sleep)
    state = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        state["n"] += 1
        if state["n"] <= 3:
            return httpx.Response(429, headers={"retry-after": "2"}, json={"error": "limit"})
        body = {
            "choices": [{"message": {"content": json.dumps({"results": []})}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 1},
        }
        return httpx.Response(200, json=body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = MiMoAdapter(api_key="k", client=client)
    spec = PromptSpec(version="v2", system_prompt="classify", narratives=(1,))

    async def run() -> None:
        try:
            await adapter.classify([PostIn(1, "alice", "hello")], spec)
        except Exception:  # empty answer is invalid; only the retry behaviour matters
            pass

    asyncio.run(run())
    assert state["n"] == 4
    assert sleeps[:3] == [2.0, 2.0, 2.0]
