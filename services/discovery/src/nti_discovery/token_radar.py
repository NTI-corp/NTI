"""Pons V2 / Uniswap token parser, Narrative Radar alert engine, and Heatmap opportunity model."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from nti_core.types import EpochStatus

TEN_THOUSAND = Decimal("10000")
MIN_ACTIVE_LIQUIDITY_ETH = Decimal("1")
MIN_ACTIVE_TXS_7D = 10
VELOCITY_ALERT_THRESHOLD_BPS = 5_000
PUBLIC_DELAY = timedelta(hours=1)


def _parse_dt(value: str | datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class DiscoveredToken:
    address: str
    symbol: str
    name: str
    created_at: datetime
    source: str  # pons_v1 | pons_v2 | uniswap
    graduated: bool
    pool: str | None
    liquidity_eth: Decimal
    narrative_id: int | None
    txs_7d: int = 0
    last_activity_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class NarrativeVelocityInput:
    narrative_id: int
    v_bps: int | None
    v_flag: str | None


@dataclass(frozen=True, slots=True)
class RadarAlert:
    kind: str  # velocity | new_token
    narrative_id: int
    v_bps: int | None
    token: str | None
    detected_at: datetime
    public_at: datetime


@dataclass(frozen=True, slots=True)
class HeatmapCell:
    narrative_id: int
    m_bps: int
    m_share: Decimal
    active_projects_count: int
    opportunity: Decimal | None


def parse_pons_v2_token(raw: Mapping[str, Any]) -> DiscoveredToken:
    """Parse Pons V2 Factory getLaunchedToken payload; phase == 2 indicates graduated."""
    phase = int(raw.get("phase", 0))
    return DiscoveredToken(
        address=str(raw["address"]).lower(),
        symbol=str(raw.get("symbol", "")),
        name=str(raw.get("name", "")),
        created_at=_parse_dt(raw.get("created_at")),
        source="pons_v2",
        graduated=(phase == 2),
        pool=str(raw["pool"]).lower() if raw.get("pool") else None,
        liquidity_eth=Decimal(str(raw.get("liquidity_eth", "0"))),
        narrative_id=int(raw["narrative_id"]) if raw.get("narrative_id") is not None else None,
        txs_7d=int(raw.get("txs_7d", 0)),
        last_activity_at=_parse_dt(raw["last_activity_at"])
        if raw.get("last_activity_at")
        else None,
    )


def parse_uniswap_token(raw: Mapping[str, Any]) -> DiscoveredToken:
    """Parse Uniswap pool token discovery payload."""
    return DiscoveredToken(
        address=str(raw["address"]).lower(),
        symbol=str(raw.get("symbol", "")),
        name=str(raw.get("name", "")),
        created_at=_parse_dt(raw.get("created_at")),
        source="uniswap",
        graduated=True,
        pool=str(raw["pool"]).lower() if raw.get("pool") else None,
        liquidity_eth=Decimal(str(raw.get("liquidity_eth", "0"))),
        narrative_id=int(raw["narrative_id"]) if raw.get("narrative_id") is not None else None,
        txs_7d=int(raw.get("txs_7d", 0)),
        last_activity_at=_parse_dt(raw["last_activity_at"])
        if raw.get("last_activity_at")
        else None,
    )


def infer_token_narrative(
    symbol: str,
    address: str,
    classified_posts: Sequence[tuple[str, Mapping[int, float]]],
) -> int | None:
    """Attribute a token to a narrative by aggregating q scores of KOL posts mentioning it."""
    ticker = f"${symbol.upper()}" if symbol else ""
    addr_lc = address.lower()
    totals: dict[int, float] = {}
    for text, q_map in classified_posts:
        text_up = text.upper()
        if (ticker and ticker in text_up) or (addr_lc and addr_lc in text.lower()):
            for nid, prob in q_map.items():
                totals[nid] = totals.get(nid, 0.0) + float(prob)
    if not totals:
        return None
    return max(totals.items(), key=lambda kv: (kv[1], -kv[0]))[0]


def generate_velocity_alerts(
    narratives: Sequence[NarrativeVelocityInput],
    *,
    epoch_status: EpochStatus,
    detected_at: datetime,
    threshold_bps: int = VELOCITY_ALERT_THRESHOLD_BPS,
) -> list[RadarAlert]:
    """Emit velocity alerts ONLY on EpochStatus.FINAL when V_n > 5000 bps and v_flag is None."""
    if epoch_status != EpochStatus.FINAL:
        return []
    ts = detected_at.astimezone(UTC)
    public_at = ts + PUBLIC_DELAY
    alerts: list[RadarAlert] = []
    for n in sorted(narratives, key=lambda x: x.narrative_id):
        if n.v_flag is not None or n.v_bps is None:
            continue
        if n.v_bps > threshold_bps:
            alerts.append(
                RadarAlert(
                    kind="velocity",
                    narrative_id=n.narrative_id,
                    v_bps=n.v_bps,
                    token=None,
                    detected_at=ts,
                    public_at=public_at,
                )
            )
    return alerts


def generate_new_token_alerts(
    tokens: Sequence[DiscoveredToken],
    *,
    rising_narratives: set[int],
    detected_at: datetime,
    min_liquidity_eth: Decimal = MIN_ACTIVE_LIQUIDITY_ETH,
) -> list[RadarAlert]:
    """Emit immediate on-chain alerts for tokens with liquidity >= 1 ETH in rising narratives."""
    ts = detected_at.astimezone(UTC)
    public_at = ts + PUBLIC_DELAY
    alerts: list[RadarAlert] = []
    for tok in sorted(tokens, key=lambda t: t.address):
        if tok.narrative_id is None or tok.narrative_id not in rising_narratives:
            continue
        if tok.liquidity_eth < min_liquidity_eth:
            continue
        alerts.append(
            RadarAlert(
                kind="new_token",
                narrative_id=tok.narrative_id,
                v_bps=None,
                token=tok.address,
                detected_at=ts,
                public_at=public_at,
            )
        )
    return alerts


def is_active_project_token(
    token: DiscoveredToken,
    *,
    min_liquidity_eth: Decimal = MIN_ACTIVE_LIQUIDITY_ETH,
    min_txs_7d: int = MIN_ACTIVE_TXS_7D,
) -> bool:
    return token.liquidity_eth >= min_liquidity_eth and token.txs_7d >= min_txs_7d


def compute_heatmap(
    *,
    mindshare_bps: Mapping[int, int],
    tokens: Sequence[DiscoveredToken],
    curated_projects_by_narrative: Mapping[int, int] | None = None,
) -> list[HeatmapCell]:
    """Compute opportunity = M_n / active_projects_count (active tokens + curated projects)."""
    curated = curated_projects_by_narrative or {}
    active_by_nid: dict[int, int] = {}
    for tok in tokens:
        if tok.narrative_id is not None and is_active_project_token(tok):
            active_by_nid[tok.narrative_id] = active_by_nid.get(tok.narrative_id, 0) + 1

    cells: list[HeatmapCell] = []
    for nid in sorted(mindshare_bps.keys()):
        m_bps = int(mindshare_bps[nid])
        m_share = Decimal(m_bps) / TEN_THOUSAND
        active_count = active_by_nid.get(nid, 0) + int(curated.get(nid, 0))
        opportunity = (m_share / Decimal(active_count)) if active_count > 0 else None
        cells.append(
            HeatmapCell(
                narrative_id=nid,
                m_bps=m_bps,
                m_share=m_share,
                active_projects_count=active_count,
                opportunity=opportunity,
            )
        )
    return cells
