"""Unit, golden-fixture, and Hypothesis property tests for the pure NTI index engine (D5)."""

from __future__ import annotations

import json
import random
from decimal import Decimal
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st
from nti_engine import (
    ENGINE_CONTEXT,
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    PrevEpochState,
    apply_cap,
    compute_a_max,
    ema,
    kol_authority,
    mindshare,
    post_score,
    run_epoch,
    select_engagement,
    to_bps_hamilton,
    velocity,
)

from nti_core import load_config

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_V1 = load_config(REPO_ROOT / "config" / "nti.v1.json")
FIXTURES_PATH = REPO_ROOT / "data" / "fixtures" / "engine_golden.json"


def test_post_score_matches_exact_decay_and_ln() -> None:
    # age = 48h == half_life => decay == 0.5 exactly
    # engagement = 1 + 10 + 2*5 + 3*2 + 4 = 31 -> ln(31)
    score = post_score(
        a_k=Decimal("4"),
        likes=10,
        reposts=5,
        quotes=2,
        replies=4,
        age_hours=Decimal("48"),
        half_life_hours=48,
    )
    expected = ENGINE_CONTEXT.multiply(
        ENGINE_CONTEXT.multiply(Decimal("4"), ENGINE_CONTEXT.ln(Decimal("31"))),
        Decimal("0.5"),
    )
    assert abs(score - expected) < Decimal("1e-35")


def test_kol_authority_bot_filter_and_a_max_cap() -> None:
    a_max = compute_a_max([100, 1000, 10_000, 100_000, 1_000_000])
    assert kol_authority(100_000, Decimal("1"), 0, a_max) == Decimal("0")
    capped = kol_authority(100_000_000, Decimal("1"), 1, a_max)
    assert capped == a_max


def test_select_engagement_24h_tie_breaker_and_no_future_leak() -> None:
    created = 1_700_000_000
    boundary = created + 36 * 3600  # post is 36h old at boundary
    r_22h = EngagementSnapshot(10, 0, 0, 0, created + 22 * 3600)
    r_26h = EngagementSnapshot(25, 0, 0, 0, created + 26 * 3600)
    r_future = EngagementSnapshot(999, 0, 0, 0, boundary + 60)

    # Tie (2h away on both sides): prefer >= 24h reading
    chosen = select_engagement([r_22h, r_26h, r_future], created, boundary, target_hours=24)
    assert chosen == r_26h

    # Post younger than 24h: pick latest reading <= boundary
    young_boundary = created + 10 * 3600
    r_4h = EngagementSnapshot(3, 0, 0, 0, created + 4 * 3600)
    r_8h = EngagementSnapshot(9, 0, 0, 0, created + 8 * 3600)
    chosen_young = select_engagement([r_4h, r_8h, r_22h], created, young_boundary, target_hours=24)
    assert chosen_young == r_8h


def test_apply_cap_dominant_kol_n_ge_11_truncates_to_10_pct() -> None:
    # 1 dominant KOL (1000) + 10 normal KOLs (10 each) => N=11, cap=10%
    # Fixed point: c_dom = (0.10 / 0.90) * 100 = 11.1111...; total = 111.1111...
    scores = {1: Decimal("1000"), **{i: Decimal("10") for i in range(2, 12)}}
    capped_scores, capped_ids = apply_cap(scores, set(scores.keys()), Decimal("0.10"))
    total = sum(capped_scores.values(), Decimal("0"))
    assert 1 in capped_ids
    assert capped_scores[1] / total <= Decimal("0.10") + Decimal("1e-11")
    # S_n must actually shrink (truncation, NOT redistribution)
    assert total < Decimal("120")


def test_apply_cap_small_active_n_le_10_does_not_collapse_to_min() -> None:
    # Regression test for the N <= 10 truncation collapse bug:
    # N = 5 with [100, 80, 60, 40, 0.01]. With cap_eff = 1.5 / 5 = 0.30,
    # KOLs must NOT collapse down to 0.01!
    scores = {
        1: Decimal("100"),
        2: Decimal("80"),
        3: Decimal("60"),
        4: Decimal("40"),
        5: Decimal("0.01"),
    }
    capped_scores, _ = apply_cap(scores, set(scores.keys()), Decimal("0.10"))
    assert capped_scores[2] > Decimal("50")
    assert capped_scores[3] == Decimal("60")
    assert capped_scores[4] == Decimal("40")
    total = sum(capped_scores.values(), Decimal("0"))
    assert max(capped_scores.values()) / total <= Decimal("0.30") + Decimal("1e-11")


def test_hamilton_rounding_exact_sum_and_tie_breaker() -> None:
    ids = (1, 2, 3)
    third = Decimal("1") / Decimal("3")
    shares = {1: third, 2: third, 3: third}
    bps = to_bps_hamilton(shares, ids)
    assert sum(bps.values()) == 10_000
    # Tie-breaker: lowest narrative_id gets the extra 1 bp
    assert bps == {1: 3334, 2: 3333, 3: 3333}


