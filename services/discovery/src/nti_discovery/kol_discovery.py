"""Numeric KOL candidate discovery filter for governance/admin approval queue."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class KolCandidateMetrics:
    user_id: int
    handle: str
    followers: int
    avg_likes: float
    themed_posts_per_week: int
    narrative_id: int


def filter_kol_candidates(
    candidates: Sequence[KolCandidateMetrics],
    *,
    existing_user_ids: Iterable[int] = (),
    min_followers: int = 5_000,
    min_avg_likes: float = 20.0,
    min_themed_posts_per_week: int = 3,
) -> list[KolCandidateMetrics]:
    """Filter candidate KOLs by strict numeric gates and exclude already-active KOLs."""
    existing = set(existing_user_ids)
    seen: set[int] = set()
    accepted: list[KolCandidateMetrics] = []

    for c in candidates:
        if c.user_id in existing or c.user_id in seen:
            continue
        if c.followers < min_followers:
            continue
        if c.avg_likes < min_avg_likes:
            continue
        if c.themed_posts_per_week < min_themed_posts_per_week:
            continue
        seen.add(c.user_id)
        accepted.append(c)

    accepted.sort(key=lambda c: (-c.followers, -c.avg_likes, c.user_id))
    return accepted
