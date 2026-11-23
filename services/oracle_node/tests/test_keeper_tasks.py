"""Keeper automation tasks against in-memory fake contracts."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import keccak
from nti_oracle.chain import ChainRpcError
from nti_oracle.keeper_tasks import (
    _guard,
    accrue_basket_fees,
    distribute_fees,
    manage_grant_round,
    run_buyback,
    settle_markets,
    sync_radar_alerts,
    velocity_alert_rows,
)

KEY = "0x" + "11" * 32
WETH = "0x" + "01" * 20
NTI = "0x" + "02" * 20
ADAPTER = "0x" + "03" * 20
FACTORY = "0x" + "04" * 20
POOL = "0x" + "05" * 20
STATE_VIEW = "0x" + "06" * 20
HOOK = "0x" + "07" * 20
ZERO = "0x" + "00" * 20
POOL_KEY = "(address,address,uint24,int24,address)"
ROUND_TYPES = ["uint256", "uint64", "uint64", "uint64", "uint256", "uint256", "bool"]
MARKET_TYPES = [
    "uint8",
    "uint8",
    "uint32",
    "uint32",
    "uint32",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "uint8",
    "bool",
]


def sel(sig: str) -> bytes:
    return keccak(text=sig)[:4]


class FakeContract:
    def __init__(
        self, answers: dict[str, tuple[list[str], list[Any]]], fail_send: bool = False
    ) -> None:
        self.answers = answers
        self.sent: list[bytes] = []
        self.fail_send = fail_send

    async def _call(self, sig: str, arg_types: Any, args: Any) -> bytes:
        types, values = self.answers[sig if not args else f"{sig}:{args[0]}"]
        return abi_encode(types, values)

    async def _send_tx(self, private_key: str, calldata: bytes) -> str:
        if self.fail_send:
            raise ChainRpcError("NoAvailableBudget")
        self.sent.append(calldata)
        return "0x" + "ab" * 32


def market_row(settle_epoch: int, settled: bool) -> tuple[list[str], list[Any]]:
    return (MARKET_TYPES, [1, 2, 10, settle_epoch, 1, 0, 0, 0, 0, 0, 0, settled])


def test_settle_markets_only_settles_final_or_timed_out() -> None:
    market = FakeContract(
        {
            "nextMarketId()": (["uint256"], [5]),
            "SETTLE_TIMEOUT()": (["uint256"], [48 * 3600]),
            "markets(uint256):1": market_row(100, True),
            "markets(uint256):2": market_row(101, False),
            "markets(uint256):3": market_row(102, False),
            "markets(uint256):4": market_row(103, False),
        }
    )
    oracle = FakeContract(
        {
            "epochStatus(uint32):101": (["uint8"], [3]),
            "epochStatus(uint32):102": (["uint8"], [1]),
            "epochStatus(uint32):103": (["uint8"], [0]),
            "epochBoundary(uint32):101": (["uint64"], [1_000]),
            "epochBoundary(uint32):102": (["uint64"], [1_000_000 - 3600]),
            "epochBoundary(uint32):103": (["uint64"], [1_000]),
        }
    )
    res = asyncio.run(settle_markets(market, oracle, private_key=KEY, now=1_000_000))
    assert [s["market_id"] for s in res["settled"]] == [2, 4]
    assert all(c[:4] == sel("settle(uint256)") for c in market.sent)


def test_distribute_fees_idle_then_send() -> None:
    idle = FakeContract(
        {"undistributedBalance()": (["uint256"], [0]), "pendingStakingETH()": (["uint256"], [0])}
    )
    assert asyncio.run(distribute_fees(idle, private_key=KEY))["status"] == "idle"
    assert idle.sent == []
    busy = FakeContract(
        {
            "undistributedBalance()": (["uint256"], [10**15]),
            "pendingStakingETH()": (["uint256"], [0]),
        }
    )
    assert asyncio.run(distribute_fees(busy, private_key=KEY))["status"] == "ok"
    assert busy.sent == [sel("distribute()")]


def _router(pool: int, last: int) -> FakeContract:
    return FakeContract(
        {
            "buybackPool()": (["uint256"], [pool]),
            "maxPerCall()": (["uint256"], [2 * 10**17]),
            "lastBuybackAt()": (["uint256"], [last]),
        }
    )


def test_buyback_respects_ready_flag_minimum_and_cooldown() -> None:
    not_ready = FakeContract({"buybackReady()": (["bool"], [False])})
    ready = FakeContract({"buybackReady()": (["bool"], [True])})
    now = 1_000_000

    res = asyncio.run(run_buyback(_router(10**18, 0), not_ready, private_key=KEY, now=now))
    assert res["reason"] == "buyback_not_ready"
    res = asyncio.run(run_buyback(_router(10, 0), ready, private_key=KEY, now=now))
    assert res["reason"] == "pool_below_minimum"
    res = asyncio.run(run_buyback(_router(10**18, now - 10), ready, private_key=KEY, now=now))
    assert res["reason"] == "cooldown"


def _ready_registry() -> FakeContract:
    return FakeContract(
        {
            "buybackReady()": (["bool"], [True]),
            "buybackAdapter()": (["address"], [ADAPTER]),
            "weth()": (["address"], [WETH]),
            "nti()": (["address"], [NTI]),
        }
    )


def test_buyback_uses_active_v3_pool_fee_and_observed_twap_floor() -> None:
    router = _router(10**18, 0)
    contracts = {
        ADAPTER: FakeContract(
            {
                "weth()": (["address"], [WETH]),
                "defaultPoolFee()": (["uint24"], [3000]),
                "v3Factory()": (["address"], [FACTORY]),
            }
        ),
        FACTORY: FakeContract({"getPool(address,address,uint24):" + WETH: (["address"], [POOL])}),
        POOL: FakeContract(
            {"observe(uint32[]):[1800, 0]": (["int56[]", "uint160[]"], [[0, 0], [0, 0]])}
        ),
    }
    result = asyncio.run(
        run_buyback(
            router,
            _ready_registry(),
            at_address=contracts.__getitem__,
            deployment={"buybackAdapterV3": ADAPTER},
            private_key=KEY,
            now=1_000_000,
        )
    )
    assert result["status"] == "ok" and result["adapter_kind"] == "v3"
    calldata = router.sent[0]
    assert calldata[:4] == sel("executeBuyback(uint256,uint256,uint256,bytes)")
    assert abi_decode(["uint256", "uint256", "uint256", "bytes"], calldata[4:]) == (
        200_000_000_000_000_000,
        194_000_000_000_000_000,
        1_000_600,
        (3000).to_bytes(32, "big"),
    )


def test_buyback_v4_encodes_real_pool_key_and_reads_state_view() -> None:
    router = _router(10**18, 0)
    key = (ZERO, NTI, 0x800000, 60, HOOK)
    pool_id = keccak(abi_encode([POOL_KEY], [key]))
    contracts = {
        ADAPTER: FakeContract(
            {
                "weth()": (["address"], [WETH]),
                "ponsHook()": (["address"], [HOOK]),
                "stateView()": (["address"], [STATE_VIEW]),
                "validateRoute(address,bytes):" + NTI: (["bool"], [True]),
            }
        ),
        STATE_VIEW: FakeContract(
            {
                f"getSlot0(bytes32):{pool_id}": (
                    ["uint160", "int24", "uint24", "uint24"],
                    [1 << 97, 0, 0, 3000],
                )
            }
        ),
    }
    result = asyncio.run(
        run_buyback(
            router,
            _ready_registry(),
            at_address=contracts.__getitem__,
            deployment={"buybackAdapterV4": ADAPTER},
            v4_pools_json='[{"currency0":"'
            + ZERO
            + '","currency1":"'
            + NTI
            + '","fee":8388608,"tickSpacing":60,"hooks":"'
            + HOOK
            + '"}]',
            private_key=KEY,
            now=1_000_000,
        )
    )
    assert result["status"] == "ok" and result["adapter_kind"] == "v4"
    _, minimum, _, route_data = abi_decode(
        ["uint256", "uint256", "uint256", "bytes"], router.sent[0][4:]
    )
    assert minimum == 776_000_000_000_000_000
    assert abi_decode([POOL_KEY + "[]"], route_data) == ((key,),)


def test_buyback_never_broadcasts_to_an_unrecognized_active_adapter() -> None:
    router = _router(10**18, 0)
    result = asyncio.run(
        run_buyback(
            router,
            _ready_registry(),
            at_address={}.__getitem__,
            deployment={"buybackAdapterV4": HOOK},
            private_key=KEY,
            now=1_000_000,
        )
    )
    assert result["status"] == "error" and result["reason"] == "unknown_active_adapter"
    assert router.sent == []


def test_grant_round_finalizes_ended_round_then_starts_next() -> None:
    now = 2_000_000
    grants = FakeContract(
        {
            "currentRoundId()": (["uint256"], [3]),
            "rounds(uint256):3": (ROUND_TYPES, [1, 1, 1, now - 5, 0, 1, False]),
        }
    )
    res = asyncio.run(
        manage_grant_round(grants, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert [a["action"] for a in res["actions"]] == ["finalize", "start"]
    assert grants.sent[0][:4] == sel("finalizeRound(uint256)")
    assert grants.sent[1][:4] == sel("startRound(uint64)")


def test_grant_round_waits_while_vote_is_active_and_skips_empty_budget() -> None:
    now = 2_000_000
    active = FakeContract(
        {
            "currentRoundId()": (["uint256"], [1]),
            "rounds(uint256):1": (ROUND_TYPES, [1, 1, 1, now + 500, 0, 0, False]),
        }
    )
    res = asyncio.run(
        manage_grant_round(active, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert res["status"] == "idle" and active.sent == []

    empty = FakeContract({"currentRoundId()": (["uint256"], [0])}, fail_send=True)
    res = asyncio.run(
        manage_grant_round(empty, private_key=KEY, grants_balance_wei=10**15, now=now)
    )
    assert res["actions"][0]["action"] == "start_skipped"


def test_guard_isolates_failures() -> None:
    async def boom() -> dict[str, Any]:
        raise ChainRpcError("rpc down")

    res = asyncio.run(_guard("buyback", boom))
    assert res["status"] == "error" and res["task"] == "buyback"


def test_velocity_alert_rows_threshold_and_flags() -> None:
    at = datetime(2026, 11, 20, 13, 15, tzinfo=UTC)
    rows = velocity_alert_rows(
        1,
        at,
        [
            {"narrative_id": 2, "v_bps": 7450, "v_flag": None},
            {"narrative_id": 3, "v_bps": 9000, "v_flag": "too_small"},
            {"narrative_id": 4, "v_bps": 5000, "v_flag": None},
            {"narrative_id": 5, "v_bps": None, "v_flag": None},
        ],
    )
    assert [r["narrative_id"] for r in rows] == [2]
    assert rows[0]["public_at"] > rows[0]["detected_at"]


class FakeStorage:
    def __init__(self) -> None:
        self.alerts: list[dict[str, Any]] = []

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        filters = filters or {}
        if table == "epochs":
            return [{"epoch_id": 7, "finalized_at": "2026-11-20T13:15:02+00:00"}]
        if table == "narrative_epoch":
            return [{"narrative_id": 2, "v_bps": 8000, "v_flag": None}]
        if table == "radar_alerts":
            nid = int(filters["narrative_id"].split(".")[1])
            at = filters["detected_at"].split("eq.")[1]
            return [a for a in self.alerts if a["narrative_id"] == nid and a["detected_at"] == at]
        return []

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> None:
        self.alerts.extend(rows)


def test_sync_radar_alerts_is_idempotent() -> None:
    st = FakeStorage()
    assert asyncio.run(sync_radar_alerts(st))["created"] == 1
    assert asyncio.run(sync_radar_alerts(st))["created"] == 0
    assert len(st.alerts) == 1


def test_accrue_basket_fees_only_for_stale_baskets() -> None:
    now = 5_000_000
    stale, fresh = "0x" + "aa" * 20, "0x" + "bb" * 20
    factory = FakeContract({"allBaskets()": (["address[]"], [[stale, fresh]])})
    baskets = {
        stale: FakeContract({"lastFeeAccrual()": (["uint256"], [now - 90_000])}),
        fresh: FakeContract({"lastFeeAccrual()": (["uint256"], [now - 100])}),
    }
    res = asyncio.run(accrue_basket_fees(factory, lambda a: baskets[a], private_key=KEY, now=now))
    assert [a["basket"] for a in res["accrued"]] == [stale]
    assert baskets[stale].sent == [sel("accrueFee()")] and baskets[fresh].sent == []


def _basket_fixture(
    weights: list[int], token_balances: list[int], *, fee_shares: int = 0
) -> tuple[FakeContract, FakeContract, dict[str, FakeContract], list[str]]:
    tokens = ["0x" + f"{i:02x}" * 20 for i in (12, 13, 14)]
    pools = ["0x" + f"{i:02x}" * 20 for i in (22, 23, 24)]
    unit = 10**18
    basket_address, fee_router = "0x" + "aa" * 20, "0x" + "bb" * 20
    factory = FakeContract({"allBaskets()": (["address[]"], [[basket_address]])})
    basket = FakeContract(
        {
            "paused()": (["bool"], [False]),
            "lastRebalanceAt()": (["uint64"], [0]),
            "narrativeId()": (["uint8"], [2]),
            "constituents()": (["address[]", "uint16[]"], [tokens, weights]),
            "totalNavWeth()": (["uint256"], [sum(token_balances)]),
            "minPoolLiquidity()": (["uint128"], [unit]),
            "feeRouter()": (["address"], [fee_router]),
            "totalSupply()": (["uint256"], [100 * unit]),
            "lastFeeAccrual()": (["uint64"], [1_000_000]),
            f"balanceOf(address):{fee_router}": (["uint256"], [fee_shares]),
            **{
                f"tokenConfigs(address):{token}": (
                    ["bool", "address", "uint24"],
                    [True, pool, 3000],
                )
                for token, pool in zip(tokens, pools, strict=True)
            },
        }
    )
    contracts = {
        basket_address: basket,
        WETH: FakeContract({f"balanceOf(address):{basket_address}": (["uint256"], [0])}),
        **{
            token: FakeContract(
                {
                    f"balanceOf(address):{basket_address}": (["uint256"], [bal]),
                    "totalSupply()": (["uint256"], [1_000_000 * unit]),
                }
            )
            for token, bal in zip(tokens, token_balances, strict=True)
        },
        **{
            pool: FakeContract(
                {
                    "liquidity()": (["uint128"], [1_000 * unit]),
                    "token0()": (["address"], [WETH]),
                    "token1()": (["address"], [token]),
                    "fee()": (["uint24"], [3000]),
                    "observe(uint32[]):[1800, 0]": (["int56[]", "uint160[]"], [[0, 0], [0, 0]]),
                }
            )
            for token, pool in zip(tokens, pools, strict=True)
        },
    }
    return factory, basket, contracts, tokens


def test_rebalance_uses_verified_pool_data_and_funded_swaps_with_daily_cap() -> None:
    from nti_oracle.keeper_tasks import rebalance_baskets

    unit = 10**18
    factory, basket, contracts, tokens = _basket_fixture(
        [4000, 3000, 3000], [80 * unit, 10 * unit, 10 * unit]
    )
    result = asyncio.run(
        rebalance_baskets(
            factory, contracts.__getitem__, weth_address=WETH, private_key=KEY, now=1_000_000
        )
    )
    assert result["status"] == "ok"
    calldata = basket.sent[0]
    assert calldata[:4] == sel("rebalance(address[],uint16[],(address,address,uint256,uint256)[])")
    targets, weights, swaps = abi_decode(
        ["address[]", "uint16[]", "(address,address,uint256,uint256)[]"], calldata[4:]
    )
    assert targets == tuple(tokens) and weights == (3334, 3333, 3333)
    assert swaps[0] == (tokens[0], WETH, 20 * unit, 19_400_000_000_000_000_000)
    assert sum(s[2] for s in swaps[1:]) == 19_400_000_000_000_000_000
    assert all(s[0] == WETH and s[3] == s[2] * 97 // 100 for s in swaps[1:])


def test_rebalance_skips_trades_when_current_allocation_matches_target() -> None:
    from nti_oracle.keeper_tasks import rebalance_baskets

    unit = 10**18
    factory, basket, contracts, _ = _basket_fixture([3334, 3333, 3333], [unit, unit, unit])
    result = asyncio.run(
        rebalance_baskets(
            factory, contracts.__getitem__, weth_address=WETH, private_key=KEY, now=1_000_000
        )
    )
    assert result["status"] == "idle" and basket.sent == []


def test_redeem_basket_fees_passes_real_proportional_twap_floor() -> None:
    from nti_oracle.keeper_tasks import redeem_basket_fees

    unit = 10**18
    factory, _, contracts, _ = _basket_fixture(
        [3334, 3333, 3333], [5 * unit, 3 * unit, 2 * unit], fee_shares=unit
    )
    router = FakeContract({})
    result = asyncio.run(
        redeem_basket_fees(
            factory,
            router,
            contracts.__getitem__,
            fee_router_address="0x" + "bb" * 20,
            weth_address=WETH,
            private_key=KEY,
            now=1_000_000,
        )
    )
    assert result["status"] == "ok"
    tx = router.sent[0]
    assert tx[:4] == sel("redeemBasketFees(address,uint256,uint256)")
    assert abi_decode(["address", "uint256", "uint256"], tx[4:]) == (
        "0x" + "aa" * 20,
        unit,
        97_000_000_000_000_000,
    )
