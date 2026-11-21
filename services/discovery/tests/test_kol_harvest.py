"""KOL harvest: aggregation, gates, caps and row shaping with a fake search source."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from nti_discovery.kol_harvest import (
    HarvestConfig,
    SearchHit,
    harvest,
    poll_tier_for,
    to_rows,
)

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


class FakeSearch:
    def __init__(self, hits_by_keyword: dict[str, list[SearchHit]]) -> None:
        self.hits = hits_by_keyword

    async def search(self, query: str, limit: int) -> list[SearchHit]:
        for kw, hits in self.hits.items():
            if kw in query:
                return hits
        return []


def hit(uid: int, followers: int = 20_000, likes: int = 40, days: int = 1) -> SearchHit:
    return SearchHit(uid, f"u{uid}", followers, likes, NOW - timedelta(days=days, minutes=uid))


def test_gates_dedupe_and_primary_narrative() -> None:
    src = FakeSearch(
        {
            "zero knowledge": [hit(1), hit(1, days=2), hit(2, followers=100), hit(3)],
            "DePIN": [hit(1), hit(4), hit(4, days=3)],
        }
    )
    out = asyncio.run(harvest(src, {3}, now=NOW, cfg=HarvestConfig()))
    by_id = {m.user_id: (m, posts) for m, posts in out}
    assert set(by_id) == {1, 4}  # 2 too small, 3 already known
    assert by_id[1][0].narrative_id == 1 and by_id[1][1] == 3
    assert by_id[4][0].narrative_id == 5


def test_stale_hits_are_ignored_and_caps_apply() -> None:
    hits = [hit(10 + i, days=1) for i in range(5)] + [hit(99, days=30), hit(99, days=31)]
    hits += [hit(10 + i, days=2) for i in range(5)]
    src = FakeSearch({"memecoin": hits})
    out = asyncio.run(
        harvest(src, set(), now=NOW, cfg=HarvestConfig(max_new_per_narrative=3, max_new_per_run=10))
    )
    assert len(out) == 3
    assert 99 not in {m.user_id for m, _ in out}


def test_total_cap_leaves_room() -> None:
    src = FakeSearch(
        {"stablecoin": [hit(i) for i in range(1, 6)] + [hit(i, days=2) for i in range(1, 6)]}
    )
    out = asyncio.run(harvest(src, {1000, 1001}, now=NOW, cfg=HarvestConfig(max_total=4)))
    assert len(out) == 2


def test_rows_and_tiers() -> None:
    src = FakeSearch({"perp DEX": [hit(7, days=d) for d in range(1, 8)]})
    out = asyncio.run(harvest(src, set(), now=NOW, cfg=HarvestConfig()))
    kols, links = to_rows(out, NOW)
    assert kols[0]["poll_tier"] == 1 and kols[0]["active"] is True
    assert links == [{"user_id": 7, "narrative_id": 7}]
    assert poll_tier_for(3) == 2 and poll_tier_for(2) == 4
