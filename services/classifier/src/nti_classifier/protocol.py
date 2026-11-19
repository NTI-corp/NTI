"""Narrow adapter protocol and validated schema for narrative LLM classification."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field


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


class LLM(Protocol):
    version: str

    async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]: ...
