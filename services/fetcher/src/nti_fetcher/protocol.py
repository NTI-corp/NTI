"""Narrow adapter protocol for X post sources (twscrape, scweet, twifork, twitterapi)."""

from __future__ import annotations

from typing import Protocol

from nti_core.types import KolProfile, RawPost


class PostSource(Protocol):
    name: str

    async def user_timeline(
        self,
        user_id: int,
        since_id: int | None,
        limit: int = 20,
    ) -> list[RawPost]: ...

    async def user_profile(self, user_id: int) -> KolProfile: ...
