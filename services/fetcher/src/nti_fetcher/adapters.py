"""PostSource adapters: Twscrape (lazy), HTTP GraphQL fallback, TwitterAPI.io ($50 cap), Mock."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from nti_core.types import KolProfile, RawPost

from nti_fetcher.accounts import AccountPool


class BudgetExceededError(RuntimeError):
    """Raised when paid TwitterAPI.io monthly spend cap ($50/mo) would be exceeded."""


class SourceRequestError(RuntimeError):
    """Raised when an upstream X post source fails to serve a request."""


def _parse_iso_dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    cleaned = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(cleaned)
    return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)


class TwscrapeSource:
    """Primary X scraper adapter with lazy twscrape import so offline/test envs stay lean."""

    name: str = "twscrape"

    def __init__(
        self,
        db_path: str | Path = "accounts.db",
        account_pool: AccountPool | None = None,
        pool_key: str = "lane_0",
        api: Any | None = None,
    ) -> None:
        self._db_path = str(db_path)
        self._account_pool = account_pool
        self._pool_key = pool_key
        self._api = api

    def _ensure_api(self) -> Any:
        if self._api is None:
            import twscrape  # type: ignore[import-not-found]
            import twscrape.queue_client as qc  # type: ignore[import-not-found]
            from twscrape.xclid import XClIdParseError  # type: ignore[import-not-found]

            if not getattr(qc.XClIdGenStore, "_nti_fallback", False):
                orig_get = qc.XClIdGenStore.get

                class _NoopXClIdGen:
                    def calc(self, method: str, path: str) -> str:  # noqa: ARG002
                        return ""

                async def _safe_xclid_get(*args: Any, **kwargs: Any) -> Any:
                    try:
                        return await orig_get(*args, **kwargs)
                    except XClIdParseError:
                        return _NoopXClIdGen()

                qc.XClIdGenStore.get = _safe_xclid_get  # type: ignore[method-assign]
                qc.XClIdGenStore._nti_fallback = True  # type: ignore[attr-defined]

            self._api = twscrape.API(self._db_path)
        return self._api

    async def user_timeline(
        self,
        user_id: int,
        since_id: int | None,
        limit: int = 20,
        *,
        max_id: int | None = None,
    ) -> list[RawPost]:
        acct = self._account_pool.acquire(self._pool_key) if self._account_pool else None
        api = self._ensure_api()
        now = datetime.now(UTC)
        posts: list[RawPost] = []
        try:
            async for tw in api.user_tweets(user_id, limit=limit):
                tid = int(tw.id)
                if since_id is not None and tid <= since_id:
                    continue
                if max_id is not None and tid >= max_id:
                    continue
                posts.append(
                    RawPost(
                        tweet_id=tid,
                        user_id=user_id,
                        handle=str(getattr(tw.user, "username", "")),
                        created_at=_parse_iso_dt(tw.date),
                        text=str(getattr(tw, "rawContent", "")),
                        likes=int(getattr(tw, "likeCount", 0)),
                        reposts=int(getattr(tw, "retweetCount", 0)),
                        quotes=int(getattr(tw, "quoteCount", 0)),
                        replies=int(getattr(tw, "replyCount", 0)),
                        fetched_at=now,
                    )
                )
        finally:
            if acct is not None and self._account_pool is not None:
                self._account_pool.record_request(acct.username)
        posts.sort(key=lambda p: p.tweet_id, reverse=True)
        return posts[:limit]

    async def user_profile(self, user_id: int) -> KolProfile:
        acct = self._account_pool.acquire(self._pool_key) if self._account_pool else None
        api = self._ensure_api()
        try:
            u = await api.user_by_id(user_id)
        finally:
            if acct is not None and self._account_pool is not None:
                self._account_pool.record_request(acct.username)
        if u is None:
            raise SourceRequestError(f"Profile not found for user_id={user_id}")
        return KolProfile(
            user_id=int(u.id),
            handle=str(u.username),
            followers=int(getattr(u, "followersCount", 0)),
        )


class HttpFallbackSource:
    """Pure HTTP/GraphQL fallback adapter (Scweet/twifork-compatible, NO headless browser)."""

    def __init__(
        self,
        base_url: str,
        name: str = "scweet",
        account_pool: AccountPool | None = None,
        pool_key: str = "lane_0",
        client: httpx.AsyncClient | None = None,
        timeout: float = 20.0,
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._account_pool = account_pool
        self._pool_key = pool_key
        self._client = client
        self._timeout = timeout

    def _headers(self) -> tuple[dict[str, str], str | None]:
        headers = {"Accept": "application/json"}
        username: str | None = None
        if self._account_pool is not None:
            acct = self._account_pool.acquire(self._pool_key)
            username = acct.username
            headers["Cookie"] = f"auth_token={acct.auth_token}; ct0={acct.ct0}"
            headers["x-csrf-token"] = acct.ct0
        return headers, username

    async def _get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        headers, username = self._headers()
        url = f"{self._base_url}/{path.lstrip('/')}"
        try:
            if self._client is not None:
                resp = await self._client.get(url, params=params, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(url, params=params, headers=headers)
        finally:
            if username is not None and self._account_pool is not None:
                self._account_pool.record_request(username)

        if resp.status_code == 429 and username and self._account_pool:
            self._account_pool.mark_rate_limited(username)
            raise SourceRequestError(f"HTTP 429 from {self.name}")
        if resp.status_code >= 400:
            raise SourceRequestError(f"HTTP {resp.status_code} from {self.name}")
        return dict(resp.json())

    async def user_timeline(
        self,
        user_id: int,
        since_id: int | None,
        limit: int = 20,
        *,
        max_id: int | None = None,
    ) -> list[RawPost]:
        params: dict[str, Any] = {"user_id": user_id, "count": limit}
        if since_id is not None:
            params["since_id"] = since_id
        if max_id is not None:
            params["max_id"] = max_id
        payload = await self._get_json("UserTweets", params)
        now = datetime.now(UTC)
        out: list[RawPost] = []
        for item in payload.get("tweets", []):
            tid = int(item["tweet_id"])
            if since_id is not None and tid <= since_id:
                continue
            if max_id is not None and tid >= max_id:
                continue
            out.append(
                RawPost(
                    tweet_id=tid,
                    user_id=int(item.get("user_id", user_id)),
                    handle=str(item.get("handle", "")),
                    created_at=_parse_iso_dt(item["created_at"]),
                    text=str(item.get("text", "")),
                    likes=int(item.get("likes", 0)),
                    reposts=int(item.get("reposts", 0)),
                    quotes=int(item.get("quotes", 0)),
                    replies=int(item.get("replies", 0)),
                    fetched_at=now,
                )
            )
        out.sort(key=lambda p: p.tweet_id, reverse=True)
        return out[:limit]

    async def user_profile(self, user_id: int) -> KolProfile:
        payload = await self._get_json("UserByRestId", {"user_id": user_id})
        return KolProfile(
            user_id=int(payload.get("user_id", user_id)),
            handle=str(payload.get("handle", "")),
            followers=int(payload.get("followers", 0)),
        )


class TwitterApiIoSource:
    """Paid fallback adapter with strict $50/mo monthly spend cap persisted to JSON ledger."""

    name: str = "twitterapi"

    def __init__(
        self,
        api_key: str,
        ledger_path: str | Path,
        monthly_budget_usd: Decimal = Decimal("50.00"),
        cost_per_request_usd: Decimal = Decimal("0.003"),
        base_url: str = "https://api.twitterapi.io",
        client: httpx.AsyncClient | None = None,
        now_fn: Callable[[], datetime] | None = None,
        timeout: float = 20.0,
    ) -> None:
        self._api_key = api_key
        self._ledger_path = Path(ledger_path)
        self._monthly_budget_usd = monthly_budget_usd
        self._cost_per_request_usd = cost_per_request_usd
        self._base_url = base_url.rstrip("/")
        self._client = client
        self._now_fn = now_fn or (lambda: datetime.now(UTC))
        self._timeout = timeout
        self._ledger: dict[str, str] = self._load_ledger()

    def _month_key(self, now: datetime | None = None) -> str:
        ts = now or self._now_fn()
        return ts.astimezone(UTC).strftime("%Y-%m")

    def _load_ledger(self) -> dict[str, str]:
        if not self._ledger_path.exists():
            return {}
        data = json.loads(self._ledger_path.read_text(encoding="utf-8"))
        return {str(k): str(v) for k, v in data.items()}

    def _save_ledger(self) -> None:
        self._ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self._ledger_path.write_text(json.dumps(self._ledger, sort_keys=True), encoding="utf-8")

    def monthly_spend(self, now: datetime | None = None) -> Decimal:
        key = self._month_key(now)
        return Decimal(self._ledger.get(key, "0.00"))

    def _reserve_budget(self) -> None:
        now = self._now_fn()
        key = self._month_key(now)
        current = Decimal(self._ledger.get(key, "0.00"))
        projected = current + self._cost_per_request_usd
        if projected > self._monthly_budget_usd:
            raise BudgetExceededError(
                f"TwitterAPI.io monthly cap ${self._monthly_budget_usd} reached "
                f"(current=${current}, next=${projected})"
            )
        self._ledger[key] = str(projected)
        self._save_ledger()

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        self._reserve_budget()
        url = f"{self._base_url}/{path.lstrip('/')}"
        headers = {"X-API-Key": self._api_key, "Accept": "application/json"}
        if self._client is not None:
            resp = await self._client.get(url, params=params, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, params=params, headers=headers)
        if resp.status_code >= 400:
            raise SourceRequestError(f"TwitterAPI.io HTTP {resp.status_code}")
        return dict(resp.json())

    async def user_timeline(
        self,
        user_id: int,
        since_id: int | None,
        limit: int = 20,
        *,
        max_id: int | None = None,
    ) -> list[RawPost]:
        params: dict[str, Any] = {"userId": user_id, "limit": limit}
        if max_id is not None:
            params["cursor"] = str(max_id)
        data = await self._get("twitter/user/last_tweets", params)
        now = self._now_fn()
        out: list[RawPost] = []
        for item in data.get("tweets", []):
            tid = int(item["id"])
            if since_id is not None and tid <= since_id:
                continue
            if max_id is not None and tid >= max_id:
                continue
            author = item.get("author", {})
            out.append(
                RawPost(
                    tweet_id=tid,
                    user_id=int(author.get("id", user_id)),
                    handle=str(author.get("userName", "")),
                    created_at=_parse_iso_dt(item["createdAt"]),
                    text=str(item.get("text", "")),
                    likes=int(item.get("likeCount", 0)),
                    reposts=int(item.get("retweetCount", 0)),
                    quotes=int(item.get("quoteCount", 0)),
                    replies=int(item.get("replyCount", 0)),
                    fetched_at=now,
                )
            )
        out.sort(key=lambda p: p.tweet_id, reverse=True)
        return out[:limit]

    async def user_profile(self, user_id: int) -> KolProfile:
        data = await self._get("twitter/user/info", {"userId": user_id})
        u = data.get("data", data)
        return KolProfile(
            user_id=int(u.get("id", user_id)),
            handle=str(u.get("userName", "")),
            followers=int(u.get("followers", 0)),
        )


class InMemoryMockSource:
    """Deterministic in-memory PostSource supporting chaos & failure injection for tests."""

    def __init__(
        self,
        name: str = "mock",
        timelines: dict[int, list[RawPost]] | None = None,
        profiles: dict[int, KolProfile] | None = None,
        permanent_fail_ids: set[int] | None = None,
        transient_failures: dict[int, int] | None = None,
        fail_after_calls: int | None = None,
    ) -> None:
        self.name = name
        self._timelines = {uid: list(posts) for uid, posts in (timelines or {}).items()}
        self._profiles = dict(profiles or {})
        self._permanent_fail_ids = set(permanent_fail_ids or set())
        self._transient_remaining = dict(transient_failures or {})
        self._fail_after_calls = fail_after_calls
        self.call_count = 0

    def _check_fail(self, user_id: int) -> None:
        self.call_count += 1
        if self._fail_after_calls is not None and self.call_count > self._fail_after_calls:
            raise SourceRequestError(f"{self.name} killed after {self._fail_after_calls} calls")
        if user_id in self._permanent_fail_ids:
            raise SourceRequestError(f"{self.name} permanent failure for user_id={user_id}")
        rem = self._transient_remaining.get(user_id, 0)
        if rem > 0:
            self._transient_remaining[user_id] = rem - 1
            raise SourceRequestError(f"{self.name} transient failure for user_id={user_id}")

    async def user_timeline(
        self,
        user_id: int,
        since_id: int | None,
        limit: int = 20,
        *,
        max_id: int | None = None,
    ) -> list[RawPost]:
        self._check_fail(user_id)
        posts = sorted(self._timelines.get(user_id, []), key=lambda p: p.tweet_id, reverse=True)
        filtered = [
            p
            for p in posts
            if (since_id is None or p.tweet_id > since_id)
            and (max_id is None or p.tweet_id < max_id)
        ]
        return filtered[:limit]

    async def user_profile(self, user_id: int) -> KolProfile:
        self._check_fail(user_id)
        if user_id not in self._profiles:
            raise SourceRequestError(f"Profile missing for user_id={user_id}")
        return self._profiles[user_id]
