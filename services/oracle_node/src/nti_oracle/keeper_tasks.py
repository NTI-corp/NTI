"""Keeper automation: market settlement, fee distribution, buyback, grant rounds, Radar alerts.

Every task is idempotent and safe to run hourly: it inspects on-chain state first and only sends a
transaction when the action is currently possible. A failing task never blocks the others.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from eth_abi import decode as abi_decode
from nti_core.types import EpochStatus

from nti_oracle.chain import ChainRpcError
from nti_oracle.keeper_baskets import rebalance_baskets as rebalance_baskets
from nti_oracle.keeper_baskets import redeem_basket_fees as redeem_basket_fees
from nti_oracle.keeper_buyback import RouteUnavailable, resolve_buyback
from nti_oracle.keeper_chain import ContractAt, ContractCaller
from nti_oracle.keeper_chain import encode_call as _enc
from nti_oracle.keeper_chain import uint as _uint

STATUS_FINAL = 3
STATUS_INCOMPLETE = 4
BUYBACK_COOLDOWN_SECONDS = 300
MIN_DISTRIBUTE_WEI = 10**9
MIN_BUYBACK_WEI = 10**12
MIN_GRANT_BUDGET_WEI = 10**12
DEFAULT_GRANT_ROUND_SECONDS = 14 * 24 * 3600


async def _guard(name: str, fn: Callable[[], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
    """Run one task; convert chain errors into a result so other tasks still run."""
    try:
        return await fn()
    except Exception as exc:  # noqa: BLE001 - one failing task must never block the others
        return {"task": name, "status": "error", "error": str(exc)[:300]}


async def settle_markets(
    market: ContractCaller,
    oracle: ContractCaller,
    *,
    private_key: str,
    now: int | None = None,
) -> dict[str, Any]:
    """Settle every open market whose settle epoch is final/incomplete or timed out."""
    now = now or int(time.time())
    next_id = await _uint(market, "nextMarketId()")
    settle_timeout = await _uint(market, "SETTLE_TIMEOUT()")  # configurable on-chain
    settled: list[dict[str, Any]] = []
    for market_id in range(1, next_id):
        raw = await market._call("markets(uint256)", ["uint256"], [market_id])
        fields = abi_decode(
            [
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
            ],
            raw,
        )
        settle_epoch, is_settled = int(fields[3]), bool(fields[11])
        if is_settled:
            continue
        status = int(
            abi_decode(
                ["uint8"], await oracle._call("epochStatus(uint32)", ["uint32"], [settle_epoch])
            )[0]
        )
        boundary = int(
            abi_decode(
                ["uint64"], await oracle._call("epochBoundary(uint32)", ["uint32"], [settle_epoch])
            )[0]
        )
        timed_out = status != STATUS_FINAL and now > boundary + settle_timeout
        if status in (STATUS_FINAL, STATUS_INCOMPLETE) or timed_out:
            tx = await market._send_tx(
                private_key, _enc("settle(uint256)", ["uint256"], [market_id])
            )
            settled.append({"market_id": market_id, "tx_hash": tx})
    return {"task": "settle_markets", "status": "ok", "settled": settled}


async def distribute_fees(fee_router: ContractCaller, *, private_key: str) -> dict[str, Any]:
    """Split undistributed ETH 40/30/20/10 and flush any buffered staking share."""
    undistributed = await _uint(fee_router, "undistributedBalance()")
    pending = await _uint(fee_router, "pendingStakingETH()")
    if undistributed < MIN_DISTRIBUTE_WEI and pending == 0:
        return {"task": "distribute_fees", "status": "idle", "undistributed_wei": undistributed}
    tx = await fee_router._send_tx(private_key, _enc("distribute()", [], []))
    return {
        "task": "distribute_fees",
        "status": "ok",
        "tx_hash": tx,
        "undistributed_wei": undistributed,
    }


async def run_buyback(
    fee_router: ContractCaller,
    registry: ContractCaller,
    *,
    private_key: str,
    now: int | None = None,
    at_address: ContractAt | None = None,
    deployment: Mapping[str, str] | None = None,
    v4_pools_json: str | None = None,
) -> dict[str, Any]:
    """Execute one rate-limited buyback-and-burn when the registry reports an active adapter."""
    now = now or int(time.time())
    ready = abi_decode(["bool"], await registry._call("buybackReady()", [], []))[0]
    if not ready:
        return {"task": "buyback", "status": "idle", "reason": "buyback_not_ready"}
    pool = await _uint(fee_router, "buybackPool()")
    max_per_call = await _uint(fee_router, "maxPerCall()")
    last = await _uint(fee_router, "lastBuybackAt()")
    amount = min(pool, max_per_call)
    if amount < MIN_BUYBACK_WEI:
        return {
            "task": "buyback",
            "status": "idle",
            "reason": "pool_below_minimum",
            "pool_wei": pool,
        }
    if last and now < last + BUYBACK_COOLDOWN_SECONDS:
        return {"task": "buyback", "status": "idle", "reason": "cooldown"}
    if at_address is None or deployment is None:
        return {"task": "buyback", "status": "error", "reason": "route_configuration_missing"}
    try:
        route = await resolve_buyback(registry, at_address, deployment, amount, v4_pools_json)
    except RouteUnavailable as exc:
        return {"task": "buyback", "status": "error", "reason": str(exc)}
    calldata = _enc(
        "executeBuyback(uint256,uint256,uint256,bytes)",
        ["uint256", "uint256", "uint256", "bytes"],
        [amount, route.min_out, now + 600, route.data],
    )
    tx = await fee_router._send_tx(private_key, calldata)
    return {
        "task": "buyback",
        "status": "ok",
        "tx_hash": tx,
        "amount_wei": amount,
        "min_out": route.min_out,
        "adapter_kind": route.kind,
    }


async def manage_grant_round(
    grants: ContractCaller,
    *,
    private_key: str,
    grants_balance_wei: int,
    round_seconds: int = DEFAULT_GRANT_ROUND_SECONDS,
    now: int | None = None,
) -> dict[str, Any]:
    """Finalize an ended round, then open the next one when budget is available."""
    now = now or int(time.time())
    actions: list[dict[str, Any]] = []
    round_id = await _uint(grants, "currentRoundId()")
    finalized = True
    if round_id > 0:
        raw = await grants._call("rounds(uint256)", ["uint256"], [round_id])
        _budget, _snap, _started, ends_at, _votes, _count, finalized = abi_decode(
            ["uint256", "uint64", "uint64", "uint64", "uint256", "uint256", "bool"], raw
        )
        if not finalized and now >= int(ends_at):
            tx = await grants._send_tx(
                private_key, _enc("finalizeRound(uint256)", ["uint256"], [round_id])
            )
            actions.append({"action": "finalize", "round_id": round_id, "tx_hash": tx})
            finalized = True
    if finalized and grants_balance_wei >= MIN_GRANT_BUDGET_WEI:
        try:
            tx = await grants._send_tx(
                private_key, _enc("startRound(uint64)", ["uint64"], [round_seconds])
            )
            actions.append({"action": "start", "round_id": round_id + 1, "tx_hash": tx})
        except ChainRpcError as exc:
            # NoAvailableBudget when everything is already reserved by unclaimed rounds.
            if "NoAvailableBudget" not in str(exc):
                raise
            actions.append({"action": "start_skipped", "reason": "NoAvailableBudget"})
    return {"task": "grant_round", "status": "ok" if actions else "idle", "actions": actions}


async def accrue_basket_fees(
    factory: ContractCaller,
    basket_at: Callable[[str], ContractCaller],
    *,
    private_key: str,
    now: int | None = None,
    interval_seconds: int = 24 * 3600,
) -> dict[str, Any]:
    """Mint the pending management fee for every basket that has not accrued within a day."""
    now = now or int(time.time())
    raw = await factory._call("allBaskets()", [], [])
    baskets = [str(a) for a in abi_decode(["address[]"], raw)[0]]
    accrued: list[dict[str, Any]] = []
    for address in baskets:
        basket = basket_at(address)
        last = await _uint(basket, "lastFeeAccrual()")
        if now - last < interval_seconds:
            continue
        tx = await basket._send_tx(private_key, _enc("accrueFee()", [], []))
        accrued.append({"basket": address, "tx_hash": tx})
    return {
        "task": "accrue_basket_fees",
        "status": "ok",
        "baskets": len(baskets),
        "accrued": accrued,
    }


def velocity_alert_rows(
    epoch_id: int,
    epoch_finalized_at: datetime,
    narratives: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Radar rows for a final epoch (V_n > 5000 bps, no suppression flag).

    detected_at is the epoch finalization time, so reruns produce identical rows.
    """
    from nti_discovery.token_radar import NarrativeVelocityInput, generate_velocity_alerts

    inputs = [
        NarrativeVelocityInput(
            narrative_id=int(n["narrative_id"]),
            v_bps=None if n.get("v_bps") is None else int(n["v_bps"]),
            v_flag=n.get("v_flag"),
        )
        for n in narratives
    ]
    alerts = generate_velocity_alerts(
        inputs, epoch_status=EpochStatus.FINAL, detected_at=epoch_finalized_at
    )
    return [
        {
            "kind": a.kind,
            "narrative_id": a.narrative_id,
            "v_bps": a.v_bps,
            "token": None,
            "detected_at": a.detected_at.isoformat(),
            "public_at": a.public_at.isoformat(),
        }
        for a in alerts
    ]


