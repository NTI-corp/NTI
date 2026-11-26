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


def test_gemini_rate_limit_is_retried_with_backoff(monkeypatch) -> None:
    from nti_classifier.adapters import GeminiAdapter

    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr("nti_classifier.adapters.asyncio.sleep", fake_sleep)
    state = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        state["n"] += 1
        if state["n"] <= 2:
            return httpx.Response(429, headers={"retry-after": "3"}, json={"error": "limit"})
        text = json.dumps({"results": []})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = GeminiAdapter(api_key="k", model="gemini-test", client=client)
    spec = PromptSpec(version="v2", system_prompt="classify", narratives=(1,))

    async def run() -> None:
        try:
            await adapter.classify([PostIn(1, "alice", "hello")], spec)
        except Exception:  # empty answer is invalid; only the retry behaviour matters
            pass

    asyncio.run(run())
    assert state["n"] == 3
    assert len(sleeps) >= 2
    assert all(2.5 < d <= 3.0 for d in sleeps[:2])


def test_gemini_calls_are_paced(monkeypatch) -> None:
    import nti_classifier.adapters as adapters

    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(adapters.asyncio, "sleep", fake_sleep)
    monkeypatch.setenv("GEMINI_MIN_INTERVAL_SECONDS", "4")
    monkeypatch.setattr(adapters, "_gemini_next_slot", {})
    monkeypatch.setattr(adapters, "_gemini_blocked_until", {})

    async def run() -> None:
        for _ in range(3):
            await adapters._gemini_pace(["a"])

    asyncio.run(run())
    assert len(sleeps) == 2
    assert 3.0 < sleeps[0] <= 4.0
    assert 7.0 < sleeps[1] <= 8.0


def test_gemini_spreads_calls_over_keys_and_skips_a_blocked_key(monkeypatch) -> None:
    import time

    import nti_classifier.adapters as adapters

    async def fake_sleep(delay: float) -> None:
        return None

    monkeypatch.setattr(adapters.asyncio, "sleep", fake_sleep)
    monkeypatch.setenv("GEMINI_MIN_INTERVAL_SECONDS", "4")
    monkeypatch.setenv("GEMINI_API_KEY_2", "second")
    monkeypatch.setattr(adapters, "_gemini_next_slot", {})
    monkeypatch.setattr(adapters, "_gemini_blocked_until", {})
    keys = adapters._gemini_keys("first")
    assert keys == ["first", "second"]

    async def run() -> list[str]:
        return [await adapters._gemini_pace(keys) for _ in range(4)]

    assert asyncio.run(run()) == ["first", "second", "first", "second"]
    adapters._gemini_blocked_until["first"] = time.monotonic() + 60
    adapters._gemini_next_slot.clear()
    assert asyncio.run(run())[0] == "second"


def test_gemini_overload_is_retried_longer(monkeypatch) -> None:
    from nti_classifier.adapters import GeminiAdapter

    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr("nti_classifier.adapters.asyncio.sleep", fake_sleep)
    monkeypatch.setattr("nti_classifier.adapters._gemini_blocked_until", {})
    monkeypatch.setattr("nti_classifier.adapters._gemini_next_slot", {})
    state = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        state["n"] += 1
        if state["n"] <= 5:
            return httpx.Response(503, json={"error": "high demand"})
        text = json.dumps({"results": []})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = GeminiAdapter(api_key="k", model="gemini-test", client=client)
    spec = PromptSpec(version="v2", system_prompt="classify", narratives=(1,))

    async def run() -> None:
        try:
            await adapter.classify([PostIn(1, "alice", "hello")], spec)
        except Exception:  # empty answer is invalid; only the retry behaviour matters
            pass

    asyncio.run(run())
    assert state["n"] == 6
    assert sleeps[:5] == [5.0, 10.0, 15.0, 20.0, 25.0]
