"""Narrow adapter protocol and validated schema for narrative LLM classification."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field, field_validator


@dataclass(frozen=True, slots=True)
class PostIn:
    tweet_id: int
    handle: str
    text: str


@dataclass(frozen=True, slots=True)
class PromptSpec:
    version: str
    system_prompt: str
    narratives: tuple[int, ...]


class ClassResult(BaseModel):
    tweet_id: int
    q: dict[int, float] = Field(default_factory=dict)

    @field_validator("q", mode="before")
    @classmethod
    def _validate_and_clamp_q(cls, raw: object) -> dict[int, float]:
        if raw is None:
            return {}
        if not isinstance(raw, dict):
            raise ValueError("q must be a mapping of narrative_id -> probability")
        cleaned: dict[int, float] = {}
        for key, val in raw.items():
            nid = int(key)
            prob = float(val)
            if not math.isfinite(prob):
                raise ValueError(f"Non-finite probability for narrative {nid}")
            if prob < -1e-6 or prob > 1.0 + 1e-6:
                raise ValueError(f"Probability out of [0, 1] bounds for narrative {nid}: {prob}")
            clamped = min(1.0, max(0.0, prob))
            if clamped > 0.0:
                cleaned[nid] = clamped
        return cleaned


class LLM(Protocol):
    version: str

    async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]: ...
