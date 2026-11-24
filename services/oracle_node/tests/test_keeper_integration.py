from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from nti_oracle import __main__ as oracle_main


class FakeStorage:
    async def select(self, table: str, **kwargs: Any) -> list[dict[str, Any]]:
        if table == "narrative_epoch":
            assert kwargs["filters"] == {"epoch_id": "eq.124686"}
            return [
                {"narrative_id": narrative_id, "i_bps": {2: 1200, 7: 8800}.get(narrative_id, 0)}
                for narrative_id in range(1, 11)
            ]
        raise AssertionError(f"Unexpected keeper query: {table}")


class FakeClient:
    def __init__(self, *, rpc_url: str, contract_address: str, chain_id: int) -> None:
        self.rpc_url = rpc_url
        self.contract_address = contract_address
        self.chain_id = chain_id

    async def read_state(self) -> SimpleNamespace:
        return SimpleNamespace(block_timestamp=1_800_000_000, latest_final_epoch=124686)

    async def _rpc(self, method: str, params: list[Any]) -> str:
        assert method == "eth_getBalance"
        return hex(10**18)


def test_keeper_runs_basket_fee_lifecycle_in_safe_order(monkeypatch: Any) -> None:
    events: list[str] = []
    addresses = {
        "oracleCommit": "0x" + "08" * 20,
        "narrativeMarket": "0x" + "01" * 20,
        "feeRouter": "0x" + "02" * 20,
        "registry": "0x" + "03" * 20,
        "grants": "0x" + "04" * 20,
        "basketFactory": "0x" + "05" * 20,
        "weth": "0x" + "06" * 20,
        "buybackAdapterV3": "0x" + "07" * 20,
    }
    monkeypatch.setattr(oracle_main, "_load_deployment", lambda chain_id: addresses)
    monkeypatch.setattr(oracle_main, "_rpc_url_for_chain", lambda chain_id: "test-rpc")
    monkeypatch.setattr(oracle_main, "OracleCommitClient", FakeClient)

    async def action(name: str, **kwargs: Any) -> dict[str, Any]:
        events.append(name)
        if name == "run_buyback":
            actual = kwargs["at_address"](addresses["feeRouter"]).contract_address
            assert actual == addresses["feeRouter"]
            assert kwargs["deployment"] == addresses
            assert kwargs["now"] == 1_800_000_000
        if name == "rebalance_baskets":
            assert kwargs["allocation_index"] == {
                1: 0,
                2: 1200,
                3: 0,
                4: 0,
                5: 0,
                6: 0,
                7: 8800,
                8: 0,
                9: 0,
                10: 0,
            }
            assert kwargs["now"] == 1_800_000_000
        return {"task": name, "status": "ok"}

    for function_name in (
        "settle_markets",
        "accrue_basket_fees",
        "redeem_basket_fees",
        "distribute_fees",
        "run_buyback",
        "rebalance_baskets",
        "manage_grant_round",
        "sync_radar_alerts",
    ):
        async def fake(*args: Any, _name: str = function_name, **kwargs: Any) -> dict[str, Any]:
            return await action(_name, **kwargs)

        monkeypatch.setattr(oracle_main, function_name, fake, raising=False)

    result = asyncio.run(
        oracle_main._run_keeper_tasks(
            SimpleNamespace(chain_id=46630),
            FakeStorage(),
            FakeClient(
                rpc_url="test-rpc",
                contract_address=addresses["oracleCommit"],
                chain_id=46630,
            ),
            "0x" + "11" * 32,
        )
    )

    assert events == [
        "settle_markets",
        "accrue_basket_fees",
        "redeem_basket_fees",
        "distribute_fees",
        "run_buyback",
        "rebalance_baskets",
        "manage_grant_round",
        "sync_radar_alerts",
    ]
    assert all(item["status"] == "ok" for item in result), result
