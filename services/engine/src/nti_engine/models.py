"""Immutable domain models for the pure NTI index engine."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class EngagementSnapshot:
    likes: int
    reposts: int
    quotes: int
    replies: int
    fetched_at_unix: int


@dataclass(frozen=True, slots=True)
class EnginePost:
    tweet_id: int
    user_id: int
    created_at_unix: int
    engagements: tuple[EngagementSnapshot, ...]
    q: dict[int, Decimal]


@dataclass(frozen=True, slots=True)
class EngineKol:
    user_id: int
    followers: int
    h_k: int = 1
    r_k: Decimal = Decimal("1")


@dataclass(frozen=True, slots=True)
class EpochDataset:
    epoch_id: int
    boundary_unix: int
    series_id: int
    posts: tuple[EnginePost, ...]
    kols: tuple[EngineKol, ...]
    a_max: Decimal | None = None


@dataclass(frozen=True, slots=True)
class PrevEpochState:
    series_id: int
    prev_i_bps: dict[int, int] | None
    lag_i_bps: dict[int, int] | None
    has_incomplete_gap: bool = False


@dataclass(frozen=True, slots=True)
class KolContribution:
    user_id: int
    share_bps: int
    capped: bool


@dataclass(frozen=True, slots=True)
class NarrativeResult:
    narrative_id: int
    s_n: Decimal
    m_bps: int
    i_bps: int
    v_bps: int | None
    v_flag: str | None
    weighted_posts: Decimal
    contributors: tuple[KolContribution, ...]


@dataclass(frozen=True, slots=True)
class EpochResult:
    epoch_id: int
    series_id: int
    incomplete: bool
    narratives: tuple[NarrativeResult, ...]
    i_vector: tuple[int, ...]
    v_vector: tuple[int | None, ...]
    config_hash: str
