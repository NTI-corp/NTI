"""Deterministic validator omission sampler and post-ID set overlap checker."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from nti_core.canonical import keccak256_bytes
from nti_core.types import KolProfile
from nti_fetcher.protocol import PostSource


@dataclass(frozen=True, slots=True)
class OmissionCheckReport:
    epoch_id: int
    seed_hex: str
    sampled_user_ids: tuple[int, ...]
    operator_post_count: int
    validator_post_count: int
    overlap: float
    min_overlap: float
    passed: bool
    missing_post_ids: tuple[int, ...]
    extra_post_ids: tuple[int, ...]


def compute_omission_seed(prev_commit_hash: str, epoch_id: int) -> bytes:
    """seed = keccak256(prevCommitHash || uint32(epochId))."""
    cleaned = prev_commit_hash[2:] if prev_commit_hash.startswith("0x") else prev_commit_hash
    prev_bytes = bytes.fromhex(cleaned)
    if len(prev_bytes) != 32:
        raise ValueError(f"prev_commit_hash must be 32 bytes, got {len(prev_bytes)}")
    return keccak256_bytes(prev_bytes + int(epoch_id).to_bytes(4, "big"))


def select_omission_sample(
    kols: Sequence[KolProfile],
    prev_commit_hash: str,
    epoch_id: int,
    sample_fraction: float = 0.10,
) -> list[KolProfile]:
    """Sort KOLs by keccak256(handle || seed) and take the first sample_fraction (10%)."""
    active = [k for k in kols if k.active]
    if not active:
        return []
    seed = compute_omission_seed(prev_commit_hash, epoch_id)
    ordered = sorted(
        active,
        key=lambda k: (keccak256_bytes(k.handle.encode("utf-8") + seed), k.user_id),
    )
    count = max(1, math.ceil(len(ordered) * sample_fraction))
    return ordered[:count]


async def run_omission_check(
    *,
    kols: Sequence[KolProfile],
    operator_post_ids_by_kol: Mapping[int, set[int]],
    validator_source: PostSource,
    prev_commit_hash: str,
    epoch_id: int,
    window_start: datetime,
    boundary: datetime,
    sample_fraction: float = 0.10,
    min_overlap: float = 0.95,
    page_limit: int = 60,
) -> OmissionCheckReport:
    """Re-fetch 10% deterministic sample via validator pool and enforce >= 95% overlap."""
    seed = compute_omission_seed(prev_commit_hash, epoch_id)
    sampled = select_omission_sample(kols, prev_commit_hash, epoch_id, sample_fraction)

    op_ids: set[int] = set()
    val_ids: set[int] = set()
    for kol in sampled:
        op_ids.update(operator_post_ids_by_kol.get(kol.user_id, set()))
        posts = await validator_source.user_timeline(
            user_id=kol.user_id, since_id=None, limit=page_limit
        )
        for p in posts:
            if window_start <= p.created_at < boundary:
                val_ids.add(p.tweet_id)

    union = op_ids | val_ids
    intersection = op_ids & val_ids
    overlap = (len(intersection) / len(union)) if union else 1.0
    missing = tuple(sorted(val_ids - op_ids))
    extra = tuple(sorted(op_ids - val_ids))

    return OmissionCheckReport(
        epoch_id=epoch_id,
        seed_hex="0x" + seed.hex(),
        sampled_user_ids=tuple(k.user_id for k in sampled),
        operator_post_count=len(op_ids),
        validator_post_count=len(val_ids),
        overlap=overlap,
        min_overlap=min_overlap,
        passed=(overlap >= min_overlap),
        missing_post_ids=missing,
        extra_post_ids=extra,
    )
