"""LLM adapters for Gemini (primary) and MiMo (OpenAI-compatible fallback)."""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from nti_classifier.protocol import ClassResult, PostIn, PromptSpec

_RESULT_LIST_ADAPTER = TypeAdapter(list[ClassResult])


class RateLimitError(RuntimeError):
    """Raised on HTTP 429 or upstream rate limit from an LLM provider."""


class InvalidResponseError(ValueError):
    """Raised when an LLM returns malformed JSON or violates ClassResult schema."""


def _format_user_payload(batch: list[PostIn]) -> str:
    rows = [{"tweet_id": p.tweet_id, "handle": p.handle, "text": p.text} for p in batch]
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"))


def _wire_batch(batch: list[PostIn]) -> tuple[list[PostIn], dict[int, int]]:
    """Use small opaque IDs when snowflakes exceed exact JSON/JavaScript integers."""
    if not any(p.tweet_id > (1 << 53) - 1 for p in batch):
        return batch, {p.tweet_id: p.tweet_id for p in batch}
    translated = [PostIn(i, p.handle, p.text) for i, p in enumerate(batch, 1)]
    return translated, {i: p.tweet_id for i, p in enumerate(batch, 1)}


def _restore_ids(results: list[ClassResult], ids: dict[int, int]) -> list[ClassResult]:
    return [ClassResult(tweet_id=ids[r.tweet_id], q=r.q) for r in results]