def test_velocity_flags_precedence() -> None:
    assert velocity(3000, 2000, Decimal("50"), True, False, CONFIG_V1) == (None, "series_break")
    assert velocity(3000, 2000, Decimal("50"), False, True, CONFIG_V1) == (None, "incomplete_gap")
    assert velocity(3000, 199, Decimal("50"), False, False, CONFIG_V1) == (None, "too_small")
    assert velocity(3000, 2000, Decimal("29.9"), False, False, CONFIG_V1) == (None, "too_small")
    assert velocity(3000, 2000, Decimal("30"), False, False, CONFIG_V1) == (5000, None)


def test_run_epoch_empty_dataset_marks_incomplete() -> None:
    ds = EpochDataset(
        epoch_id=100,
        boundary_unix=100 * 14400,
        series_id=1,
        posts=(),
        kols=(),
    )
    res = run_epoch(ds, PrevEpochState(series_id=1, prev_i_bps=None, lag_i_bps=None), CONFIG_V1)
    assert res.incomplete is True


def test_golden_fixtures_match_exact_bps() -> None:
    assert FIXTURES_PATH.exists(), f"Missing golden fixtures at {FIXTURES_PATH}"
    fixtures = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    assert len(fixtures) >= 4
    for case in fixtures:
        ds = EpochDataset(
            epoch_id=case["dataset"]["epoch_id"],
            boundary_unix=case["dataset"]["boundary_unix"],
            series_id=case["dataset"]["series_id"],
            a_max=Decimal(case["dataset"]["a_max"]) if case["dataset"].get("a_max") else None,
            kols=tuple(
                EngineKol(
                    user_id=k["user_id"],
                    followers=k["followers"],
                    h_k=k.get("h_k", 1),
                    r_k=Decimal(str(k.get("r_k", "1"))),
                )
                for k in case["dataset"]["kols"]
            ),
            posts=tuple(
                EnginePost(
                    tweet_id=p["tweet_id"],
                    user_id=p["user_id"],
                    created_at_unix=p["created_at_unix"],
                    engagements=tuple(
                        EngagementSnapshot(**e) for e in p["engagements"]
                    ),
                    q={int(nid): Decimal(str(val)) for nid, val in p["q"].items()},
                )
                for p in case["dataset"]["posts"]
            ),
        )
        prev = PrevEpochState(
            series_id=case["prev_state"]["series_id"],
            prev_i_bps=(
                {int(k): v for k, v in case["prev_state"]["prev_i_bps"].items()}
                if case["prev_state"].get("prev_i_bps") is not None
                else None
            ),
            lag_i_bps=(
                {int(k): v for k, v in case["prev_state"]["lag_i_bps"].items()}
                if case["prev_state"].get("lag_i_bps") is not None
                else None
            ),
            has_incomplete_gap=case["prev_state"].get("has_incomplete_gap", False),
        )
        res = run_epoch(ds, prev, CONFIG_V1)
        assert res.incomplete == case["expected"]["incomplete"], case["name"]
        assert list(res.i_vector) == case["expected"]["i_vector"], case["name"]
        assert list(res.v_vector) == case["expected"]["v_vector"], case["name"]
        if "v_flags" in case["expected"]:
            assert [n.v_flag for n in res.narratives] == case["expected"]["v_flags"], case["name"]


@settings(max_examples=40, deadline=None)
@given(
    weights=st.lists(
        st.integers(min_value=0, max_value=10_000),
        min_size=10,
        max_size=10,
    ).filter(lambda xs: sum(xs) > 0)
)
def test_property_mindshare_and_ema_always_sum_to_10000_bps(weights: list[int]) -> None:
    ids = CONFIG_V1.narratives
    s_map = {n: Decimal(w) for n, w in zip(ids, weights, strict=True)}
    m = mindshare(s_map, ids)
    m_bps = to_bps_hamilton(m, ids)
    assert sum(m_bps.values()) == 10_000
    assert all(0 <= v <= 10_000 for v in m_bps.values())

    prev_i = {n: 1000 for n in ids}
    _, i_bps = ema(prev_i, m, CONFIG_V1.alpha, ids)
    assert sum(i_bps.values()) == 10_000
    assert all(0 <= v <= 10_000 for v in i_bps.values())


def test_permutation_invariance_shuffled_inputs_identical_output() -> None:
    boundary = 200 * 14400
    kols = [EngineKol(user_id=i, followers=10_000 * i) for i in range(1, 15)]
    posts = [
        EnginePost(
            tweet_id=1000 + i,
            user_id=(i % 14) + 1,
            created_at_unix=boundary - (i * 1800),
            engagements=(EngagementSnapshot(10 * i, i, i % 3, 2, boundary - 600),),
            q={((i % 10) + 1): Decimal("0.8"), (((i + 3) % 10) + 1): Decimal("0.2")},
        )
        for i in range(1, 40)
    ]
    prev = PrevEpochState(
        series_id=1,
        prev_i_bps={n: 1000 for n in CONFIG_V1.narratives},
        lag_i_bps=None,
    )
    ds1 = EpochDataset(200, boundary, 1, tuple(posts), tuple(kols))

    rng = random.Random(42)
    posts_shuf = list(posts)
    kols_shuf = list(kols)
    rng.shuffle(posts_shuf)
    rng.shuffle(kols_shuf)
    ds2 = EpochDataset(200, boundary, 1, tuple(posts_shuf), tuple(kols_shuf))

    r1 = run_epoch(ds1, prev, CONFIG_V1)
    r2 = run_epoch(ds2, prev, CONFIG_V1)
    assert r1 == r2
