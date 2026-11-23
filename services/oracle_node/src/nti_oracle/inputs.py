"""Version and history rules shared by live oracle input preparation and replay."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from nti_core.canonical import canonical_json_bytes, keccak256_hex
from nti_engine.models import PrevEpochState


def calculation_provenance(
    config_hash: str,
    model_version: str,
    prompt_version: str,
    engine_version: str,
) -> dict[str, str]:
    return {
        "config_hash": config_hash,
        "model_version": model_version,
        "prompt_version": prompt_version,
        "engine_version": engine_version,
    }


def next_series_id(
    previous_series: int,
    previous_provenance: Mapping[str, Any] | None,
    current_provenance: Mapping[str, Any],
) -> int:
    if previous_series <= 0:
        return 1
    if previous_provenance == current_provenance:
        return previous_series
    return previous_series + 1


def provenance_hash(provenance: Mapping[str, Any]) -> str:
    return keccak256_hex(canonical_json_bytes(dict(provenance)))


def previous_epoch_state(
    target_epoch: int,
    current_series: int,
    epochs: Sequence[Mapping[str, Any]],
    values: Sequence[Mapping[str, Any]],
    lag_epochs: int,
) -> PrevEpochState:
    by_epoch = {int(e["epoch_id"]): e for e in epochs if int(e["epoch_id"]) < target_epoch}
    finals = [e for e in by_epoch.values() if e["status"] == "final"]
    previous = max(finals, key=lambda e: int(e["epoch_id"]), default=None)
    previous_id = int(previous["epoch_id"]) if previous else None
    previous_series = int(previous["series_id"]) if previous else current_series
    lag_id = target_epoch - lag_epochs

    def vector(epoch_id: int | None) -> dict[int, int] | None:
        out = {
            int(v["narrative_id"]): int(v["i_bps"])
            for v in values
            if int(v["epoch_id"]) == epoch_id
        }
        return out or None

    lag = by_epoch.get(lag_id)
    gap = any(
        ep not in by_epoch
        or by_epoch[ep]["status"] != "final"
        or int(by_epoch[ep]["series_id"]) != current_series
        for ep in range(lag_id, target_epoch)
    )
    return PrevEpochState(
        series_id=previous_series,
        prev_i_bps=vector(previous_id),
        lag_i_bps=vector(lag_id) if lag and lag["status"] == "final" else None,
        has_incomplete_gap=gap,
    )
