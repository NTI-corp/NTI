"""Supabase REST/PostgREST storage helper for NTI operational tables."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import httpx


class StorageError(RuntimeError):
    """Raised when a Supabase REST write or purge call fails."""


class SupabaseStorage:
    """Lightweight async PostgREST client using httpx (no heavy binary Postgres drivers needed)."""

    def __init__(
        self,
        supabase_url: str,
        service_key: str,
        client: httpx.AsyncClient | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._rest_base = f"{supabase_url.rstrip('/')}/rest/v1"
        self._service_key = service_key
        self._client = client
        self._timeout = timeout

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json_body: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        url = f"{self._rest_base}/{table}"
        headers = self._headers(prefer=prefer)
        if self._client is not None:
            resp = await self._client.request(
                method, url, params=params, json=json_body, headers=headers
            )
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
        if resp.status_code >= 400:
            raise StorageError(
                f"Supabase {method} {table} failed ({resp.status_code}): {resp.text}"
            )
        if not resp.content:
            return None
        return resp.json()

    async def upsert(
        self,
        table: str,
        rows: Sequence[dict[str, Any]],
        on_conflict: str | None = None,
    ) -> Any:
        if not rows:
            return []
        params = {"on_conflict": on_conflict} if on_conflict else None
        return await self._request(
            "POST",
            table,
            params=params,
            json_body=list(rows),
            prefer="resolution=merge-duplicates,return=minimal",
        )

    async def patch(
        self,
        table: str,
        filters: dict[str, str],
        values: dict[str, Any],
    ) -> Any:
        return await self._request(
            "PATCH",
            table,
            params=filters,
            json_body=values,
            prefer="return=minimal",
        )

    async def delete(self, table: str, filters: dict[str, str]) -> Any:
        return await self._request(
            "DELETE",
            table,
            params=filters,
            prefer="return=minimal",
        )

    async def upsert_fetch_cycles(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("fetch_cycles", rows)

    async def upsert_posts(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("posts", rows, on_conflict="tweet_id")

    async def upsert_post_engagement(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("post_engagement", rows, on_conflict="tweet_id,cycle_id")

    async def upsert_classifications(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert(
            "classifications", rows, on_conflict="tweet_id,model_version,prompt_version"
        )

    async def upsert_epochs(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("epochs", rows, on_conflict="epoch_id")

    async def upsert_narrative_epoch(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("narrative_epoch", rows, on_conflict="epoch_id,narrative_id")

    async def upsert_kol_contribution(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("kol_contribution", rows)

    async def upsert_llm_runs(self, rows: Sequence[dict[str, Any]]) -> Any:
        return await self.upsert("llm_runs", rows)
