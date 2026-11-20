"""DexScreener enrichment for liquidity and activity of Robinhood Chain tokens.

Post-graduation Pons pools are Uniswap v4 pools whose pair token is not always WETH, so on-chain ETH
depth is not directly readable. DexScreener exposes USD liquidity and 24h transaction counts; ETH
depth is USD liquidity divided by the WETH/USD price. If the API is unavailable the runner keeps
prior values.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx

DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/tokens/v1/robinhood/{addresses}"
BATCH_SIZE = 30


@dataclass(frozen=True, slots=True)
class TokenMarket:
    address: str
    pool: str | None
    liquidity_usd: Decimal
    txs_24h: int


def parse_pairs(pairs: Sequence[dict[str, Any]]) -> dict[str, TokenMarket]:
    """Best pair per base token (highest USD liquidity)."""
    best: dict[str, TokenMarket] = {}
    for pair in pairs:
        if pair.get("chainId") != "robinhood":
            continue
        base = str((pair.get("baseToken") or {}).get("address", "")).lower()
        if not base:
            continue
        liquidity = Decimal(str((pair.get("liquidity") or {}).get("usd") or 0))
        h24 = (pair.get("txns") or {}).get("h24") or {}
        market = TokenMarket(
            address=base,
            pool=str(pair["pairAddress"]).lower() if pair.get("pairAddress") else None,
            liquidity_usd=liquidity,
            txs_24h=int(h24.get("buys", 0)) + int(h24.get("sells", 0)),
        )
        if base not in best or market.liquidity_usd > best[base].liquidity_usd:
            best[base] = market
    return best


def weth_price_usd(pairs: Sequence[dict[str, Any]], weth: str) -> Decimal | None:
    """USD price of WETH from its deepest pair where WETH is the base token."""
    weth_lc = weth.lower()
    candidates = [
        p
        for p in pairs
        if str((p.get("baseToken") or {}).get("address", "")).lower() == weth_lc
        and p.get("priceUsd")
    ]
    if not candidates:
        return None
    top = max(candidates, key=lambda p: Decimal(str((p.get("liquidity") or {}).get("usd") or 0)))
    price = Decimal(str(top["priceUsd"]))
    return price if price > 0 else None


def liquidity_eth(market: TokenMarket, eth_usd: Decimal) -> Decimal:
    return (market.liquidity_usd / eth_usd) if eth_usd > 0 else Decimal(0)


class DexScreenerClient:
    def __init__(self, timeout: float = 20.0) -> None:
        self._timeout = timeout

    async def _fetch(self, addresses: Sequence[str]) -> list[dict[str, Any]]:
        url = DEXSCREENER_TOKENS_URL.format(addresses=",".join(addresses))
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        return list(data) if isinstance(data, list) else []

    async def markets(self, addresses: Sequence[str]) -> dict[str, TokenMarket]:
        out: dict[str, TokenMarket] = {}
        for i in range(0, len(addresses), BATCH_SIZE):
            out.update(parse_pairs(await self._fetch(addresses[i : i + BATCH_SIZE])))
        return out

    async def eth_usd(self, weth: str) -> Decimal | None:
        return weth_price_usd(await self._fetch([weth]), weth)
