"""Pure deterministic mindshare index calculations using 40-digit Decimal arithmetic.

No network I/O, no wall-clock calls, no randomness, and no IEEE-754 float math.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import ROUND_FLOOR, ROUND_HALF_EVEN, Context, Decimal

from nti_core.config import NTIConfig

from nti_engine.models import (
    EngagementSnapshot,
    EpochDataset,
    EpochResult,
    KolContribution,
    NarrativeResult,
    PrevEpochState,
)

ENGINE_PRECISION = 40
ENGINE_VERSION = "nti-decimal40-drs-observation-v2"
ENGINE_CONTEXT = Context(prec=ENGINE_PRECISION, rounding=ROUND_HALF_EVEN)

ZERO = Decimal("0")
ONE = Decimal("1")
TWO = Decimal("2")
THREE = Decimal("3")
TEN_THOUSAND = Decimal("10000")
SECONDS_PER_HOUR = Decimal("3600")


def _ln(x: Decimal) -> Decimal:
    return ENGINE_CONTEXT.ln(x)


def _exp(x: Decimal) -> Decimal:
    return ENGINE_CONTEXT.exp(x)


def compute_a_max(followers: Sequence[int]) -> Decimal:
    """Compute the 90th percentile of ln(1 + F) across KOLs via linear interpolation."""
    if not followers:
        return ZERO
    logs = sorted(_ln(ONE + Decimal(max(0, f))) for f in followers)
    n = len(logs)
    if n == 1:
        return logs[0]
    pos = ENGINE_CONTEXT.multiply(Decimal(n - 1), Decimal("0.9"))
    lo = int(pos.to_integral_value(rounding=ROUND_FLOOR))
    hi = min(lo + 1, n - 1)
    frac = ENGINE_CONTEXT.subtract(pos, Decimal(lo))
    diff = ENGINE_CONTEXT.subtract(logs[hi], logs[lo])
    return ENGINE_CONTEXT.add(logs[lo], ENGINE_CONTEXT.multiply(diff, frac))


def kol_authority(followers: int, r_k: Decimal, h_k: int, a_max: Decimal) -> Decimal:
    """A_k = min(ln(1 + F_k) * R_k * H_k, A_max)."""
    if h_k <= 0 or followers < 0 or r_k <= ZERO or a_max <= ZERO:
        return ZERO
    raw = ENGINE_CONTEXT.multiply(
        ENGINE_CONTEXT.multiply(_ln(ONE + Decimal(followers)), r_k),
        Decimal(h_k),
    )
    return raw if raw <= a_max else a_max


def select_engagement(
    readings: Sequence[EngagementSnapshot],
    created_at_unix: int,
    boundary_unix: int,
    target_hours: int = 24,
) -> EngagementSnapshot | None:
    """Select engagement reading closest to 24h post age without reading past boundary_unix.

    - Readings with fetched_at_unix > boundary_unix or < created_at_unix are ignored.
    - If post age at boundary is < target_hours, select the latest reading (max fetched_at_unix).
    - If post age at boundary is >= target_hours, pick reading closest to target_hours;
      on a tie, prefer age >= target_hours, then earliest fetched_at_unix.
    """
    valid = [r for r in readings if created_at_unix <= r.fetched_at_unix <= boundary_unix]
    if not valid:
        return None

    target_sec = target_hours * 3600
    post_age_sec = boundary_unix - created_at_unix
    if post_age_sec < target_sec:
        return max(valid, key=lambda r: r.fetched_at_unix)

    def _key(r: EngagementSnapshot) -> tuple[int, int, int]:
        age_sec = r.fetched_at_unix - created_at_unix
        dist = abs(age_sec - target_sec)
        prefer_gte = 0 if age_sec >= target_sec else 1
        return (dist, prefer_gte, r.fetched_at_unix)

    return min(valid, key=_key)


def post_score(
    a_k: Decimal,
    likes: int,
    reposts: int,
    quotes: int,
    replies: int,
    age_hours: Decimal,
    half_life_hours: int,
) -> Decimal:
    """P_i = A_k * ln(1 + likes + 2*reposts + 3*quotes + replies) * exp(-ln(2)/half_life * dt)."""
    if a_k <= ZERO or age_hours < ZERO:
        return ZERO
    eng_raw = (
        ONE
        + Decimal(likes)
        + TWO * Decimal(reposts)
        + THREE * Decimal(quotes)
        + Decimal(replies)
    )
    if eng_raw <= ONE:
        return ZERO
    e_i = _ln(eng_raw)
    lam = ENGINE_CONTEXT.divide(_ln(TWO), Decimal(half_life_hours))
    decay = _exp(ENGINE_CONTEXT.multiply(ENGINE_CONTEXT.minus(lam), age_hours))
    return ENGINE_CONTEXT.multiply(ENGINE_CONTEXT.multiply(a_k, e_i), decay)


def diminishing_return_sum(
    scores: Sequence[Decimal],
    full_weight_posts: int = 3,
) -> Decimal:
    """Aggregate one KOL's per-narrative post scores with anti-spam diminishing returns.

    Posts are ordered descending so the result is 100% permutation-invariant:
    - Top ``full_weight_posts`` (default 3) receive full 1.0x weight.
    - Post rank k > full_weight_posts receives ``1 / sqrt(k - full_weight_posts + 1)``
      in 40-digit Decimal arithmetic, curbing thread/shill spam without hurting normal KOLs.
    """
    positives = sorted((s for s in scores if s > ZERO), reverse=True)
    if not positives:
        return ZERO
    total = ZERO
    for idx, val in enumerate(positives, start=1):
        if idx <= full_weight_posts:
            total = ENGINE_CONTEXT.add(total, val)
        else:
            denom = ENGINE_CONTEXT.sqrt(Decimal(idx - full_weight_posts + 1))
            weighted = ENGINE_CONTEXT.divide(val, denom)
            total = ENGINE_CONTEXT.add(total, weighted)
    return total


def apply_cap(
    kol_scores: dict[int, Decimal],
    active_kol_ids: set[int],
    kol_cap: Decimal,
    max_iters: int = 50,
    tol: Decimal = Decimal("1e-12"),
) -> tuple[dict[int, Decimal], set[int]]:
    """Iterative truncation cap per KOL for a single narrative.

    - Uses truncation (not redistribution) so a single dominant KOL cannot inflate S_n.
    - When active KOL count N >= 11, cap_eff = kol_cap (0.10).
    - When 1 <= N <= 10, cap_eff = min(1, 1.5 / N) so N * cap_eff > 1 and fixed points
      never collapse all KOLs to min(c_k).
    """
    ordered_ids = sorted(kol_scores.keys())
    cur = {uid: kol_scores[uid] for uid in ordered_ids if kol_scores[uid] > ZERO}
    if not cur:
        return {}, set()

    n_active = len(active_kol_ids)
    if n_active <= 1:
        return cur, set()

    if n_active >= 11:
        cap_eff = kol_cap
    else:
        ratio = ENGINE_CONTEXT.divide(Decimal("1.5"), Decimal(n_active))
        cap_eff = ONE if ratio > ONE else ratio

    if cap_eff >= ONE:
        return cur, set()

    capped_ids: set[int] = set()
    cur_ids = sorted(cur.keys())
    for _ in range(max_iters):
        total = ZERO
        for uid in cur_ids:
            total = ENGINE_CONTEXT.add(total, cur[uid])
        if total <= ZERO:
            break
        limit = ENGINE_CONTEXT.multiply(cap_eff, total)
        max_delta = ZERO
        next_cur: dict[int, Decimal] = {}
        for uid in cur_ids:
            val = cur[uid]
            if val > limit:
                delta = ENGINE_CONTEXT.subtract(val, limit)
                if delta > max_delta:
                    max_delta = delta
                next_cur[uid] = limit
                capped_ids.add(uid)
            else:
                next_cur[uid] = val
        cur = next_cur
        if max_delta < tol:
            break

    return cur, capped_ids


def mindshare(
    s_by_narrative: dict[int, Decimal],
    narrative_ids: Sequence[int],
) -> dict[int, Decimal]:
    """M_n = S_n / sum_m S_m across ordered narrative_ids."""
    ordered = sorted(narrative_ids)
    total = ZERO
    for nid in ordered:
        total = ENGINE_CONTEXT.add(total, s_by_narrative.get(nid, ZERO))
    if total <= ZERO:
        return {nid: ZERO for nid in ordered}
    return {
        nid: ENGINE_CONTEXT.divide(s_by_narrative.get(nid, ZERO), total)
        for nid in ordered
    }


def to_bps_hamilton(
    shares: dict[int, Decimal],
    narrative_ids: Sequence[int],
    total_bps: int = 10_000,
) -> dict[int, int]:
    """Largest Remainder Method (Hamilton) rounding so sum(bps) == total_bps exactly.

    Tie-breaker: ascending narrative_id.
    """
    ordered = sorted(narrative_ids)
    total_share = ZERO
    for nid in ordered:
        total_share = ENGINE_CONTEXT.add(total_share, shares.get(nid, ZERO))
    if total_share <= ZERO:
        return {nid: 0 for nid in ordered}

    scale = Decimal(total_bps)
    floors: dict[int, int] = {}
    remainders: list[tuple[Decimal, int]] = []
    floor_sum = 0

    for nid in ordered:
        exact = ENGINE_CONTEXT.multiply(shares.get(nid, ZERO), scale)
        fl = int(exact.to_integral_value(rounding=ROUND_FLOOR))
        rem = ENGINE_CONTEXT.subtract(exact, Decimal(fl))
        floors[nid] = fl
        floor_sum += fl
        remainders.append((rem, nid))

    leftover = total_bps - floor_sum
    if leftover > 0:
        remainders.sort(key=lambda item: (-item[0], item[1]))
        for i in range(leftover):
            floors[remainders[i][1]] += 1
    elif leftover < 0:
        remainders.sort(key=lambda item: (item[0], -item[1]))
        for i in range(-leftover):
            floors[remainders[i][1]] -= 1

    return floors


def ema(
    prev_i_bps: dict[int, int] | None,
    m_shares: dict[int, Decimal],
    alpha: Decimal,
    narrative_ids: Sequence[int],
) -> tuple[dict[int, Decimal], dict[int, int]]:
    """I_n(t) = alpha * M_n(t) + (1 - alpha) * prev_I_n, with prev_I = prev_i_bps / 10000."""
    ordered = sorted(narrative_ids)
    if prev_i_bps is None:
        i_dec = {nid: m_shares.get(nid, ZERO) for nid in ordered}
        return i_dec, to_bps_hamilton(i_dec, ordered)

    one_minus_alpha = ENGINE_CONTEXT.subtract(ONE, alpha)
    i_dec: dict[int, Decimal] = {}
    for nid in ordered:
        prev_val = ENGINE_CONTEXT.divide(Decimal(prev_i_bps.get(nid, 0)), TEN_THOUSAND)
        cur_val = ENGINE_CONTEXT.add(
            ENGINE_CONTEXT.multiply(alpha, m_shares.get(nid, ZERO)),
            ENGINE_CONTEXT.multiply(one_minus_alpha, prev_val),
        )
        i_dec[nid] = cur_val
    return i_dec, to_bps_hamilton(i_dec, ordered)


def velocity(
    i_now_bps: int,
    i_lag_bps: int | None,
    weighted_posts: Decimal,
    series_broken: bool,
    has_incomplete_gap: bool,
    cfg: NTIConfig,
) -> tuple[int | None, str | None]:
    """24h mindshare velocity in signed basis points with explicit suppression flags."""
    if series_broken:
        return None, "series_break"
    if has_incomplete_gap or i_lag_bps is None:
        return None, "incomplete_gap"
    if i_lag_bps < cfg.v_min_index_bps or weighted_posts < Decimal(cfg.v_min_weighted_posts):
        return None, "too_small"

    diff = Decimal(i_now_bps - i_lag_bps)
    ratio = ENGINE_CONTEXT.divide(diff, Decimal(i_lag_bps))
    v_dec = ENGINE_CONTEXT.multiply(ratio, TEN_THOUSAND)
    return int(v_dec.to_integral_value(rounding=ROUND_HALF_EVEN)), None


def run_epoch(
    dataset: EpochDataset,
    prev_state: PrevEpochState,
    cfg: NTIConfig,
) -> EpochResult:
    """Execute one complete deterministic epoch computation."""
    narrative_ids = tuple(sorted(cfg.narratives))
    observation_cutoff = dataset.observation_cutoff_unix or dataset.boundary_unix
    if observation_cutoff < dataset.boundary_unix:
        raise ValueError("Observation cutoff must not precede the post boundary")
    if observation_cutoff > dataset.boundary_unix + cfg.epoch_seconds:
        raise ValueError("Observation cutoff must remain within the epoch")
    kol_map = {k.user_id: k for k in sorted(dataset.kols, key=lambda k: k.user_id)}
    a_max = (
        dataset.a_max
        if dataset.a_max is not None
        else compute_a_max([k.followers for k in kol_map.values()])
    )
    authorities = {
        uid: kol_authority(k.followers, k.r_k, k.h_k, a_max)
        for uid, k in kol_map.items()
    }

    lookback_sec = cfg.lookback_hours * 3600
    vel_window_sec = 24 * 3600

    # (narrative_id -> {user_id -> [P_i * q_in, ...]})
    raw_post_contribs: dict[int, dict[int, list[Decimal]]] = {nid: {} for nid in narrative_ids}
    active_kols: dict[int, set[int]] = {nid: set() for nid in narrative_ids}
    weighted_posts: dict[int, Decimal] = {nid: ZERO for nid in narrative_ids}

    for post in sorted(dataset.posts, key=lambda p: p.tweet_id):
        if post.created_at_unix > dataset.boundary_unix:
            continue
        age_sec = dataset.boundary_unix - post.created_at_unix
        if age_sec > lookback_sec:
            continue
        kol = kol_map.get(post.user_id)
        if kol is None:
            continue

        snap = select_engagement(
            post.engagements,
            post.created_at_unix,
            observation_cutoff,
            target_hours=cfg.engagement_reread_hours,
        )
        if snap is None:
            continue

        age_hours = ENGINE_CONTEXT.divide(Decimal(age_sec), SECONDS_PER_HOUR)
        p_i = post_score(
            a_k=authorities[kol.user_id],
            likes=snap.likes,
            reposts=snap.reposts,
            quotes=snap.quotes,
            replies=snap.replies,
            age_hours=age_hours,
            half_life_hours=cfg.half_life_hours,
        )

        for nid in narrative_ids:
            q_val = post.q.get(nid, ZERO)
            if q_val <= ZERO:
                continue
            if age_sec <= vel_window_sec and kol.h_k == 1:
                weighted_posts[nid] = ENGINE_CONTEXT.add(weighted_posts[nid], q_val)
            if p_i <= ZERO:
                continue
            contrib_i = ENGINE_CONTEXT.multiply(p_i, q_val)
            raw_post_contribs[nid].setdefault(kol.user_id, []).append(contrib_i)
            if q_val >= cfg.kol_active_min_q:
                active_kols[nid].add(kol.user_id)

    raw_contrib: dict[int, dict[int, Decimal]] = {
        nid: {
            uid: diminishing_return_sum(contribs)
            for uid, contribs in sorted(user_map.items())
        }
        for nid, user_map in raw_post_contribs.items()
    }

    s_by_narrative: dict[int, Decimal] = {}
    capped_by_narrative: dict[int, tuple[dict[int, Decimal], set[int]]] = {}
    total_s = ZERO
    for nid in narrative_ids:
        capped_scores, capped_ids = apply_cap(
            raw_contrib[nid],
            active_kols[nid],
            cfg.kol_cap,
        )
        capped_by_narrative[nid] = (capped_scores, capped_ids)
        s_n = ZERO
        for uid in sorted(capped_scores.keys()):
            s_n = ENGINE_CONTEXT.add(s_n, capped_scores[uid])
        s_by_narrative[nid] = s_n
        total_s = ENGINE_CONTEXT.add(total_s, s_n)

    config_hash = cfg.config_hash()
    if total_s <= ZERO:
        empty_narratives = tuple(
            NarrativeResult(
                narrative_id=nid,
                s_n=ZERO,
                m_bps=0,
                i_bps=0,
                v_bps=None,
                v_flag="incomplete_gap",
                weighted_posts=weighted_posts[nid],
                contributors=(),
            )
            for nid in narrative_ids
        )
        return EpochResult(
            epoch_id=dataset.epoch_id,
            series_id=dataset.series_id,
            incomplete=True,
            narratives=empty_narratives,
            i_vector=tuple(0 for _ in narrative_ids),
            v_vector=tuple(None for _ in narrative_ids),
            config_hash=config_hash,
        )

    m_shares = mindshare(s_by_narrative, narrative_ids)
    m_bps_map = to_bps_hamilton(m_shares, narrative_ids)

    series_broken = prev_state.series_id != dataset.series_id
    effective_prev_i = None if series_broken else prev_state.prev_i_bps
    _, i_bps_map = ema(effective_prev_i, m_shares, cfg.alpha, narrative_ids)

    results: list[NarrativeResult] = []
    for nid in narrative_ids:
        capped_scores, capped_ids = capped_by_narrative[nid]
        s_n = s_by_narrative[nid]
        contributors: list[KolContribution] = []
        if s_n > ZERO and capped_scores:
            kol_shares = {
                uid: ENGINE_CONTEXT.divide(score, s_n)
                for uid, score in capped_scores.items()
            }
            kol_bps = to_bps_hamilton(kol_shares, list(capped_scores.keys()))
            contributors = [
                KolContribution(
                    user_id=uid,
                    share_bps=kol_bps[uid],
                    capped=(uid in capped_ids),
                )
                for uid in sorted(capped_scores.keys(), key=lambda u: (-kol_bps[u], u))
            ]

        lag_i = None if prev_state.lag_i_bps is None else prev_state.lag_i_bps.get(nid)
        v_bps, v_flag = velocity(
            i_now_bps=i_bps_map[nid],
            i_lag_bps=lag_i,
            weighted_posts=weighted_posts[nid],
            series_broken=series_broken,
            has_incomplete_gap=prev_state.has_incomplete_gap,
            cfg=cfg,
        )
        results.append(
            NarrativeResult(
                narrative_id=nid,
                s_n=s_n,
                m_bps=m_bps_map[nid],
                i_bps=i_bps_map[nid],
                v_bps=v_bps,
                v_flag=v_flag,
                weighted_posts=weighted_posts[nid],
                contributors=tuple(contributors),
            )
        )

    return EpochResult(
        epoch_id=dataset.epoch_id,
        series_id=dataset.series_id,
        incomplete=False,
        narratives=tuple(results),
        i_vector=tuple(r.i_bps for r in results),
        v_vector=tuple(r.v_bps for r in results),
        config_hash=config_hash,
    )
