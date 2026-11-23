"""Daily basket maintenance based on registered constituent pools and on-chain balances."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from math import isqrt
from typing import Any

from nti_oracle.keeper_chain import (
    BPS,
    Q96,
    ZERO_ADDRESS,
    ContractAt,
    ContractCaller,
    address,
    balance_of,
    encode_call,
    quote_at_price,
    read,
    slippage_floor,
    twap_sqrt_price,
    uint,
)

DAY_SECONDS = 86_400
MAX_WEIGHT_BPS = 4_000
MAX_TURNOVER_BPS = 2_000
DRIFT_BPS = 50
MIN_TRADE_WEI = 10**12
MGMT_FEE_BPS = 50
SWAP_ARRAY_TYPE = "(address,address,uint256,uint256)[]"
Swap = tuple[str, str, int, int]


@dataclass(frozen=True, slots=True)
class Asset:
    token: str
    balance: int
    sqrt_price: int
    score: int

    def value(self, weth: str) -> int:
        return quote_at_price(self.sqrt_price, self.balance, self.token, weth)


async def _maintain_baskets(
    task: str,
    factory: ContractCaller,
    operation: Callable[[str], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    (baskets,) = await read(factory, "allBaskets()", ["address[]"])
    entries = []
    for basket in baskets:
        try:
            result = await operation(basket)
        except Exception as exc:  # noqa: BLE001 - one bad basket must not block the fleet.
            result = {"status": "error", "error": str(exc)[:300]}
        entries.append({"basket": basket, **result})
    statuses = {entry["status"] for entry in entries}
    status = "error" if "error" in statuses else "ok" if "ok" in statuses else "idle"
    return {"task": task, "status": status, "baskets": len(baskets), "results": entries}


def _idle(reason: str) -> dict[str, str]:
    return {"status": "idle", "reason": reason}


async def _constituents(basket: ContractCaller) -> tuple[tuple[str, ...], tuple[int, ...]]:
    tokens, weights = await read(basket, "constituents()", ["address[]", "uint16[]"])
    return tokens, weights


async def _token_config(basket: ContractCaller, token: str) -> tuple[bool, str, int]:
    return await read(
        basket, "tokenConfigs(address)", ["bool", "address", "uint24"], ["address"], [token]
    )


def _proportional_weights(values: Mapping[str, int], total: int) -> dict[str, int]:
    if not values or not total:
        return dict.fromkeys(values, 0)
    divisor = sum(values.values())
    shares, remainders = {}, {}
    for token, value in values.items():
        shares[token], remainders[token] = divmod(value * total, divisor)
    unused = total - sum(shares.values())
    for token in sorted(values, key=lambda token: (-remainders[token], token))[:unused]:
        shares[token] += 1
    return shares


def _target_weights(scores: Mapping[str, int]) -> dict[str, int]:
    """Distribute all 10,000 bps, with a positive allocation and a 40% cap per token."""
    remaining = dict(scores)
    weights = {}
    available = BPS
    while remaining:
        # Reserve one basis point for each eligible asset so small assets remain redeemable.
        proposed = _proportional_weights(remaining, available - len(remaining))
        capped = [token for token, weight in proposed.items() if weight + 1 > MAX_WEIGHT_BPS]
        if not capped:
            weights.update({token: weight + 1 for token, weight in proposed.items()})
            break
        for token in capped:
            weights[token] = MAX_WEIGHT_BPS
            available -= MAX_WEIGHT_BPS
            del remaining[token]
    return weights


async def _eligible_asset(
    basket: ContractCaller,
    at_address: ContractAt,
    basket_address: str,
    token: str,
    weth: str,
    min_liquidity: int,
) -> Asset | None:
    whitelisted, pool_address, fee = await _token_config(basket, token)
    if not whitelisted or pool_address == ZERO_ADDRESS:
        return None
    pool = at_address(pool_address)
    token0, token1 = await address(pool, "token0()"), await address(pool, "token1()")
    if {token0, token1} != {token, weth} or await uint(pool, "fee()") != fee:
        return None
    liquidity = await uint(pool, "liquidity()")
    if liquidity == 0 or liquidity < min_liquidity:
        return None
    sqrt_price = await twap_sqrt_price(pool)
    erc20 = at_address(token)
    supply = await uint(erc20, "totalSupply()")
    fully_diluted_weth = quote_at_price(sqrt_price, supply, token, weth)
    # Estimate active WETH depth from the pool's liquidity and price using V3 virtual reserves.
    virtual_weth = liquidity * Q96 // sqrt_price if weth < token else liquidity * sqrt_price // Q96
    score = isqrt(fully_diluted_weth * virtual_weth)
    if not score:
        return None
    return Asset(token, await balance_of(erc20, basket_address), sqrt_price, score)


def _rebalance_swaps(
    assets: Sequence[Asset], weights: Mapping[str, int], weth: str, nav: int, idle_weth: int
) -> list[Swap]:
    values = {asset.token: asset.value(weth) for asset in assets}
    investable = sum(values.values()) + idle_weth
    drift_threshold = max(MIN_TRADE_WEI, investable * DRIFT_BPS // BPS)
    target = _proportional_weights(weights, investable)
    deltas = {token: target[token] - value for token, value in values.items()}
    deficits = {token: delta for token, delta in deltas.items() if delta >= drift_threshold}
    if not deficits:
        return []

    swaps: list[Swap] = []
    max_turnover = nav * MAX_TURNOVER_BPS // BPS
    sell_budget = min(max_turnover, max(0, sum(deficits.values()) - idle_weth))
    available_weth = idle_weth
    for asset in sorted(assets, key=lambda asset: (deltas[asset.token], asset.token)):
        value = min(-deltas[asset.token], sell_budget)
        if value < drift_threshold:
            break
        quantity = min(asset.balance, quote_at_price(asset.sqrt_price, value, weth, asset.token))
        expected = quote_at_price(asset.sqrt_price, quantity, asset.token, weth)
        minimum = slippage_floor(expected)
        if quantity and minimum:
            swaps.append((asset.token, weth, quantity, minimum))
            sell_budget -= expected
            available_weth += minimum

    buy_budget = min(max_turnover, available_weth, sum(deficits.values()))
    if buy_budget < MIN_TRADE_WEI:
        return []
    buy_values = _proportional_weights(deficits, buy_budget)
    buys = []
    for asset in assets:
        amount_in = buy_values.get(asset.token, 0)
        if amount_in >= MIN_TRADE_WEI:
            minimum = slippage_floor(quote_at_price(asset.sqrt_price, amount_in, weth, asset.token))
            if minimum:
                buys.append((weth, asset.token, amount_in, minimum))
    return swaps + buys if buys else []


async def rebalance_baskets(
    factory: ContractCaller,
    at_address: ContractAt,
    *,
    weth_address: str,
    private_key: str,
    now: int | None = None,
    allocation_index: Mapping[int, int] | None = None,
) -> dict[str, Any]:
    """Rebalance current approved constituents, conserving WETH and ignoring minor drift."""
    now = now if now is not None else int(time.time())
    weth = weth_address.lower()

    async def rebalance(basket_address: str) -> dict[str, Any]:
        basket = at_address(basket_address)
        (paused,) = await read(basket, "paused()", ["bool"])
        if paused:
            return _idle("paused")
        last = await uint(basket, "lastRebalanceAt()")
        if last and now < last + DAY_SECONDS:
            return _idle("cooldown")
        tokens, prior = await _constituents(basket)
        if len(tokens) * MAX_WEIGHT_BPS < BPS:
            return _idle("insufficient_constituents")
        nav = await uint(basket, "totalNavWeth()")
        if nav < MIN_TRADE_WEI:
            return _idle("nav_below_minimum")
        if len(tokens) != len(prior) or len(set(tokens)) != len(tokens) or sum(prior) != BPS:
            raise ValueError("Invalid existing basket allocation")

        min_liquidity = await uint(basket, "minPoolLiquidity()")
        assets = []
        for token in tokens:
            asset = await _eligible_asset(
                basket, at_address, basket_address, token, weth, min_liquidity
            )
            if asset is None:
                return {"status": "error", "reason": "ineligible_constituent", "token": token}
            assets.append(asset)
        target = _target_weights({asset.token: asset.score for asset in assets})
        narrative_id = await uint(basket, "narrativeId()")
        index_bps = (allocation_index or {}).get(narrative_id)
        if index_bps is not None:
            # Let higher published mindshare advance changes to the liquidity-driven target faster.
            # The old and new weights both honor the cap, so their convex combination does too.
            if not 0 <= index_bps <= BPS:
                raise ValueError("Allocation index outside basis-point range")
            blend = (BPS + index_bps) // 2
            target = _proportional_weights(
                {
                    token: (BPS - blend) * weight + blend * target[token]
                    for token, weight in zip(tokens, prior, strict=True)
                },
                BPS,
            )
        weights = tuple(target[token] for token in tokens)
        swaps = _rebalance_swaps(
            assets, target, weth, nav, await balance_of(at_address(weth), basket_address)
        )
        if (
            not swaps
            and max(abs(old - new) for old, new in zip(prior, weights, strict=True)) < DRIFT_BPS
        ):
            return _idle("within_target_tolerance")
        tx = await basket._send_tx(
            private_key,
            encode_call(
                f"rebalance(address[],uint16[],{SWAP_ARRAY_TYPE})",
                ["address[]", "uint16[]", SWAP_ARRAY_TYPE],
                [tokens, weights, swaps],
            ),
        )
        return {
            "status": "ok",
            "tx_hash": tx,
            "narrative_id": narrative_id,
            "index_bps": index_bps,
            "targets": dict(zip(tokens, weights, strict=True)),
            "swaps": len(swaps),
        }

    return await _maintain_baskets("rebalance_baskets", factory, rebalance)


async def redeem_basket_fees(
    factory: ContractCaller,
    fee_router: ContractCaller,
    at_address: ContractAt,
    *,
    fee_router_address: str,
    weth_address: str,
    private_key: str,
    now: int | None = None,
) -> dict[str, Any]:
    """Liquidate fee-router shares with the same proportional asset/TWAP math as Basket.redeem."""
    now = now if now is not None else int(time.time())
    router_address, weth = fee_router_address.lower(), weth_address.lower()

    async def redeem(basket_address: str) -> dict[str, Any]:
        basket = at_address(basket_address)
        if await address(basket, "feeRouter()") != router_address:
            return {"status": "error", "reason": "fee_router_mismatch"}
        shares = await balance_of(basket, router_address)
        if not shares:
            return _idle("no_fee_shares")
        supply = await uint(basket, "totalSupply()")
        last_fee = await uint(basket, "lastFeeAccrual()")
        # redeem() accrues again before it measures each share's backing.
        supply += supply * MGMT_FEE_BPS * max(0, now - last_fee) // (BPS * 365 * DAY_SECONDS)
        if shares > supply:
            raise ValueError("Fee share balance exceeds issued shares")
        tokens, _ = await _constituents(basket)
        native_floor = await balance_of(at_address(weth), basket_address) * shares // supply
        for token in tokens:
            quantity = await balance_of(at_address(token), basket_address) * shares // supply
            if not quantity:
                continue
            _, pool, _ = await _token_config(basket, token)
            price = await twap_sqrt_price(at_address(pool))
            native_floor += slippage_floor(quote_at_price(price, quantity, token, weth))
        if native_floor < MIN_TRADE_WEI:
            return _idle("redemption_below_minimum")
        tx = await fee_router._send_tx(
            private_key,
            encode_call(
                "redeemBasketFees(address,uint256,uint256)",
                ["address", "uint256", "uint256"],
                [basket_address, shares, native_floor],
            ),
        )
        return {"status": "ok", "tx_hash": tx, "shares": shares, "min_eth_out": native_floor}

    return await _maintain_baskets("redeem_basket_fees", factory, redeem)
