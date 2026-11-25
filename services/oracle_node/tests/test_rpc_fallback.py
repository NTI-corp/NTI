"""RPC endpoint fallback: outages move to the next URL, JSON-RPC errors do not."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from nti_oracle.chain import ChainRpcError, OracleCommitClient

REAL_CLIENT = httpx.AsyncClient


def client_with(monkeypatch: pytest.MonkeyPatch, handler: Any) -> OracleCommitClient:
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kw: REAL_CLIENT(transport=transport, timeout=kw.get("timeout")),
    )
    return OracleCommitClient(
        rpc_url="https://primary.example, https://backup.example",
        contract_address="0x" + "11" * 20,
        chain_id=4663,
    )


def test_outage_on_the_primary_falls_over_to_the_backup(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        if request.url.host == "primary.example":
            return httpx.Response(503)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": "0x10"})

    client = client_with(monkeypatch, handler)
    assert asyncio.run(client._rpc("eth_blockNumber", [])) == "0x10"
    assert seen == ["primary.example", "backup.example"]


def test_a_jsonrpc_error_is_final_and_does_not_try_the_backup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        error = {"code": -32000, "message": "revert"}
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": error})

    client = client_with(monkeypatch, handler)
    with pytest.raises(ChainRpcError, match="revert"):
        asyncio.run(client._rpc("eth_call", []))
    assert seen == ["primary.example"]


def test_every_endpoint_down_raises_one_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    client = client_with(monkeypatch, lambda request: httpx.Response(429))
    with pytest.raises(ChainRpcError, match="every endpoint"):
        asyncio.run(client._rpc("eth_blockNumber", []))
