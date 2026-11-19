"""TDD tests for nti_discovery: KOL filter, Pons V2/Uniswap parser, Radar alerts, Heatmap."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from nti_core.types import EpochStatus


def test_kol_discovery_numeric_filter_and_dedup() -> None:
    from nti_discovery.kol_discovery import KolCandidateMetrics, filter_kol_candidates

    candidates = [
        # Passes all thresholds: followers >= 5000, avg_likes >= 20, themed_posts_per_week >= 3
        KolCandidateMetrics(
            user_id=1,
            handle="alpha_zk",
            followers=12_000,
            avg_likes=45.0,
            themed_posts_per_week=5,
            narrative_id=1,
        ),
        # Fails followers (< 5000)
        KolCandidateMetrics(
            user_id=2,
            handle="small_acct",
            followers=4_999,
            avg_likes=50.0,
            themed_posts_per_week=6,
            narrative_id=1,
        ),
        # Fails avg_likes (< 20)
        KolCandidateMetrics(
            user_id=3,
            handle="low_eng",
            followers=25_000,
            avg_likes=19.5,
            themed_posts_per_week=6,
            narrative_id=2,
        ),
        # Fails themed_posts_per_week (< 3)
        KolCandidateMetrics(
            user_id=4,
            handle="quiet_kol",
            followers=50_000,
            avg_likes=100.0,
            themed_posts_per_week=2,
            narrative_id=2,
        ),
        # Already existing KOL -> excluded
        KolCandidateMetrics(
            user_id=5,
            handle="already_listed",
            followers=80_000,
            avg_likes=120.0,
            themed_posts_per_week=10,
            narrative_id=2,
        ),
        # Passes on exact boundaries
        KolCandidateMetrics(
            user_id=6,
            handle="exact_boundary",
            followers=5_000,
            avg_likes=20.0,
            themed_posts_per_week=3,
            narrative_id=3,
        ),
    ]

    queue = filter_kol_candidates(candidates, existing_user_ids={5})
    assert [c.user_id for c in queue] == [1, 6]


def test_pons_v2_and_uniswap_token_parsers() -> None:
    from nti_discovery.token_radar import parse_pons_v2_token, parse_uniswap_token

    now = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    grad = parse_pons_v2_token(
        {
            "address": "0x1111111111111111111111111111111111111111",
            "symbol": "ZKAI",
            "name": "ZK Agent",
            "phase": 2,
            "pool": "0x2222222222222222222222222222222222222222",
            "liquidity_eth": "2.5",
            "txs_7d": 42,
            "narrative_id": 2,
            "created_at": now.isoformat(),
        }
    )
    assert grad.source == "pons_v2"
    assert grad.graduated is True
    assert grad.liquidity_eth == Decimal("2.5")

    ungrad = parse_pons_v2_token(
        {
            "address": "0x3333333333333333333333333333333333333333",
            "symbol": "PRE",
            "name": "Bonding Curve",
            "phase": 1,
            "liquidity_eth": "0.4",
            "txs_7d": 5,
            "narrative_id": 9,
            "created_at": now.isoformat(),
        }
    )
    assert ungrad.graduated is False

    uni = parse_uniswap_token(
        {
            "address": "0x4444444444444444444444444444444444444444",
            "symbol": "USDR",
            "name": "RWA Dollar",
            "pool": "0x5555555555555555555555555555555555555555",
            "liquidity_eth": "15.0",
            "txs_7d": 120,
            "narrative_id": 3,
            "created_at": now.isoformat(),
        }
    )
    assert uni.source == "uniswap"
    assert uni.graduated is True


def test_velocity_alerts_trigger_only_on_final_epoch_with_1h_public_delay() -> None:
    from nti_discovery.token_radar import NarrativeVelocityInput, generate_velocity_alerts

    now = datetime(2026, 11, 19, 15, 30, tzinfo=UTC)
    inputs = [
        NarrativeVelocityInput(narrative_id=1, v_bps=6200, v_flag=None),  # qualifies
        NarrativeVelocityInput(narrative_id=2, v_bps=5000, v_flag=None),  # not > 5000
        NarrativeVelocityInput(narrative_id=3, v_bps=8000, v_flag="too_small"),  # flagged
        NarrativeVelocityInput(narrative_id=4, v_bps=None, v_flag="series_break"),
    ]

    # Must emit ZERO alerts on COMMITTED or DISPUTED (only FINAL!)
    assert (
        generate_velocity_alerts(inputs, epoch_status=EpochStatus.COMMITTED, detected_at=now) == []
    )
    assert (
        generate_velocity_alerts(inputs, epoch_status=EpochStatus.DISPUTED, detected_at=now) == []
    )

    alerts = generate_velocity_alerts(inputs, epoch_status=EpochStatus.FINAL, detected_at=now)
    assert len(alerts) == 1
    assert alerts[0].kind == "velocity"
    assert alerts[0].narrative_id == 1
    assert alerts[0].v_bps == 6200
    assert alerts[0].detected_at == now
    assert alerts[0].public_at == now + timedelta(hours=1)


def test_new_token_alerts_and_heatmap_opportunity() -> None:
    from nti_discovery.token_radar import (
        DiscoveredToken,
        compute_heatmap,
        generate_new_token_alerts,
    )

    now = datetime(2026, 11, 19, 16, 0, tzinfo=UTC)
    tokens = [
        # Active & >= 1 ETH in rising narrative 2 -> triggers alert & counts in heatmap
        DiscoveredToken(
            address="0xaaa",
            symbol="AGT",
            name="Agent",
            created_at=now,
            source="pons_v2",
            graduated=True,
            pool="0xpool1",
            liquidity_eth=Decimal("1.5"),
            narrative_id=2,
            txs_7d=25,
        ),
        # Low liquidity (< 1 ETH) -> NO alert, NOT active in heatmap
        DiscoveredToken(
            address="0xbbb",
            symbol="DUST",
            name="Dust",
            created_at=now,
            source="pons_v2",
            graduated=False,
            pool=None,
            liquidity_eth=Decimal("0.5"),
            narrative_id=2,
            txs_7d=50,
        ),
        # >= 1 ETH but low txs_7d (< 10): triggers new token alert, NOT active in heatmap
        DiscoveredToken(
            address="0xccc",
            symbol="FRESH",
            name="Fresh",
            created_at=now,
            source="uniswap",
            graduated=True,
            pool="0xpool2",
            liquidity_eth=Decimal("1.0"),
            narrative_id=2,
            txs_7d=3,
        ),
        # >= 1 ETH but narrative 9 is NOT rising -> no alert
        DiscoveredToken(
            address="0xddd",
            symbol="MEME",
            name="Meme",
            created_at=now,
            source="pons_v2",
            graduated=True,
            pool="0xpool3",
            liquidity_eth=Decimal("4.0"),
            narrative_id=9,
            txs_7d=100,
        ),
    ]

    alerts = generate_new_token_alerts(
        tokens=tokens,
        rising_narratives={2},
        detected_at=now,
    )
    assert [a.token for a in alerts] == ["0xaaa", "0xccc"]
    assert all(a.public_at == now + timedelta(hours=1) for a in alerts)

    # Heatmap: narrative 2 has 1 active token + 1 curated = 2 active; M_2=0.30 -> opp=0.15
    heatmap = compute_heatmap(
        mindshare_bps={2: 3000, 9: 1000},
        tokens=tokens,
        curated_projects_by_narrative={2: 1, 9: 0},
    )
    by_nid = {cell.narrative_id: cell for cell in heatmap}
    assert by_nid[2].active_projects_count == 2
    assert by_nid[2].opportunity == pytest.approx(Decimal("0.15"))
    assert by_nid[9].active_projects_count == 1
    assert by_nid[9].opportunity == pytest.approx(Decimal("0.10"))