def parse_classification_json(
    raw_text: str,
    expected_ids: set[int],
    valid_narratives: tuple[int, ...],
) -> list[ClassResult]:
    """Parse and Pydantic-validate JSON array into ClassResult entries."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise InvalidResponseError(f"Malformed JSON from LLM: {exc}") from exc

    if isinstance(parsed, dict) and "results" in parsed and isinstance(parsed["results"], list):
        parsed = parsed["results"]
    if not isinstance(parsed, list):
        raise InvalidResponseError("Expected top-level JSON array of ClassResult objects")

    try:
        items = _RESULT_LIST_ADAPTER.validate_python(parsed)
    except ValidationError as exc:
        raise InvalidResponseError(f"Schema validation failed: {exc}") from exc

    valid_set = set(valid_narratives)
    by_id: dict[int, ClassResult] = {}
    for item in items:
        if item.tweet_id not in expected_ids:
            continue
        filtered_q = {nid: prob for nid, prob in item.q.items() if nid in valid_set}
        by_id[item.tweet_id] = ClassResult(tweet_id=item.tweet_id, q=filtered_q)

    if len(by_id) != len(expected_ids):
        missing = sorted(expected_ids - set(by_id.keys()))
        raise InvalidResponseError(f"Missing tweet_ids in LLM output: {missing[:5]}")

    return [by_id[tid] for tid in sorted(by_id.keys())]


_gemini_next_slot: dict[str, float] = {}
_gemini_blocked_until: dict[str, float] = {}


def _gemini_keys(primary: str) -> list[str]:
    """The primary key plus any extra keys (GEMINI_API_KEY_2, comma separated) for failover."""
    extra = [k.strip() for k in os.environ.get("GEMINI_API_KEY_2", "").split(",") if k.strip()]
    keys: list[str] = []
    for key in [primary, *extra]:
        if key and key not in keys:
            keys.append(key)
    return keys


async def _gemini_pace(keys: list[str]) -> str:
    """Pick the key that can send soonest and wait for its slot.

    The free tier allows 15 requests a minute per model and project; spreading calls over several
    keys multiplies that, and a key that just hit its limit is skipped until it recovers.
    """
    interval = float(os.environ.get("GEMINI_MIN_INTERVAL_SECONDS", "0") or 0)
    now = time.monotonic()

    def ready_at(key: str) -> float:
        return max(now, _gemini_next_slot.get(key, 0.0), _gemini_blocked_until.get(key, 0.0))

    key = min(keys, key=ready_at)
    slot = ready_at(key)
    _gemini_next_slot[key] = slot + interval
    if slot > now:
        await asyncio.sleep(slot - now)
    return key


class GeminiAdapter:
    """Primary classifier adapter using Google Generative Language REST API."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
        client: httpx.AsyncClient | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self._keys = _gemini_keys(self._api_key)
        self._model = model or os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen")
        self.version = self._model
        self._base_url = base_url.rstrip("/")
        self._client = client
        self._timeout = timeout

    async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
        if not batch:
            return []
        batch, original_ids = _wire_batch(batch)
        url = f"{self._base_url}/models/{self._model}:generateContent"
        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": spec.system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": _format_user_payload(batch)}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        }
        resp: httpx.Response | None = None
        last_exc: Exception | None = None
        for attempt in range(8):
            key = await _gemini_pace(self._keys or [""])
            params = {"key": key} if key else None
            try:
                if self._client is not None:
                    resp = await self._client.post(url, params=params, json=payload)
                else:
                    async with httpx.AsyncClient(timeout=self._timeout) as client:
                        resp = await client.post(url, params=params, json=payload)
                last_exc = None
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                resp = None
                if attempt >= 2:
                    break
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            if resp.status_code == 429 and attempt < 7:
                wait = resp.headers.get("retry-after", "")
                fallback_delay = 20.0 if len(self._keys) > 1 else 4.0 * (attempt + 1)
                delay = float(wait) if wait.replace(".", "", 1).isdigit() else fallback_delay
                if "PerDay" in resp.text:
                    # Daily quota used up: this key is done for hours, do not keep knocking on it.
                    delay = 3600.0
                else:
                    delay = min(delay, 60.0)
                # The key rests for that long; the pacer picks another key meanwhile, or waits.
                _gemini_blocked_until[key] = time.monotonic() + delay
                continue
            if resp.status_code not in (500, 502, 503, 504) or attempt >= 7:
                break
            # Gemini sheds load with 503 in short spikes: wait it out instead of failing the run.
            await asyncio.sleep(min(5.0 * (attempt + 1), 30.0))

        if resp is None:
            raise RateLimitError(f"Gemini transport/timeout after retries: {last_exc}")
        if resp.status_code in (429, 503):
            raise RateLimitError(f"Gemini HTTP {resp.status_code} rate/capacity limit: {resp.text}")
        if resp.status_code >= 400:
            raise InvalidResponseError(f"Gemini HTTP {resp.status_code}: {resp.text}")

        data = resp.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
            text_parts = [
                p["text"]
                for p in parts
                if isinstance(p, dict) and not p.get("thought") and "text" in p
            ]
            text = text_parts[-1] if text_parts else parts[0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise InvalidResponseError(f"Unexpected Gemini response envelope: {exc}") from exc

        results = parse_classification_json(
            raw_text=str(text),
            expected_ids={p.tweet_id for p in batch},
            valid_narratives=spec.narratives,
        )
        return _restore_ids(results, original_ids)


class MiMoAdapter:
    """Primary classifier adapter using Xiaomi MiMo /chat/completions with thinking disabled."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._api_key = api_key or os.environ.get("MIMO_API_KEY", "")
        self._base_url = (
            base_url
            or os.environ.get("MIMO_API_BASE_URL")
            or "https://token-plan-sgp.xiaomimimo.com/v1"
        ).rstrip("/")
        self._model = model or os.environ.get("MIMO_MODEL", "mimo-v2.6-flash")
        self.version = self._model
        self._client = client
        self._timeout = timeout
        # Provider-reported usage, summed over every call this adapter made (retries included).
        self.input_tokens = 0
        self.output_tokens = 0
        self.calls = 0

    async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
        if not batch:
            return []
        batch, original_ids = _wire_batch(batch)
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self._model,
            "temperature": 0,
            "thinking": {"type": "disabled"},
            "messages": [
                {"role": "system", "content": spec.system_prompt},
                {"role": "user", "content": _format_user_payload(batch)},
            ],
        }
        resp: httpx.Response | None = None
        last_exc: Exception | None = None
        for attempt in range(8):
            try:
                if self._client is not None:
                    resp = await self._client.post(url, headers=headers, json=payload)
                else:
                    async with httpx.AsyncClient(timeout=self._timeout) as client:
                        resp = await client.post(url, headers=headers, json=payload)
                last_exc = None
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                resp = None
                if attempt >= 2:
                    break
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            if resp.status_code == 429 and attempt < 7:
                # Provider rate limit: back off (honouring Retry-After), do not fail the run.
                wait = resp.headers.get("retry-after", "")
                delay = float(wait) if wait.replace(".", "", 1).isdigit() else 5.0 * (attempt + 1)
                await asyncio.sleep(min(delay, 60.0))
                continue
            if resp.status_code not in (500, 502, 503, 504) or attempt == 2:
                break
            await asyncio.sleep(1.0 * (attempt + 1))

        if resp is None:
            raise RateLimitError(f"MiMo transport/timeout after retries: {last_exc}")
        if resp.status_code in (429, 503):
            raise RateLimitError(f"MiMo HTTP {resp.status_code} rate/capacity limit: {resp.text}")
        if resp.status_code >= 400:
            raise InvalidResponseError(f"MiMo HTTP {resp.status_code}: {resp.text}")

        data = resp.json()
        usage = data.get("usage") if isinstance(data, dict) else None
        if isinstance(usage, dict):
            self.input_tokens += int(usage.get("prompt_tokens") or 0)
            self.output_tokens += int(usage.get("completion_tokens") or 0)
        self.calls += 1
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise InvalidResponseError(f"Unexpected MiMo response envelope: {exc}") from exc

        results = parse_classification_json(
            raw_text=str(text),
            expected_ids={p.tweet_id for p in batch},
            valid_narratives=spec.narratives,
        )
        return _restore_ids(results, original_ids)
