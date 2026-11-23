"""Resolve buyback routes against the registry, deployment manifest and pool observations."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass

from eth_abi import encode as abi_encode
from eth_utils import is_address, keccak

from nti_oracle.keeper_chain import (
    ZERO_ADDRESS,
    ContractAt,
    ContractCaller,
    address,
    quote_at_price,
    read,
    slippage_floor,
    twap_sqrt_price,
    uint,
)

POOL_KEY_TYPE = "(address,address,uint24,int24,address)"


class RouteUnavailable(ValueError):
    """The current deployment or current pool cannot provide a protected buyback."""


@dataclass(frozen=True, slots=True)
class BuybackRoute:
    kind: str
    min_out: int
    data: bytes


def _v4_pool_key(
    configured_pools_json: str | None, weth: str, nti: str, pons_hook: str
) -> tuple[str, str, int, int, str]:
    if not configured_pools_json:
        raise RouteUnavailable("v4_pool_key_required")
    try:
        pools = json.loads(configured_pools_json)
        # The deployed adapter only accepts a usable single native-ETH or WETH -> NTI hop.
        if not isinstance(pools, list) or len(pools) != 1 or not isinstance(pools[0], dict):
            raise ValueError("exactly one pool key is required")
        pool = pools[0]
        c0, c1, hook = (str(pool[name]).lower() for name in ("currency0", "currency1", "hooks"))
        fee, spacing = pool["fee"], pool["tickSpacing"]
        if (
            not all(is_address(a) for a in (c0, c1, hook))
            or not c0 < c1
            or {c0, c1} not in ({ZERO_ADDRESS, nti}, {weth, nti})
            or hook != pons_hook
            or hook == ZERO_ADDRESS
            or type(fee) is not int
            or not 0 <= fee < 1 << 24
            or type(spacing) is not int
            or not 0 < spacing < 1 << 23
        ):
            raise ValueError("pool key does not match the deployed adapter")
        return c0, c1, fee, spacing, hook
    except (TypeError, KeyError, ValueError) as exc:
        raise RouteUnavailable("invalid_v4_pool_key") from exc


async def resolve_buyback(
    registry: ContractCaller,
    at_address: ContractAt,
    deployment: Mapping[str, str],
    amount: int,
    v4_pools_json: str | None,
) -> BuybackRoute:
    active = await address(registry, "buybackAdapter()")
    kinds = [
        kind
        for kind in ("V3", "V4")
        if active != ZERO_ADDRESS and deployment.get(f"buybackAdapter{kind}", "").lower() == active
    ]
    if len(kinds) != 1:
        raise RouteUnavailable("unknown_active_adapter")

    adapter = at_address(active)
    weth, nti = await address(registry, "weth()"), await address(registry, "nti()")
    if (
        weth in (ZERO_ADDRESS, nti)
        or nti == ZERO_ADDRESS
        or await address(adapter, "weth()") != weth
    ):
        raise RouteUnavailable("adapter_registry_mismatch")

    if kinds[0] == "V3":
        factory = await address(adapter, "v3Factory()")
        fee = await uint(adapter, "defaultPoolFee()")
        (pool,) = await read(
            at_address(factory),
            "getPool(address,address,uint24)",
            ["address"],
            ["address", "address", "uint24"],
            [weth, nti, fee],
        )
        if pool == ZERO_ADDRESS:
            raise RouteUnavailable("v3_pool_not_found")
        price = await twap_sqrt_price(at_address(pool))
        quote = quote_at_price(price, amount, weth, nti)
        route_data = abi_encode(["uint24"], [fee])
    else:
        hook = await address(adapter, "ponsHook()")
        key = _v4_pool_key(v4_pools_json, weth, nti, hook)
        route_data = abi_encode([POOL_KEY_TYPE + "[]"], [[key]])
        (valid,) = await read(
            adapter,
            "validateRoute(address,bytes)",
            ["bool"],
            ["address", "bytes"],
            [nti, route_data],
        )
        if not valid:
            raise RouteUnavailable("adapter_rejected_v4_route")
        state_view = await address(adapter, "stateView()")
        pool_id = keccak(abi_encode([POOL_KEY_TYPE], [key]))
        price, *_ = await read(
            at_address(state_view),
            "getSlot0(bytes32)",
            ["uint160", "int24", "uint24", "uint24"],
            ["bytes32"],
            [pool_id],
        )
        if not price:
            raise RouteUnavailable("v4_pool_uninitialized")
        start_currency = ZERO_ADDRESS if key[0] == ZERO_ADDRESS else weth
        quote = quote_at_price(price, amount, start_currency, nti)
    minimum = slippage_floor(quote)
    if not minimum or (kinds[0] == "V4" and max(amount, minimum) >= 1 << 128):
        raise RouteUnavailable("buyback_quote_out_of_range")
    return BuybackRoute(kinds[0].lower(), minimum, route_data)