async def sync_radar_alerts(storage: Any, *, limit_epochs: int = 3) -> dict[str, Any]:
    """Create missing velocity alerts for the latest final epochs (idempotent)."""
    epochs = await storage.select(
        "epochs",
        columns="epoch_id,finalized_at",
        filters={"status": "eq.final"},
        order="epoch_id.desc",
        limit=limit_epochs,
    )
    created = 0
    for ep in epochs:
        if not ep.get("finalized_at"):
            continue
        finalized_at = datetime.fromisoformat(str(ep["finalized_at"]).replace("Z", "+00:00"))
        if finalized_at.tzinfo is None:
            finalized_at = finalized_at.replace(tzinfo=UTC)
        narratives = await storage.select(
            "narrative_epoch",
            columns="narrative_id,v_bps,v_flag",
            filters={"epoch_id": f"eq.{int(ep['epoch_id'])}"},
        )
        for row in velocity_alert_rows(int(ep["epoch_id"]), finalized_at, narratives):
            existing = await storage.select(
                "radar_alerts",
                columns="id",
                filters={
                    "kind": "eq.velocity",
                    "narrative_id": f"eq.{row['narrative_id']}",
                    "detected_at": f"eq.{row['detected_at']}",
                },
                limit=1,
            )
            if existing:
                continue
            await storage.upsert("radar_alerts", [row])
            created += 1
    return {"task": "radar_alerts", "status": "ok", "created": created}


def decimal_wei_to_eth(wei: int) -> str:
    return str(Decimal(wei) / Decimal(10**18))
