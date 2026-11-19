"""Shared domain data models across NTI off-chain services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class EpochStatus(StrEnum):
    COLLECTING = "collecting"
    COMPUTED = "computed"
    COMMITTED = "committed"
    DISPUTED = "disputed"
    FINAL = "final"
    INCOMPLETE = "incomplete"


@dataclass(frozen=True, slots=True)
class RawPost:
    tweet_id: int
    user_id: int
    handle: str
    created_at: datetime
    text: str
    likes: int
    reposts: int
    quotes: int
    replies: int
    fetched_at: datetime


@dataclass(frozen=True, slots=True)
class KolProfile:
    user_id: int
    handle: str
    followers: int
    h_k: int = 1
    r_k: Decimal = Decimal("1")
    poll_tier: int = 1
    active: bool = True
