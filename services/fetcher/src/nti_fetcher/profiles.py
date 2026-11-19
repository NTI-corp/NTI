"""Monthly KOL profile refresh job updating follower counts and recomputing A_max."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from nti_core.types import KolProfile
from nti_engine.calc import compute_a_max

from nti_fetcher.protocol import PostSource


@dataclass(frozen=True, slots=True)
class ProfileRefreshReport:
    profiles: tuple[KolProfile, ...]
    updated_count: int
    failed_ids: tuple[int, ...]
    a_max: Decimal


async def refresh_kol_profiles(
    kols: Sequence[KolProfile],
    source: PostSource,
) -> ProfileRefreshReport:
    """Refresh each KOL's follower count with fault isolation and recompute 90th-pct A_max."""
    updated: list[KolProfile] = []
    failed_ids: list[int] = []
    updated_count = 0

    for kol in sorted(kols, key=lambda k: k.user_id):
        try:
            fresh = await source.user_profile(kol.user_id)
            updated.append(
                KolProfile(
                    user_id=kol.user_id,
                    handle=fresh.handle or kol.handle,
                    followers=fresh.followers,
                    h_k=kol.h_k,
                    r_k=kol.r_k,
                    poll_tier=kol.poll_tier,
                    active=kol.active,
                )
            )
            updated_count += 1
        except Exception:  # noqa: BLE001
            failed_ids.append(kol.user_id)
            updated.append(kol)

    a_max = compute_a_max([k.followers for k in updated])
    return ProfileRefreshReport(
        profiles=tuple(updated),
        updated_count=updated_count,
        failed_ids=tuple(failed_ids),
        a_max=a_max,
    )
