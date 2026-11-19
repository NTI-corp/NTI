"""Versioned protocol configuration loader with deterministic config hash."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from nti_core.canonical import canonical_json_bytes, keccak256_hex


class ClassifierConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    batch_size: int = Field(gt=0)
    temperature: float = Field(ge=0.0, le=2.0)
    min_agreement: float = Field(ge=0.0, le=1.0)


class ValidatorConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    sample_fraction: float = Field(gt=0.0, le=1.0)
    min_overlap: float = Field(ge=0.0, le=1.0)
    max_delta_bps: int = Field(ge=0, le=10_000)


class NTIConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    version: int = Field(ge=1)
    epoch_seconds: int = Field(gt=0)
    half_life_hours: int = Field(gt=0)
    alpha: Decimal
    lookback_hours: int = Field(gt=0)
    kol_cap: Decimal
    kol_active_min_q: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    v_lag_epochs: int = Field(ge=1)
    v_min_index_bps: int = Field(ge=0, le=10_000)
    v_min_weighted_posts: int = Field(ge=0)
    engagement_reread_hours: int = Field(gt=0)
    classifier: ClassifierConfig
    validator: ValidatorConfig
    narratives: tuple[int, ...] = Field(min_length=1)

    def config_hash(self) -> str:
        """Compute keccak256 over the canonical JSON representation of this config."""
        raw = self.model_dump(mode="json")
        return keccak256_hex(canonical_json_bytes(raw))


def load_config(path: str | Path) -> NTIConfig:
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    return NTIConfig.model_validate(data)
