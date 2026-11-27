"""Name/symbol labels for tokens no KOL mentioned: parsing, the Gemini call, the runner."""

from __future__ import annotations

import asyncio
import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import pytest
from nti_discovery.runner import DiscoveryConfig, DiscoveryRunner, to_pg_bytea
from nti_discovery.token_labeler import GeminiTokenLabeler, parse_labels
from test_pons_runner import NOW, TSUKI, FakeMarket, FakeRpc, FakeStorage


def test_parse_labels_keeps_known_ids_and_turns_everything_else_into_none() -> None:
    assert parse_labels('{"1": 9, "2": null, "3": 99, "4": "x", "7": 3}', 3) == {
        1: 9,
        2: None,
        3: None,
    }
    assert parse_labels('```json\n{"1": 3}\n```', 1) == {1: 3}
    with pytest.raises(ValueError):
        parse_labels("[1, 2]", 2)


def gemini(handler: Any, keys: tuple[str, ...] = ("k1",)) -> GeminiTokenLabeler:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return GeminiTokenLabeler(api_keys=keys, model="m", client=client)


def reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


def test_gemini_labeler_maps_answers_back_to_addresses() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return reply('{"1": 9, "2": null}')

    out = asyncio.run(gemini(handler).label([("0xa", "PEPE2", "Pepe Two"), ("0xb", "XYZ", "Xyz")]))
    assert out == {"0xa": 9, "0xb": None}
    sent = json.loads(seen["body"]["contents"][0]["parts"][0]["text"])
    assert sent == [
        {"i": 1, "symbol": "PEPE2", "name": "Pepe Two"},
        {"i": 2, "symbol": "XYZ", "name": "Xyz"},
    ]


def test_gemini_labeler_returns_none_when_the_model_cannot_be_used(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", no_sleep)
    assert asyncio.run(gemini(lambda r: httpx.Response(503)).label([("0xa", "A", "A")])) is None
    assert asyncio.run(gemini(lambda r: httpx.Response(400)).label([("0xa", "A", "A")])) is None
    assert asyncio.run(gemini(lambda r: reply("not json")).label([("0xa", "A", "A")])) is None


class NoPostsStorage(FakeStorage):
    async def select(self, table: str, **kwargs: Any) -> list[dict[str, Any]]:
        if table == "posts":
            return []
        return await super().select(table, **kwargs)


class FakeLabeler:
    def __init__(self, answer: dict[str, int | None] | None) -> None:
        self.answer, self.calls = answer, 0

    async def label(self, tokens: Any) -> dict[str, int | None] | None:
        self.calls += 1
        return self.answer if self.answer is None else {a: self.answer.get(a) for a, _, _ in tokens}


def run_with(
    labeler: FakeLabeler | None,
    storage: FakeStorage,
    state: Path,
    market: FakeMarket,
    head: int = 1_000,
) -> dict[str, Any]:
    cfg = DiscoveryConfig(log_range=300, lookback_blocks=900, state_path=state)
    rpc = FakeRpc({TSUKI: 2}, head=head)
    return asyncio.run(DiscoveryRunner(rpc, storage, market, cfg, now=NOW, labeler=labeler).run())


def test_a_liquid_token_with_no_kol_mention_is_labeled_once(tmp_path: Path) -> None:
    storage, labeler, state = NoPostsStorage(), FakeLabeler({TSUKI: 9}), tmp_path / "d.json"
    first = run_with(labeler, storage, state, FakeMarket())
    assert first["name_labels"] == 1 and labeler.calls == 1
    assert storage.tokens[to_pg_bytea(TSUKI)]["narrative_id"] == 9

    # Already labeled and remembered: the model is not asked again.
    storage.tokens[to_pg_bytea(TSUKI)]["narrative_id"] = None
    again = run_with(labeler, storage, state, FakeMarket(), head=1_200)
    assert again["name_labels"] == 0 and labeler.calls == 1


def test_an_unclear_token_is_remembered_and_a_model_failure_is_retried(tmp_path: Path) -> None:
    storage, state = NoPostsStorage(), tmp_path / "d.json"
    failing = FakeLabeler(None)
    assert run_with(failing, storage, state, FakeMarket())["name_labels"] == 0
    assert failing.calls == 1  # failed: not remembered

    unclear = FakeLabeler({})
    assert run_with(unclear, storage, state, FakeMarket(), head=1_200)["name_labels"] == 0
    assert unclear.calls == 1 and storage.tokens[to_pg_bytea(TSUKI)]["narrative_id"] is None
    assert run_with(unclear, storage, state, FakeMarket(), head=1_400)["name_labels"] == 0
    assert unclear.calls == 1  # an answer of "none" is remembered


def test_tokens_below_the_liquidity_bar_never_reach_the_model(tmp_path: Path) -> None:
    storage, labeler = NoPostsStorage(), FakeLabeler({TSUKI: 9})
    out = run_with(labeler, storage, tmp_path / "d.json", FakeMarket(usd="1000"))  # 0.4 ETH
    assert Decimal(storage.tokens[to_pg_bytea(TSUKI)]["liquidity_eth"]) < 1
    assert out["name_labels"] == 0 and labeler.calls == 0
