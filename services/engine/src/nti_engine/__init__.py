"""Pure deterministic mindshare index engine (D5).

Invariant: no network, no wall-clock time, no randomness, no float math.
All computations use decimal.Decimal with precision=40 and ROUND_HALF_EVEN.
"""

from nti_engine.calc import (
    ENGINE_CONTEXT,
    ENGINE_PRECISION,
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
from nti_engine.models import (
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    EpochResult,
    KolContribution,
    NarrativeResult,
    PrevEpochState,
)

__all__ = [
    "ENGINE_CONTEXT",
    "ENGINE_PRECISION",
    "EngagementSnapshot",
    "EngineKol",
    "EnginePost",
    "EpochDataset",
    "EpochResult",
    "KolContribution",
    "NarrativeResult",
    "PrevEpochState",
    "apply_cap",
    "compute_a_max",
    "ema",
    "kol_authority",
    "mindshare",
    "post_score",
    "run_epoch",
    "select_engagement",
    "to_bps_hamilton",
    "velocity",
]
