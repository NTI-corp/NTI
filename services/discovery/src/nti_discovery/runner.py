"""Token discovery runner: Pons launches/graduations -> ``tokens`` table and Radar new-token alerts.

Idempotent and checkpointed: the scanned block range is only committed after the rows were written,
so a failed run is simply retried over the same range.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

from nti_discovery import pons
from nti_discovery.dex import DexScreenerClient, TokenMarket, liquidity_eth
from nti_discovery.token_labeler import TokenLabeler
from nti_discovery.token_radar import (
    DiscoveredToken,
    generate_new_token_alerts,
    infer_token_narrative,
)

RECENT_DAYS = 7
MAX_ENRICH = 200
MAX_NARRATIVE_LOOKUPS = 50
POSTS_PER_TOKEN = 50
RISING_V_BPS = 1_000
LABEL_MIN_LIQUIDITY_ETH = Decimal(1)
MAX_LABELS_PER_RUN = 20


class Storage(Protocol):
    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]: ...

    async def upsert(
        self, table: str, rows: list[dict[str, Any]], on_conflict: str | None = None
    ) -> Any: ...


class MarketSource(Protocol):
    async def markets(self, addresses: list[str]) -> dict[str, TokenMarket]: ...

    async def eth_usd(self, weth: str) -> Decimal | None: ...


@dataclass(frozen=True, slots=True)
class DiscoveryConfig:
    factory: str = pons.MAINNET_FACTORY
    weth: str = pons.MAINNET_WETH
    log_range: int = 2_000
    lookback_blocks: int = 30_000
    max_blocks_per_run: int = 300_000
    scan_concurrency: int = 1
    ecosystem_path: Path | None = None
    rising_v_bps: int = RISING_V_BPS
    state_path: Path | None = None


def to_pg_bytea(address: str) -> str:
    return "\\x" + address.lower().removeprefix("0x")


def from_pg_bytea(value: str | None) -> str | None:
    if not value:
        return None
    return "0x" + value.removeprefix("\\x").lower()


def _row_to_token(row: dict[str, Any]) -> DiscoveredToken:
    created = row.get("created_at")
    last = row.get("last_activity_at")
    return DiscoveredToken(
        address=str(from_pg_bytea(row["address"])),
        symbol=str(row.get("symbol") or ""),
        name=str(row.get("name") or ""),
        created_at=datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        if created
        else datetime.now(UTC),
        source=str(row.get("source") or "pons_v2"),
        graduated=bool(row.get("graduated")),
        pool=from_pg_bytea(row.get("pool")),
        liquidity_eth=Decimal(str(row.get("liquidity_eth") or 0)),
        narrative_id=row.get("narrative_id"),
        txs_7d=int(row.get("txs_7d") or 0),
        last_activity_at=datetime.fromisoformat(str(last).replace("Z", "+00:00")) if last else None,
    )


def _token_to_row(tok: DiscoveredToken) -> dict[str, Any]:
    return {
        "address": to_pg_bytea(tok.address),
        "symbol": tok.symbol,
        "name": tok.name,
        "created_at": tok.created_at.astimezone(UTC).isoformat(),
        "source": tok.source,
        "graduated": tok.graduated,
        "pool": to_pg_bytea(tok.pool) if tok.pool else None,
        "liquidity_eth": str(tok.liquidity_eth),
        "narrative_id": tok.narrative_id,
        "txs_7d": tok.txs_7d,
        "last_activity_at": tok.last_activity_at.astimezone(UTC).isoformat()
        if tok.last_activity_at
        else None,
    }


def ecosystem_tokens(
    entries: list[dict[str, Any]],
    markets: dict[str, TokenMarket],
    eth_usd: Decimal,
    existing: dict[str, DiscoveredToken],
    now: datetime,
) -> list[DiscoveredToken]:
    """Curated ecosystem tokens with live liquidity and activity from DexScreener.

    Only the narrative is curated; a token with no market data keeps its previous numbers (or zero),
    so a DexScreener outage never invents liquidity. created_at is when the token was first seen.
    """
    out: list[DiscoveredToken] = []
    for entry in entries:
        address = str(entry["address"]).lower()
        prior = existing.get(address)
        market = markets.get(address)
        liquidity = (
            liquidity_eth(market, eth_usd).quantize(Decimal("0.0001"))
            if market and eth_usd > 0
            else (prior.liquidity_eth if prior else Decimal(0))
        )
        out.append(
            DiscoveredToken(
                address=address,
                symbol=str(entry["symbol"]),
                name=str(entry.get("name") or entry["symbol"]),
                created_at=prior.created_at if prior else now,
                source="uniswap",
                graduated=True,
                pool=(market.pool if market and market.pool else (prior.pool if prior else None)),
                liquidity_eth=liquidity,
                narrative_id=int(entry["narrative_id"]),
                txs_7d=max(prior.txs_7d if prior else 0, market.txs_24h if market else 0),
                last_activity_at=now
                if market and market.txs_24h
                else (prior.last_activity_at if prior else None),
            )
        )
    return out


class DiscoveryRunner:
    def __init__(
        self,
        rpc: pons.Rpc,
        storage: Storage,
        market: MarketSource | None,
        config: DiscoveryConfig,
        *,
        now: datetime | None = None,
        labeler: TokenLabeler | None = None,
    ) -> None:
        self._rpc = rpc
        self._storage = storage
        self._market = market
        self._cfg = config
        self._now = now or datetime.now(UTC)
        self._labeler = labeler
        self._label_attempts: set[str] = set()

    # --- name/symbol labels -----------------------------------------------------------------

    def _labeled_path(self) -> Path | None:
        path = self._cfg.state_path
        return None if path is None else path.with_name("discovery-labeled.json")

    def _load_label_attempts(self) -> set[str]:
        path = self._labeled_path()
        if path is None or not path.exists():
            return set(self._label_attempts)
        try:
            return {str(a) for a in json.loads(path.read_text())}
        except (ValueError, OSError, TypeError):
            return set(self._label_attempts)

    def _save_label_attempts(self, attempts: set[str]) -> None:
        self._label_attempts = attempts
        path = self._labeled_path()
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(sorted(attempts)))
        tmp.replace(path)

    async def _label_by_name(self, tokens: dict[str, DiscoveredToken]) -> int:
        """Label unattributed tokens that cleared the Radar liquidity bar, from name and symbol.

        Each token is asked once. A model failure leaves it for the next run; a "none" answer
        is remembered.
        """
        if self._labeler is None:
            return 0
        attempts = self._load_label_attempts()
        due = [
            t
            for t in tokens.values()
            if t.narrative_id is None
            and t.liquidity_eth >= LABEL_MIN_LIQUIDITY_ETH
            and t.address not in attempts
            and (t.symbol or t.name)
        ][:MAX_LABELS_PER_RUN]
        if not due:
            return 0
        answers = await self._labeler.label([(t.address, t.symbol, t.name) for t in due])
        if answers is None:
            return 0
        labeled = 0
        for tok in due:
            attempts.add(tok.address)
            nid = answers.get(tok.address)
            if nid is not None:
                tokens[tok.address] = replace(tok, narrative_id=nid)
                labeled += 1
        self._save_label_attempts(attempts)
        return labeled

    # --- checkpoint -------------------------------------------------------------------------

    def _load_last_block(self) -> int | None:
        path = self._cfg.state_path
        if path is None or not path.exists():
            return None
        try:
            return int(json.loads(path.read_text())["last_block"])
        except (ValueError, KeyError, OSError):
            return None

    def _save_last_block(self, block: int) -> None:
        path = self._cfg.state_path
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"last_block": block}))
        tmp.replace(path)

    # --- scanning ---------------------------------------------------------------------------

    async def _scan(
        self,
        from_block: int,
        to_block: int,
        topics: Sequence[str] = (pons.TOPIC_TOKEN_LAUNCHED, pons.TOPIC_POOL_GRADUATED),
    ) -> list[dict[str, Any]]:
        if self._cfg.log_range < 1:
            raise ValueError("Discovery log range must be positive")
        ranges: list[tuple[int, int]] = []
        start = from_block
        while start <= to_block:
            end = min(start + self._cfg.log_range - 1, to_block)
            ranges.append((start, end))
            start = end + 1
        gate = asyncio.Semaphore(max(1, self._cfg.scan_concurrency))

        async def fetch(lo: int, hi: int) -> list[dict[str, Any]]:
            async with gate:
                chunk = await self._rpc.request(
                    "eth_getLogs",
                    [
                        {
                            "address": self._cfg.factory,
                            "fromBlock": hex(lo),
                            "toBlock": hex(hi),
                            "topics": [list(topics)],
                        }
                    ],
                )
            return list(chunk or [])

        # Free RPC endpoints cap the block range per call, so a catch-up is thousands of calls;
        # a few run at once.
        chunks = await asyncio.gather(*(fetch(lo, hi) for lo, hi in ranges))
        return [log for chunk in chunks for log in chunk]

    async def _refresh_ecosystem(self) -> int:
        """Upsert the curated ecosystem tokens with their live market data (never raises)."""
        path = self._cfg.ecosystem_path
        if path is None or not path.exists() or self._market is None:
            return 0
        try:
            entries = list(json.loads(path.read_text(encoding="utf-8")).get("tokens", []))
            if not entries:
                return 0
            addresses = [str(e["address"]).lower() for e in entries]
            eth_usd = await self._market.eth_usd(self._cfg.weth) or Decimal(0)
            markets = await self._market.markets(addresses)
            rows = await self._storage.select(
                "tokens", filters={"source": "eq.uniswap"}, order="created_at.desc", limit=1000
            )
            existing = {t.address: t for t in (_row_to_token(r) for r in rows)}
            tokens = ecosystem_tokens(entries, markets, eth_usd, existing, self._now)
            await self._storage.upsert(
                "tokens", [_token_to_row(t) for t in tokens], on_conflict="address"
            )
            return len(tokens)
        except Exception:  # noqa: BLE001 - the Pons scan result is already saved; this is best effort
            return 0

    # --- enrichment -------------------------------------------------------------------------

    async def _infer_narrative(self, tok: DiscoveredToken) -> int | None:
        needle = f"${tok.symbol}" if tok.symbol else tok.address
        posts = await self._storage.select(
            "posts",
            columns="tweet_id,body",
            filters={
                "body": f"ilike.*{needle}*",
                "created_at": "gte." + (self._now - timedelta(hours=48)).isoformat(),
            },
            limit=POSTS_PER_TOKEN,
        )
        if not posts:
            return None
        ids = ",".join(str(p["tweet_id"]) for p in posts)
        classes = await self._storage.select(
            "classifications",
            columns="tweet_id,q",
            filters={"tweet_id": f"in.({ids})"},
        )
        q_by_id = {
            int(c["tweet_id"]): {int(k): float(v) for k, v in c["q"].items()} for c in classes
        }
        classified = [
            (str(p["body"]), q_by_id[int(p["tweet_id"])])
            for p in posts
            if int(p["tweet_id"]) in q_by_id
        ]
        return infer_token_narrative(tok.symbol, tok.address, classified)

    async def _rising_narratives(self) -> set[int]:
        epochs = await self._storage.select(
            "epochs",
            columns="epoch_id",
            filters={"status": "eq.final"},
            order="epoch_id.desc",
            limit=1,
        )
        if not epochs:
            return set()
        rows = await self._storage.select(
            "narrative_epoch",
            columns="narrative_id,v_bps,v_flag",
            filters={"epoch_id": f"eq.{int(epochs[0]['epoch_id'])}"},
        )
        return {
            int(r["narrative_id"])
            for r in rows
            if r.get("v_flag") is None
            and r.get("v_bps") is not None
            and int(r["v_bps"]) >= self._cfg.rising_v_bps
        }

    async def _emit_token_alerts(
        self, tokens: Sequence[DiscoveredToken], *, detected_at: datetime
    ) -> int:
        if not tokens:
            return 0
        alerts_created = 0
        for alert in generate_new_token_alerts(
            tokens, rising_narratives=await self._rising_narratives(), detected_at=detected_at
        ):
            token = to_pg_bytea(alert.token or "")
            existing = await self._storage.select(
                "radar_alerts",
                columns="id",
                filters={"kind": "eq.new_token", "token": f"eq.{token}"},
                limit=1,
            )
            if existing:
                continue
            await self._storage.upsert(
                "radar_alerts",
                [
                    {
                        "kind": alert.kind,
                        "narrative_id": alert.narrative_id,
                        "v_bps": None,
                        "token": token,
                        "detected_at": alert.detected_at.isoformat(),
                        "public_at": alert.public_at.isoformat(),
                    }
                ],
            )
            alerts_created += 1
        return alerts_created

    # --- main -------------------------------------------------------------------------------

    async def run(self) -> dict[str, Any]:
        head = int(str(await self._rpc.request("eth_blockNumber", [])), 16)
        last = self._load_last_block()
        from_block = (last + 1) if last is not None else max(0, head - self._cfg.lookback_blocks)
        to_block = min(head, from_block + self._cfg.max_blocks_per_run - 1)
        if from_block > to_block:
            return {"role": "discovery", "status": "up_to_date", "head": head}

        logs = await self._scan(from_block, to_block)

        known_rows = await self._storage.select(
            "tokens", filters={"source": "eq.pons_v2"}, order="created_at.desc", limit=1000
        )
        tokens: dict[str, DiscoveredToken] = {}
        for row in known_rows:
            tok = _row_to_token(row)
            tokens[tok.address] = tok
        was_graduated = {a for a, t in tokens.items() if t.graduated}
        known_addresses = set(tokens)
        curves: dict[str, str] = {}
        pair_tokens: dict[str, str] = {}

        launched = 0
        for log in logs:
            topic0 = (log.get("topics") or [""])[0].lower()
            info = await pons.resolve_launched_token(self._rpc, self._cfg.factory, log)
            if info is None:
                continue
            curves[info.token] = info.curve
            pair_tokens[info.token] = info.pair_token
            if topic0 == pons.TOPIC_TOKEN_LAUNCHED.lower() and info.token not in tokens:
                symbol, name = await pons.token_symbol_name(self._rpc, info.token)
                ts = await pons.block_timestamp(self._rpc, str(log["blockNumber"]))
                tokens[info.token] = DiscoveredToken(
                    address=info.token,
                    symbol=symbol,
                    name=name,
                    created_at=datetime.fromtimestamp(ts, UTC),
                    source="pons_v2",
                    graduated=info.graduated,
                    pool=None,
                    liquidity_eth=Decimal(0),
                    narrative_id=None,
                )
                launched += 1

        # Refresh graduation for everything still on the curve (covers missed PoolGraduated logs).
        for addr, tok in list(tokens.items()):
            if tok.graduated:
                continue
            info = await pons.get_launch_info(self._rpc, self._cfg.factory, addr)
            if info is None:
                continue
            curves[addr] = info.curve
            pair_tokens[addr] = info.pair_token
            if info.graduated:
                tokens[addr] = replace(tok, graduated=True)

        # Market data (liquidity in ETH, 24h activity).
        recent_cutoff = self._now - timedelta(days=RECENT_DAYS)
        watch = [a for a, t in tokens.items() if t.graduated or t.created_at >= recent_cutoff][
            :MAX_ENRICH
        ]
        market_status = "disabled"
        if self._market is not None and watch:
            try:
                eth_usd = await self._market.eth_usd(self._cfg.weth)
                markets = await self._market.markets(watch)
                market_status = "ok" if eth_usd else "no_eth_price"
                for addr, market in markets.items():
                    if addr not in tokens or not eth_usd:
                        continue
                    tokens[addr] = replace(
                        tokens[addr],
                        liquidity_eth=liquidity_eth(market, eth_usd).quantize(Decimal("0.0001")),
                        pool=market.pool or tokens[addr].pool,
                        txs_7d=max(tokens[addr].txs_7d, market.txs_24h),
                        last_activity_at=self._now
                        if market.txs_24h
                        else tokens[addr].last_activity_at,
                    )
            except Exception as exc:  # noqa: BLE001 - enrichment is best effort
                market_status = f"error: {str(exc)[:120]}"
        for addr, tok in list(tokens.items()):
            pair = pair_tokens.get(addr)
            if not tok.graduated and tok.liquidity_eth == 0 and pair == self._cfg.weth.lower():
                reserve = await pons.curve_quote_reserve(self._rpc, curves.get(addr, ""))
                if reserve is not None:
                    tokens[addr] = replace(tok, liquidity_eth=Decimal(reserve) / Decimal(10**18))

        # Narrative attribution from KOL posts (only for tokens still unattributed).
        for tok in [t for t in tokens.values() if t.narrative_id is None][:MAX_NARRATIVE_LOOKUPS]:
            nid = await self._infer_narrative(tok)
            if nid is not None:
                tokens[tok.address] = replace(tokens[tok.address], narrative_id=nid)
        # Name/symbol fallback for tokens no KOL mentioned, only once they hold real liquidity.
        try:
            name_labels = await self._label_by_name(tokens)
        except Exception:  # noqa: BLE001 - labels are best effort; the scan result must still be saved
            name_labels = 0

        await self._storage.upsert(
            "tokens", [_token_to_row(t) for t in tokens.values()], on_conflict="address"
        )

        # Radar: new or just-graduated tokens with >= 1 ETH liquidity in a rising narrative.
        fresh = [
            t
            for a, t in tokens.items()
            if (t.graduated and a not in was_graduated) or a not in known_addresses
        ]
        alerts_created = await self._emit_token_alerts(fresh, detected_at=self._now)

        ecosystem = await self._refresh_ecosystem()

        self._save_last_block(to_block)
        return {
            "role": "discovery",
            "status": "ok",
            "scanned": [from_block, to_block],
            "logs": len(logs),
            "new_tokens": launched,
            "tracked_tokens": len(tokens),
            "market_data": market_status,
            "alerts_created": alerts_created,
            "name_labels": name_labels,
            "ecosystem_tokens": ecosystem,
        }


def build_market_source(enabled: bool) -> MarketSource | None:
    return DexScreenerClient() if enabled else None
