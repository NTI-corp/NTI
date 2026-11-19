"""Q2 Resilience Simulation: bot injection, capped-KOL brigading <= 100 bps, omission detection."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from eth_account import Account
from nti_core.config import load_config
from nti_core.types import KolProfile, RawPost
from nti_engine.calc import run_epoch
from nti_engine.models import (
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    PrevEpochState,
)
from nti_fetcher.adapters import InMemoryMockSource

CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "nti.v1.json"


def _build_balanced_ecosystem(boundary: int) -> tuple[list[EngineKol], list[EnginePost]]:
    """Create 150 active KOLs (15 per narrative, so N >= 11 and 10% cap is active)."""
    kols: list[EngineKol] = []
    posts: list[EnginePost] = []
    for nid in range(1, 11):
        for j in range(15):
            uid = nid * 1000 + j
            kols.append(EngineKol(user_id=uid, followers=50_000, h_k=1, r_k=Decimal("1")))
            posts.append(
                EnginePost(
                    tweet_id=uid * 100 + 1,
                    user_id=uid,
                    created_at_unix=boundary - 3600,
                    engagements=(
                        EngagementSnapshot(
                            likes=200,
                            reposts=40,
                            quotes=10,
                            replies=20,
                            fetched_at_unix=boundary - 60,
                        ),
                    ),
                    q={nid: Decimal("1.0")},
                )
            )
    return kols, posts


def test_q2_bot_swarm_injection_h_k_zero_shifts_index_by_0_bps() -> None:
    from nti_oracle.node import max_vector_delta_bps

    cfg = load_config(CONFIG_PATH)
    boundary = 1_760_000_000
    kols, posts = _build_balanced_ecosystem(boundary)
    prev_state = PrevEpochState(
        series_id=1,
        prev_i_bps={nid: 1000 for nid in cfg.narratives},
        lag_i_bps={nid: 1000 for nid in cfg.narratives},
    )

    baseline = run_epoch(
        EpochDataset(
            epoch_id=200, boundary_unix=boundary, series_id=1, posts=tuple(posts), kols=tuple(kols)
        ),
        prev_state,
        cfg,
    )

    # Inject 50 bot accounts (h_k=0) posting hyper-viral content (1M likes/reposts) for narrative 1
    bot_kols = [EngineKol(user_id=900_000 + i, followers=5_000_000, h_k=0) for i in range(50)]
    bot_posts = [
        EnginePost(
            tweet_id=9_000_000 + i,
            user_id=900_000 + i,
            created_at_unix=boundary - 600,
            engagements=(
                EngagementSnapshot(
                    likes=1_000_000,
                    reposts=500_000,
                    quotes=100_000,
                    replies=250_000,
                    fetched_at_unix=boundary - 60,
                ),
            ),
            q={1: Decimal("1.0")},
        )
        for i in range(50)
    ]

    attacked = run_epoch(
        EpochDataset(
            epoch_id=200,
            boundary_unix=boundary,
            series_id=1,
            posts=tuple(posts + bot_posts),
            kols=tuple(kols + bot_kols),
        ),
        prev_state,
        cfg,
    )
    delta = max_vector_delta_bps(attacked.i_vector, baseline.i_vector)
    assert delta == 0
    assert delta <= 100


def test_q2_single_capped_kol_viral_injection_shifts_index_at_most_100_bps() -> None:
    from nti_oracle.node import max_vector_delta_bps

    cfg = load_config(CONFIG_PATH)
    boundary = 1_760_000_000
    kols, posts = _build_balanced_ecosystem(boundary)
    prev_state = PrevEpochState(
        series_id=1,
        prev_i_bps={nid: 1000 for nid in cfg.narratives},
        lag_i_bps={nid: 1000 for nid in cfg.narratives},
    )

    baseline = run_epoch(
        EpochDataset(
            epoch_id=200, boundary_unix=boundary, series_id=1, posts=tuple(posts), kols=tuple(kols)
        ),
        prev_state,
        cfg,
    )

    # Single legitimate KOL (uid=1000 in narrative 1) floods 20 mega-viral synthetic posts
    attacker_uid = 1000
    viral_posts = [
        EnginePost(
            tweet_id=8_000_000 + i,
            user_id=attacker_uid,
            created_at_unix=boundary - 300,
            engagements=(
                EngagementSnapshot(
                    likes=5_000_000,
                    reposts=2_000_000,
                    quotes=500_000,
                    replies=1_000_000,
                    fetched_at_unix=boundary - 30,
                ),
            ),
            q={1: Decimal("1.0")},
        )
        for i in range(20)
    ]

    attacked = run_epoch(
        EpochDataset(
            epoch_id=200,
            boundary_unix=boundary,
            series_id=1,
            posts=tuple(posts + viral_posts),
            kols=tuple(kols),
        ),
        prev_state,
        cfg,
    )
    delta = max_vector_delta_bps(attacked.i_vector, baseline.i_vector)
    # 10% KOL truncation cap + EMA (alpha=0.3) bounds any single KOL viral attack well below 100 bps
    assert delta <= 100


@pytest.mark.asyncio
async def test_q2_operator_post_omission_rejected_by_validator() -> None:
    from nti_oracle.dataset import ZERO_HASH, build_delta_dataset
    from nti_oracle.node import ValidatorNode
    from nti_oracle.omission import select_omission_sample

    cfg = load_config(CONFIG_PATH)
    boundary = 1_760_000_000
    boundary_dt = datetime.fromtimestamp(boundary, tz=UTC)
    kols, posts = _build_balanced_ecosystem(boundary)
    kol_profiles = [
        KolProfile(user_id=k.user_id, handle=f"kol_{k.user_id}", followers=k.followers)
        for k in kols
    ]

    # Validator's independent source observes ALL posts (plus extra posts per KOL)
    timelines: dict[int, list[RawPost]] = {}
    for p in posts:
        timelines.setdefault(p.user_id, []).append(
            RawPost(
                tweet_id=p.tweet_id,
                user_id=p.user_id,
                handle=f"kol_{p.user_id}",
                created_at=datetime.fromtimestamp(p.created_at_unix, tz=UTC),
                text="legit post",
                likes=200,
                reposts=40,
                quotes=10,
                replies=20,
                fetched_at=boundary_dt - timedelta(minutes=1),
            )
        )

    # Malicious operator omits posts of 3 sampled KOLs (>5% of sampled posts)
    sample = select_omission_sample(kol_profiles, ZERO_HASH, epoch_id=201, sample_fraction=0.10)
    omitted_uids = {k.user_id for k in sample[:3]}
    censored_posts = [p for p in posts if p.user_id not in omitted_uids]

    delta = build_delta_dataset(
        epoch_id=201,
        boundary_unix=boundary,
        series_id=1,
        config_hash=cfg.config_hash(),
        kols=kols,
        posts=censored_posts,
        prev_dataset_hash=ZERO_HASH,
        prev_arweave_tx="",
    )
    prev_state = PrevEpochState(series_id=1, prev_i_bps=None, lag_i_bps=None)
    op_result = run_epoch(
        EpochDataset(
            epoch_id=201,
            boundary_unix=boundary,
            series_id=1,
            posts=tuple(censored_posts),
            kols=tuple(kols),
        ),
        prev_state,
        cfg,
    )

    val_acct = Account.create()
    validator = ValidatorNode(
        private_key=val_acct.key.hex(),
        cfg=cfg,
        chain_id=46630,
        verifying_contract="0x3333333333333333333333333333333333333333",
        validator_source=InMemoryMockSource(name="val_pool", timelines=timelines),
    )

    decision = await validator.verify_and_sign(
        delta_blob=delta.gzipped,
        expected_dataset_hash=delta.chain_hash,
        prev_deltas=[],
        prev_state=prev_state,
        operator_i_vector=op_result.i_vector,
        kol_profiles=kol_profiles,
        prev_commit_hash=ZERO_HASH,
    )
    assert decision.approved is False
    assert decision.attestation is None
    assert decision.overlap < 0.95
    assert "omission" in (decision.reason or "").lower()
