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


class FakeStorage:
    def __init__(self, cycles=(), kols=(), posts=()):
        self.tables = {"fetch_cycles": list(cycles), "kols": list(kols), "posts": list(posts)}
        self.patches: list[tuple[dict, dict]] = []
        self.upserts: list[tuple[str, list]] = []

    async def select(self, table, **kw):
        return list(self.tables.get(table, []))[: kw.get("limit") or None]

    async def upsert(self, table, rows, on_conflict=None):
        self.upserts.append((table, rows))

    async def patch(self, table, filters, values):
        self.patches.append((filters, values))


def test_adaptive_budget_follows_failure_ratio() -> None:
    from nti_discovery.kol_maintain import adaptive_budget

    def b(ok, failed):
        s = FakeStorage(cycles=[{"accounts_ok": ok, "accounts_failed": failed}])
        return asyncio.run(adaptive_budget(s, 150))[0]

    assert b(95, 5) == 150
    assert b(80, 20) == 50
    assert b(50, 50) == 0
    assert asyncio.run(adaptive_budget(FakeStorage(), 150))[0] == 50


def test_refresh_profiles_updates_and_deactivates() -> None:
    from nti_discovery.kol_maintain import refresh_profiles

    class Src:
        async def profile(self, uid):
            if uid == 2:
                return None
            if uid == 3:
                raise RuntimeError("rate limited")
            return ("new_handle", 9000)

    st = FakeStorage(kols=[{"user_id": i, "handle": f"h{i}"} for i in (1, 2, 3)])
    rep = asyncio.run(refresh_profiles(st, Src(), NOW))
    assert rep == {"refreshed": 1, "deactivated": 1, "failed": 1}
    assert any(v == {"active": False} for _, v in st.patches)


def test_retier_uses_real_post_counts() -> None:
    from nti_discovery.kol_maintain import retier

    st = FakeStorage(
        kols=[{"user_id": 1, "poll_tier": 4}, {"user_id": 2, "poll_tier": 1}],
        posts=[{"user_id": 1}] * 7,
    )
    assert asyncio.run(retier(st, NOW)) == 1
    assert st.patches[0][1] == {"poll_tier": 1}
