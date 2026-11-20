import { NARRATIVES, NARRATIVE_BY_ID } from "@nti/sdk";
import {
  readLiveBasketsFromChain,
  readLiveGrantRoundsFromChain,
  readLiveMarketsFromChain,
} from "./onchain";
import type {
  BasketItem,
  ContributorRow,
  DisputeItem,
  EpochDetailResponse,
  EpochStatus,
  EpochSummary,
  GovernorProposalItem,
  GrantRoundItem,
  HeatmapPoint,
  HeatmapResponse,
  HistoryPoint,
  IndexesSnapshot,
  MarketItem,
  NarrativeHistoryResponse,
  NarrativeIndexItem,
  RadarAlertItem,
  RadarResponse,
  TokenItem,
  VFlag,
  ValidatorAttestationItem,
} from "./types";

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? null;
  return { url: url ? url.replace(/\/+$/, "") : null, anonKey, serviceKey };
}

function normalizeHex(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.startsWith("\\x")) return `0x${raw.slice(2)}`;
  return raw;
}

export async function supabaseSelect<T>(
  pathWithQuery: string,
  mode: "anon" | "service" = "anon",
): Promise<T[] | null> {
  const cfg = getSupabaseConfig();
  const key = mode === "service" ? cfg.serviceKey ?? cfg.anonKey : cfg.anonKey;
  if (!cfg.url || !key) return null;

  try {
    const res = await fetch(`${cfg.url}/rest/v1/${pathWithQuery}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      next: mode === "anon" ? { revalidate: 60 } : { revalidate: 0 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministic preview generators (used ONLY when DB has 0 finalized epochs)
// ---------------------------------------------------------------------------

// Sums to exactly 10,000 bps (Hamilton largest-remainder invariant)
const PREVIEW_I_BPS = [620, 1890, 1140, 1280, 740, 960, 1080, 1120, 760, 410] as const;
const PREVIEW_M_BPS = [660, 2040, 1090, 1220, 710, 1030, 1110, 1040, 720, 380] as const;
const PREVIEW_V_BPS: Array<number | null> = [
  1480, 5620, -420, 310, -860, 5180, 1940, -610, -1240, null,
];
const PREVIEW_V_FLAG: VFlag[] = [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  "too_small",
];
const PREVIEW_WEIGHTED_POSTS = [84, 312, 168, 195, 92, 146, 174, 159, 132, 22] as const;
const PREVIEW_ACTIVE_TOKENS = [4, 7, 5, 9, 6, 3, 8, 18, 29, 11] as const;
const PREVIEW_CURATED = [3, 4, 6, 8, 5, 3, 5, 14, 2, 7] as const;

function buildPreviewSeries(narrativeId: number): HistoryPoint[] {
  const idx = Math.max(0, Math.min(9, narrativeId - 1));
  const baseI = PREVIEW_I_BPS[idx] ?? 1000;
  const baseV = PREVIEW_V_BPS[idx] ?? 0;
  const now = Date.now();
  const points: HistoryPoint[] = [];

  for (let step = 0; step < 18; step++) {
    const epochId = 101 + step;
    const isSeriesBreak = step === 6;
    const isIncomplete = step === 11;
    const seriesId = step >= 6 ? 2 : 1;
    const wave = Math.round(Math.sin((step + narrativeId) * 0.65) * 140 + (step - 9) * 18);
    const iBps = isIncomplete ? 0 : Math.max(120, baseI + wave);
    const mBps = isIncomplete ? 0 : Math.max(100, iBps + Math.round(Math.cos(step * 0.9) * 90));

    let vBps: number | null = Math.round(baseV * 0.5 + wave * 6);
    let vFlag: VFlag = null;

    if (isIncomplete) {
      vBps = null;
      vFlag = "incomplete_gap";
    } else if (isSeriesBreak) {
      vBps = null;
      vFlag = "series_break";
    } else if (narrativeId === 10 && step >= 14) {
      vBps = null;
      vFlag = "too_small";
    }

    points.push({
      epochId,
      seriesId,
      status: isIncomplete ? "incomplete" : "final",
      sN: Number((mBps * 0.14).toFixed(2)),
      mBps,
      iBps,
      vBps,
      vFlag,
      weightedPosts: isIncomplete ? 0 : Math.max(12, (PREVIEW_WEIGHTED_POSTS[idx] ?? 40) + (step % 7) * 3),
      seriesBreak: isSeriesBreak,
      incomplete: isIncomplete,
      finalizedAt: isIncomplete
        ? null
        : new Date(now - (18 - step) * 4 * 3600 * 1000).toISOString(),
    });
  }
  return points;
}

function buildPreviewNarratives(): NarrativeIndexItem[] {
  return NARRATIVES.map((n, idx) => ({
    narrativeId: n.id,
    slug: n.slug,
    label: n.label,
    description: n.description,
    sN: Number(((PREVIEW_M_BPS[idx] ?? 1000) * 0.142).toFixed(2)),
    mBps: PREVIEW_M_BPS[idx] ?? 1000,
    iBps: PREVIEW_I_BPS[idx] ?? 1000,
    vBps: PREVIEW_V_BPS[idx] ?? null,
    vFlag: PREVIEW_V_FLAG[idx] ?? null,
    weightedPosts: PREVIEW_WEIGHTED_POSTS[idx] ?? 40,
  }));
}

function buildPreviewEpoch(epochId = 118, status: EpochStatus = "collecting"): EpochSummary {
  const now = Date.now();
  return {
    epochId,
    seriesId: 2,
    status,
    datasetHash: "0x4c9a71b0e44f21c8a9d63f78b2a109e3c5560f2d1e8b4a7799c0e11234a8b6f2",
    arweaveTx: "ar_preview_epoch_awaiting_first_commit",
    configHash: "0x9f12b7c4e82100a3f4c8d1e7a2b56c9031d4e6f8a0b2c4d6e8f0a1b3c5d7e9f1",
    commitTx: null,
    committedAt: status === "committed" || status === "final" ? new Date(now - 90 * 60_000).toISOString() : null,
    finalizedAt: status === "final" ? new Date(now - 20 * 60_000).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Public & Gated Domain Fetchers
// ---------------------------------------------------------------------------

interface DbEpochRow {
  epoch_id: number;
  series_id: number;
  status: EpochStatus;
  dataset_hash: string | null;
  arweave_tx: string | null;
  config_hash: string | null;
  commit_tx: string | null;
  committed_at: string | null;
  finalized_at: string | null;
}

interface DbNarrativeEpochRow {
  epoch_id: number;
  narrative_id: number;
  s_n: number | string;
  m_bps: number;
  i_bps: number;
  v_bps: number | null;
  v_flag: VFlag;
  weighted_posts: number | string;
}

function mapEpoch(r: DbEpochRow): EpochSummary {
  return {
    epochId: r.epoch_id,
    seriesId: r.series_id,
    status: r.status,
    datasetHash: normalizeHex(r.dataset_hash),
    arweaveTx: r.arweave_tx,
    configHash: normalizeHex(r.config_hash),
    commitTx: normalizeHex(r.commit_tx),
    committedAt: r.committed_at,
    finalizedAt: r.finalized_at,
  };
}

export async function fetchIndexesSnapshot(): Promise<IndexesSnapshot> {
  const epochs = await supabaseSelect<DbEpochRow>(
    "epochs?select=*&order=epoch_id.desc&limit=20",
    "anon",
  );

  const latestObserved = epochs && epochs.length > 0 ? mapEpoch(epochs[0]!) : null;
  const latestFinalRow = epochs?.find((e) => e.status === "final") ?? null;

  if (!latestFinalRow) {
    const previewSeries: IndexesSnapshot["recentSeries"] = {};
    for (const n of NARRATIVES) {
      previewSeries[n.id] = buildPreviewSeries(n.id).map((p) => ({
        epochId: p.epochId,
        iBps: p.iBps,
        vBps: p.vBps,
        vFlag: p.vFlag,
        seriesId: p.seriesId,
        incomplete: p.incomplete,
      }));
    }
    return {
      awaitingFirstEpoch: true,
      dataSource: "preview",
      latestFinalEpoch: null,
      latestObservedEpoch: latestObserved ?? buildPreviewEpoch(1, "collecting"),
      pendingFinalization: latestObserved?.status === "committed",
      narratives: buildPreviewNarratives(),
      recentSeries: previewSeries,
      updatedAt: new Date().toISOString(),
    };
  }

  const epochIds = (epochs ?? []).map((e) => e.epoch_id);
  const statusByEpoch = new Map((epochs ?? []).map((e) => [e.epoch_id, e]));
  const rows =
    (await supabaseSelect<DbNarrativeEpochRow>(
      `narrative_epoch?select=*&epoch_id=in.(${epochIds.join(",")})&order=epoch_id.asc`,
      "anon",
    )) ?? [];

  const latestByNarrative = new Map<number, DbNarrativeEpochRow>();
  const recentSeries: IndexesSnapshot["recentSeries"] = {};
  for (const n of NARRATIVES) recentSeries[n.id] = [];

  for (const r of rows) {
    const ep = statusByEpoch.get(r.epoch_id);
    if (r.epoch_id === latestFinalRow.epoch_id) {
      latestByNarrative.set(r.narrative_id, r);
    }
    if (ep && (ep.status === "final" || ep.status === "incomplete")) {
      recentSeries[r.narrative_id]?.push({
        epochId: r.epoch_id,
        iBps: r.i_bps,
        vBps: r.v_bps,
        vFlag: r.v_flag,
        seriesId: ep.series_id,
        incomplete: ep.status === "incomplete",
      });
    }
  }

  const narratives: NarrativeIndexItem[] = NARRATIVES.map((meta) => {
    const row = latestByNarrative.get(meta.id);
    return {
      narrativeId: meta.id,
      slug: meta.slug,
      label: meta.label,
      description: meta.description,
      sN: row ? Number(row.s_n) : 0,
      mBps: row ? row.m_bps : 0,
      iBps: row ? row.i_bps : 0,
      vBps: row ? row.v_bps : null,
      vFlag: row ? row.v_flag : null,
      weightedPosts: row ? Number(row.weighted_posts) : 0,
    };
  });

  return {
    awaitingFirstEpoch: false,
    dataSource: "supabase",
    latestFinalEpoch: mapEpoch(latestFinalRow),
    latestObservedEpoch: latestObserved,
    pendingFinalization:
      latestObserved !== null &&
      latestObserved.epochId > latestFinalRow.epoch_id &&
      latestObserved.status === "committed",
    narratives,
    recentSeries,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchNarrativeHistory(
  narrativeId: number,
  fromEpoch?: number,
  toEpoch?: number,
): Promise<NarrativeHistoryResponse> {
  const meta = NARRATIVE_BY_ID.get(narrativeId) ?? NARRATIVES[0]!;

  const epochs = await supabaseSelect<DbEpochRow>(
    "epochs?select=*&order=epoch_id.asc&limit=120",
    "anon",
  );
  const finalEpochs = (epochs ?? []).filter((e) => e.status === "final");

  if (finalEpochs.length === 0) {
    const previewSeries = buildPreviewSeries(meta.id).filter(
      (p) =>
        (fromEpoch === undefined || p.epochId >= fromEpoch) &&
        (toEpoch === undefined || p.epochId <= toEpoch),
    );
    const previewContributors: ContributorRow[] = [
      { userId: "1001", handle: `${meta.slug}_research`, followers: 184200, shareBps: 1000, capped: true },
      { userId: "1002", handle: `0x${meta.slug.slice(0, 5)}alpha`, followers: 96400, shareBps: 1000, capped: true },
      { userId: "1003", handle: "chain_telemetry", followers: 72100, shareBps: 785, capped: false },
      { userId: "1004", handle: "macro_desk_rh", followers: 51300, shareBps: 640, capped: false },
      { userId: "1005", handle: "onchain_verif", followers: 38900, shareBps: 520, capped: false },
      { userId: "1006", handle: "dev_shipper_x", followers: 27400, shareBps: 415, capped: false },
    ];
    const previewTokens: TokenItem[] = [
      {
        address: `0x${meta.id.toString(16).padStart(2, "0")}a7e4f891b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`,
        symbol: `${meta.slug.slice(0, 4).toUpperCase()}`,
        name: `${meta.label} Core Protocol`,
        source: "pons_v2",
        graduated: true,
        liquidityEth: 28.4,
        narrativeId: meta.id,
        txs7d: 412,
        createdAt: new Date(Date.now() - 4 * 86400_000).toISOString(),
      },
      {
        address: `0x${meta.id.toString(16).padStart(2, "0")}b9f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8`,
        symbol: `X${meta.slug.slice(0, 3).toUpperCase()}`,
        name: `${meta.label} Indexer Pool`,
        source: "uniswap",
        graduated: true,
        liquidityEth: 14.2,
        narrativeId: meta.id,
        txs7d: 189,
        createdAt: new Date(Date.now() - 12 * 86400_000).toISOString(),
      },
    ];
    return {
      awaitingFirstEpoch: true,
      dataSource: "preview",
      narrative: meta,
      latestFinalEpoch: null,
      series: previewSeries,
      contributors: previewContributors,
      tokens: previewTokens,
    };
  }

  const filterClauses = [`narrative_id=eq.${meta.id}`];
  if (fromEpoch !== undefined && !Number.isNaN(fromEpoch)) {
    filterClauses.push(`epoch_id=gte.${fromEpoch}`);
  }
  if (toEpoch !== undefined && !Number.isNaN(toEpoch)) {
    filterClauses.push(`epoch_id=lte.${toEpoch}`);
  }

  const [neRows, contribRows, tokenRows] = await Promise.all([
    supabaseSelect<DbNarrativeEpochRow>(
      `narrative_epoch?select=*&${filterClauses.join("&")}&order=epoch_id.asc`,
      "anon",
    ),
    supabaseSelect<{
      user_id: number;
      share_bps: number;
      capped: boolean;
      kols?: { handle?: string; followers?: number } | null;
    }>(
      `kol_contribution?select=user_id,share_bps,capped,kols(handle,followers)&epoch_id=eq.${finalEpochs[finalEpochs.length - 1]!.epoch_id}&narrative_id=eq.${meta.id}&order=share_bps.desc&limit=20`,
      "service",
    ),
    supabaseSelect<{
      address: string;
      symbol: string | null;
      name: string | null;
      source: "pons_v1" | "pons_v2" | "uniswap" | null;
      graduated: boolean;
      liquidity_eth: number | string | null;
      narrative_id: number | null;
      txs_7d: number;
      created_at: string | null;
    }>(
      `tokens?select=*&narrative_id=eq.${meta.id}&order=liquidity_eth.desc.nullslast&limit=25`,
      "anon",
    ),
  ]);

  const epochMap = new Map((epochs ?? []).map((e) => [e.epoch_id, e]));
  let prevSeriesId: number | null = null;

  const series: HistoryPoint[] = (neRows ?? [])
    .filter((r) => {
      const ep = epochMap.get(r.epoch_id);
      return ep && (ep.status === "final" || ep.status === "incomplete");
    })
    .map((r) => {
      const ep = epochMap.get(r.epoch_id)!;
      const seriesBreak = prevSeriesId !== null && ep.series_id !== prevSeriesId;
      prevSeriesId = ep.series_id;
      return {
        epochId: r.epoch_id,
        seriesId: ep.series_id,
        status: ep.status,
        sN: Number(r.s_n),
        mBps: r.m_bps,
        iBps: r.i_bps,
        vBps: r.v_bps,
        vFlag: r.v_flag,
        weightedPosts: Number(r.weighted_posts),
        seriesBreak,
        incomplete: ep.status === "incomplete",
        finalizedAt: ep.finalized_at,
      };
    });

  const contributors: ContributorRow[] = (contribRows ?? []).map((c) => ({
    userId: String(c.user_id),
    handle: c.kols?.handle ?? `kol_${c.user_id}`,
    followers: c.kols?.followers ?? 0,
    shareBps: c.share_bps,
    capped: c.capped,
  }));

  const tokens: TokenItem[] = (tokenRows ?? []).map((t) => ({
    address: normalizeHex(t.address) ?? t.address,
    symbol: t.symbol ?? "TOKEN",
    name: t.name ?? "Unnamed Token",
    source: t.source,
    graduated: t.graduated,
    liquidityEth: Number(t.liquidity_eth ?? 0),
    narrativeId: t.narrative_id,
    txs7d: t.txs_7d,
    createdAt: t.created_at,
  }));

  return {
    awaitingFirstEpoch: false,
    dataSource: "supabase",
    narrative: meta,
    latestFinalEpoch: mapEpoch(finalEpochs[finalEpochs.length - 1]!),
    series,
    contributors,
    tokens,
  };
}

export async function fetchEpochDetail(epochId?: number): Promise<EpochDetailResponse> {
  const recentRows = await supabaseSelect<DbEpochRow>(
    "epochs?select=*&order=epoch_id.desc&limit=12",
    "anon",
  );

  if (!recentRows || recentRows.length === 0) {
    const previewEpoch = buildPreviewEpoch(epochId ?? 1, "collecting");
    const previewNarratives = buildPreviewNarratives();
    const previewAtts: ValidatorAttestationItem[] = [
      {
        validator: "0x71C04f92a38D4bE21970bA19e39a8E224a77f101",
        iBps: [...PREVIEW_I_BPS],
        vBps: PREVIEW_V_BPS.map((v) => v ?? -2147483648),
        signature: "0x91ab44d8f209c8e12a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d71b",
        createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
        matchesMedian: true,
      },
      {
        validator: "0x82D15a03b49E5cF32081cB20f40b9F335b88a202",
        iBps: [...PREVIEW_I_BPS],
        vBps: PREVIEW_V_BPS.map((v) => v ?? -2147483648),
        signature: "0x82bc55e9a310d9f23b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e81c",
        createdAt: new Date(Date.now() - 44 * 60_000).toISOString(),
        matchesMedian: true,
      },
      {
        validator: "0x93E26b14c50F6dA43192dC31a51c0A446c99b303",
        iBps: [...PREVIEW_I_BPS],
        vBps: PREVIEW_V_BPS.map((v) => v ?? -2147483648),
        signature: "0x73cd66fab421e0a34c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f91b",
        createdAt: new Date(Date.now() - 43 * 60_000).toISOString(),
        matchesMedian: true,
      },
    ];
    return {
      awaitingFirstEpoch: true,
      dataSource: "preview",
      epoch: previewEpoch,
      narratives: previewNarratives,
      attestations: previewAtts,
      disputes: [],
      recentEpochs: [previewEpoch],
    };
  }

  const target =
    (epochId !== undefined
      ? recentRows.find((r) => r.epoch_id === epochId)
      : recentRows[0]) ?? recentRows[0]!;

  const [neRows, attRows, dispRows] = await Promise.all([
    supabaseSelect<DbNarrativeEpochRow>(
      `narrative_epoch?select=*&epoch_id=eq.${target.epoch_id}&order=narrative_id.asc`,
      "anon",
    ),
    supabaseSelect<{
      validator: string;
      i_bps: number[];
      v_bps: number[];
      signature: string;
      created_at: string;
    }>(`attestations?select=*&epoch_id=eq.${target.epoch_id}&order=created_at.asc`, "anon"),
    supabaseSelect<{
      dispute_id: number;
      epoch_id: number;
      narrative_id: number;
      challenger: string;
      claimed_i_bps: number;
      evidence_hash: string;
      status: string;
      opened_at: string;
      resolved_at: string | null;
    }>(`disputes?select=*&epoch_id=eq.${target.epoch_id}&order=opened_at.desc`, "anon"),
  ]);

  const byId = new Map((neRows ?? []).map((r) => [r.narrative_id, r]));
  const narratives: NarrativeIndexItem[] = NARRATIVES.map((meta) => {
    const r = byId.get(meta.id);
    return {
      narrativeId: meta.id,
      slug: meta.slug,
      label: meta.label,
      description: meta.description,
      sN: r ? Number(r.s_n) : 0,
      mBps: r ? r.m_bps : 0,
      iBps: r ? r.i_bps : 0,
      vBps: r ? r.v_bps : null,
      vFlag: r ? r.v_flag : null,
      weightedPosts: r ? Number(r.weighted_posts) : 0,
    };
  });

  const medianVec = narratives.map((n) => n.iBps);
  const attestations: ValidatorAttestationItem[] = (attRows ?? []).map((a) => {
    const maxDelta = a.i_bps.reduce(
      (max, val, idx) => Math.max(max, Math.abs(val - (medianVec[idx] ?? 0))),
      0,
    );
    return {
      validator: normalizeHex(a.validator) ?? a.validator,
      iBps: a.i_bps,
      vBps: a.v_bps,
      signature: normalizeHex(a.signature) ?? a.signature,
      createdAt: a.created_at,
      matchesMedian: maxDelta <= 100,
    };
  });

  const disputes: DisputeItem[] = (dispRows ?? []).map((d) => ({
    disputeId: d.dispute_id,
    epochId: d.epoch_id,
    narrativeId: d.narrative_id,
    challenger: normalizeHex(d.challenger) ?? d.challenger,
    claimedIBps: d.claimed_i_bps,
    evidenceHash: normalizeHex(d.evidence_hash) ?? d.evidence_hash,
    status: d.status,
    openedAt: d.opened_at,
    resolvedAt: d.resolved_at,
  }));

  return {
    awaitingFirstEpoch: false,
    dataSource: "supabase",
    epoch: mapEpoch(target),
    narratives,
    attestations,
    disputes,
    recentEpochs: recentRows.map(mapEpoch),
  };
}

export async function fetchRadarAlerts(params: {
  realtimeUnlocked: boolean;
  wallet: `0x${string}` | null;
  stakeFormatted: string;
  minStakeRequired: string;
}): Promise<RadarResponse> {
  const nowMs = Date.now();
  // Always read full table server-side with service key so we can compute accurate
  // locked countdown metadata for non-stakers without leaking locked payload fields.
  const rows = await supabaseSelect<{
    id: number;
    kind: "velocity" | "new_token";
    narrative_id: number;
    v_bps: number | null;
    token: string | null;
    detected_at: string;
    public_at: string;
  }>("radar_alerts?select=*&order=detected_at.desc&limit=40", "service");

  const tokenRows =
    (await supabaseSelect<{
      address: string;
      symbol: string | null;
      name: string | null;
      liquidity_eth: number | string | null;
      graduated: boolean;
      source: string | null;
    }>("tokens?select=address,symbol,name,liquidity_eth,graduated,source&limit=100", "anon")) ?? [];

  const tokenMap = new Map(
    tokenRows.map((t) => [(normalizeHex(t.address) ?? t.address).toLowerCase(), t]),
  );

  if (!rows || rows.length === 0) {
    // Deterministic preview alerts demonstrating BOTH real-time locked & public delayed alerts
    const previewRaw: Array<{
      id: number;
      kind: "velocity" | "new_token";
      narrativeId: number;
      vBps: number | null;
      token: RadarAlertItem["token"];
      detectedAgoMin: number;
    }> = [
      {
        id: 1,
        kind: "velocity",
        narrativeId: 2,
        vBps: 5620,
        token: null,
        detectedAgoMin: 14,
      },
      {
        id: 2,
        kind: "new_token",
        narrativeId: 6,
        vBps: 5180,
        token: {
          address: "0x6a9f0c21b3e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8",
          symbol: "PRDX",
          name: "PredictX Settlement",
          liquidityEth: 6.8,
          graduated: true,
          source: "pons_v2",
        },
        detectedAgoMin: 28,
      },
      {
        id: 3,
        kind: "new_token",
        narrativeId: 2,
        vBps: 5410,
        token: {
          address: "0x2c8e1d44a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
          symbol: "AGNT",
          name: "Agentic Router",
          liquidityEth: 3.4,
          graduated: false,
          source: "pons_v2",
        },
        detectedAgoMin: 76,
      },
      {
        id: 4,
        kind: "velocity",
        narrativeId: 7,
        vBps: 5040,
        token: null,
        detectedAgoMin: 112,
      },
      {
        id: 5,
        kind: "new_token",
        narrativeId: 1,
        vBps: 5120,
        token: {
          address: "0x1e4d9a77c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
          symbol: "ZKSH",
          name: "ZK Shield Pool",
          liquidityEth: 11.2,
          graduated: true,
          source: "uniswap",
        },
        detectedAgoMin: 165,
      },
    ];

    let lockedCount = 0;
    const alerts: RadarAlertItem[] = previewRaw.map((item) => {
      const detectedMs = nowMs - item.detectedAgoMin * 60_000;
      const publicMs = detectedMs + 60 * 60_000;
      const isDelayedWindow = publicMs > nowMs;
      const locked = isDelayedWindow && !params.realtimeUnlocked;
      if (locked) lockedCount += 1;
      const meta = NARRATIVE_BY_ID.get(item.narrativeId) ?? NARRATIVES[0]!;

      return {
        id: item.id,
        kind: item.kind,
        narrativeId: meta.id,
        narrativeLabel: meta.label,
        narrativeSlug: meta.slug,
        locked,
        vBps: locked ? null : item.vBps,
        token: locked ? null : item.token,
        detectedAt: new Date(detectedMs).toISOString(),
        publicAt: new Date(publicMs).toISOString(),
        unlocksInSeconds: Math.max(0, Math.floor((publicMs - nowMs) / 1000)),
      };
    });

    return {
      awaitingFirstEpoch: true,
      dataSource: "preview",
      realtimeUnlocked: params.realtimeUnlocked,
      wallet: params.wallet,
      stakeFormatted: params.stakeFormatted,
      minStakeRequired: params.minStakeRequired,
      lockedCount,
      alerts,
      serverTime: new Date(nowMs).toISOString(),
    };
  }

  let lockedCount = 0;
  const alerts: RadarAlertItem[] = rows.map((r) => {
    const publicMs = new Date(r.public_at).getTime();
    const locked = publicMs > nowMs && !params.realtimeUnlocked;
    if (locked) lockedCount += 1;
    const meta = NARRATIVE_BY_ID.get(r.narrative_id) ?? NARRATIVES[0]!;
    const tokAddr = normalizeHex(r.token);
    const tok = tokAddr ? tokenMap.get(tokAddr.toLowerCase()) : undefined;

    return {
      id: r.id,
      kind: r.kind,
      narrativeId: meta.id,
      narrativeLabel: meta.label,
      narrativeSlug: meta.slug,
      locked,
      vBps: locked ? null : r.v_bps,
      token:
        locked || !tokAddr
          ? null
          : {
              address: tokAddr,
              symbol: tok?.symbol ?? null,
              name: tok?.name ?? null,
              liquidityEth: tok?.liquidity_eth != null ? Number(tok.liquidity_eth) : null,
              graduated: Boolean(tok?.graduated),
              source: tok?.source ?? null,
            },
      detectedAt: r.detected_at,
      publicAt: r.public_at,
      unlocksInSeconds: Math.max(0, Math.floor((publicMs - nowMs) / 1000)),
    };
  });

  return {
    awaitingFirstEpoch: false,
    dataSource: "supabase",
    realtimeUnlocked: params.realtimeUnlocked,
    wallet: params.wallet,
    stakeFormatted: params.stakeFormatted,
    minStakeRequired: params.minStakeRequired,
    lockedCount,
    alerts,
    serverTime: new Date(nowMs).toISOString(),
  };
}

export async function fetchHeatmapData(): Promise<HeatmapResponse> {
  const snapshot = await fetchIndexesSnapshot();
  const [tokenRows, projectRows] = await Promise.all([
    supabaseSelect<{ narrative_id: number | null; liquidity_eth: number | string | null; txs_7d: number }>(
      "tokens?select=narrative_id,liquidity_eth,txs_7d",
      "anon",
    ),
    supabaseSelect<{ narrative_id: number; active: boolean; curated: boolean }>(
      "projects?select=narrative_id,active,curated&active=eq.true",
      "anon",
    ),
  ]);

  const usePreviewCounts =
    snapshot.awaitingFirstEpoch || ((!tokenRows || tokenRows.length === 0) && (!projectRows || projectRows.length === 0));

  const tokenCountByNar = new Map<number, number>();
  const curatedByNar = new Map<number, number>();

  if (!usePreviewCounts) {
    for (const t of tokenRows ?? []) {
      if (t.narrative_id && Number(t.liquidity_eth ?? 0) >= 1 && t.txs_7d >= 10) {
        tokenCountByNar.set(t.narrative_id, (tokenCountByNar.get(t.narrative_id) ?? 0) + 1);
      }
    }
    for (const p of projectRows ?? []) {
      if (p.active) {
        curatedByNar.set(p.narrative_id, (curatedByNar.get(p.narrative_id) ?? 0) + 1);
      }
    }
  }

  const rawPoints = snapshot.narratives.map((n, idx) => {
    const activeTokens = usePreviewCounts
      ? PREVIEW_ACTIVE_TOKENS[idx] ?? 4
      : tokenCountByNar.get(n.narrativeId) ?? 0;
    const curatedProjects = usePreviewCounts
      ? PREVIEW_CURATED[idx] ?? 3
      : curatedByNar.get(n.narrativeId) ?? 0;
    const activeProjects = activeTokens + curatedProjects;
    const mindsharePct = n.mBps / 100;
    const opportunityScore = Number((mindsharePct / Math.max(activeProjects, 1)).toFixed(3));
    return {
      narrativeId: n.narrativeId,
      slug: n.slug,
      label: n.label,
      mBps: n.mBps,
      iBps: n.iBps,
      vBps: n.vBps,
      activeTokens,
      curatedProjects,
      activeProjects,
      opportunityScore,
    };
  });

  const medianM =
    [...rawPoints].sort((a, b) => a.mBps - b.mBps)[Math.floor(rawPoints.length / 2)]?.mBps ?? 1000;
  const medianP =
    [...rawPoints].sort((a, b) => a.activeProjects - b.activeProjects)[
      Math.floor(rawPoints.length / 2)
    ]?.activeProjects ?? 10;

  const points: HeatmapPoint[] = rawPoints
    .map((p) => {
      const highMindshare = p.mBps >= medianM;
      const lowCompetition = p.activeProjects <= medianP;
      const quadrant: HeatmapPoint["quadrant"] = highMindshare
        ? lowCompetition
          ? "opportunity"
          : "crowded"
        : lowCompetition
          ? "emerging"
          : "quiet";
      return { ...p, quadrant };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    awaitingFirstEpoch: snapshot.awaitingFirstEpoch,
    dataSource: snapshot.dataSource,
    latestFinalEpoch: snapshot.latestFinalEpoch,
    points,
  };
}

export async function fetchMarketsData(): Promise<{
  awaitingDeployment: boolean;
  markets: MarketItem[];
}> {
  const rows = await supabaseSelect<{
    market_id: number;
    narrative_a: number;
    narrative_b: number;
    base_epoch: number;
    settle_epoch: number;
    cutoff_at: string;
    status: "open" | "locked" | "settled" | "refunded";
    outcome: "side_a" | "side_b" | "refund" | null;
    pool_a_eth?: number;
    pool_b_eth?: number;
  }>("markets?select=*&order=market_id.desc&limit=30", "anon");

  const snapshot = await fetchIndexesSnapshot();
  const iById = new Map(snapshot.narratives.map((n) => [n.narrativeId, n.iBps]));

  // On-chain state is the source of truth; the Supabase mirror only fills in if the RPC read fails.
  const liveMarkets = await readLiveMarketsFromChain(iById);
  if (liveMarkets && liveMarkets.length > 0) {
    return { awaitingDeployment: false, markets: liveMarkets };
  }

  if (!rows || rows.length === 0) {
    const now = Date.now();
    const previewMarkets: MarketItem[] = [
      {
        marketId: 1,
        narrativeA: 2,
        narrativeB: 8,
        narrativeALabel: "AI Agents",
        narrativeBLabel: "DeFi",
        baseEpoch: 118,
        settleEpoch: 124,
        horizonLabel: "24H (6 epochs)",
        cutoffAt: new Date(now + 14 * 3600_000).toISOString(),
        settleAt: new Date(now + 22 * 3600_000).toISOString(),
        status: "open",
        outcome: null,
        poolAEth: 1.85,
        poolBEth: 1.15,
        maxPoolEth: 5.0,
        baseIA: 1840,
        baseIB: 1140,
        currentIA: iById.get(2) ?? 1890,
        currentIB: iById.get(8) ?? 1120,
        seriesId: 2,
      },
      {
        marketId: 2,
        narrativeA: 6,
        narrativeB: 7,
        narrativeALabel: "Prediction Markets",
        narrativeBLabel: "Perp DEX",
        baseEpoch: 118,
        settleEpoch: 160,
        horizonLabel: "7D (42 epochs)",
        cutoffAt: new Date(now + 158 * 3600_000).toISOString(),
        settleAt: new Date(now + 166 * 3600_000).toISOString(),
        status: "open",
        outcome: null,
        poolAEth: 2.4,
        poolBEth: 1.9,
        maxPoolEth: 5.0,
        baseIA: 920,
        baseIB: 1090,
        currentIA: iById.get(6) ?? 960,
        currentIB: iById.get(7) ?? 1080,
        seriesId: 2,
      },
      {
        marketId: 3,
        narrativeA: 1,
        narrativeB: 0,
        narrativeALabel: "Privacy / ZK",
        narrativeBLabel: "All-Narrative Average",
        baseEpoch: 116,
        settleEpoch: 122,
        horizonLabel: "24H (6 epochs)",
        cutoffAt: new Date(now - 2 * 3600_000).toISOString(),
        settleAt: new Date(now + 6 * 3600_000).toISOString(),
        status: "locked",
        outcome: null,
        poolAEth: 0.95,
        poolBEth: 1.35,
        maxPoolEth: 5.0,
        baseIA: 590,
        baseIB: 1000,
        currentIA: iById.get(1) ?? 620,
        currentIB: 1000,
        seriesId: 2,
      },
      {
        marketId: 4,
        narrativeA: 3,
        narrativeB: 9,
        narrativeALabel: "RWA",
        narrativeBLabel: "Memecoin",
        baseEpoch: 110,
        settleEpoch: 116,
        horizonLabel: "24H (6 epochs)",
        cutoffAt: new Date(now - 18 * 3600_000).toISOString(),
        settleAt: new Date(now - 10 * 3600_000).toISOString(),
        status: "settled",
        outcome: "side_a",
        poolAEth: 2.1,
        poolBEth: 1.65,
        maxPoolEth: 5.0,
        baseIA: 1080,
        baseIB: 840,
        currentIA: iById.get(3) ?? 1140,
        currentIB: iById.get(9) ?? 760,
        seriesId: 2,
      },
    ];
    return { awaitingDeployment: true, markets: previewMarkets };
  }

  const markets: MarketItem[] = rows.map((r) => {
    const labelA = NARRATIVE_BY_ID.get(r.narrative_a)?.label ?? `Narrative #${r.narrative_a}`;
    const labelB =
      r.narrative_b === 0
        ? "All-Narrative Average"
        : NARRATIVE_BY_ID.get(r.narrative_b)?.label ?? `Narrative #${r.narrative_b}`;
    const horizon = r.settle_epoch - r.base_epoch > 10 ? "7D (42 epochs)" : "24H (6 epochs)";
    const cutoffMs = new Date(r.cutoff_at).getTime();
    return {
      marketId: r.market_id,
      narrativeA: r.narrative_a,
      narrativeB: r.narrative_b,
      narrativeALabel: labelA,
      narrativeBLabel: labelB,
      baseEpoch: r.base_epoch,
      settleEpoch: r.settle_epoch,
      horizonLabel: horizon,
      cutoffAt: r.cutoff_at,
      settleAt: new Date(cutoffMs + 8 * 3600_000).toISOString(),
      status: r.status,
      outcome: r.outcome,
      poolAEth: Number(r.pool_a_eth ?? 0),
      poolBEth: Number(r.pool_b_eth ?? 0),
      maxPoolEth: 5.0,
      baseIA: iById.get(r.narrative_a) ?? 1000,
      baseIB: r.narrative_b === 0 ? 1000 : iById.get(r.narrative_b) ?? 1000,
      currentIA: iById.get(r.narrative_a) ?? 1000,
      currentIB: r.narrative_b === 0 ? 1000 : iById.get(r.narrative_b) ?? 1000,
      seriesId: snapshot.latestFinalEpoch?.seriesId ?? 1,
    };
  });

  return { awaitingDeployment: false, markets };
}

export async function fetchBasketsData(): Promise<{
  awaitingDeployment: boolean;
  baskets: BasketItem[];
}> {
  const rows = await supabaseSelect<{
    basket_address: string;
    narrative_id: number;
    name: string;
    symbol: string;
    nav_eth?: string | number;
    tokens?: string[];
    weights_bps?: number[];
  }>("baskets?select=*&order=narrative_id.asc", "anon");

  const liveBaskets = await readLiveBasketsFromChain();
  if (liveBaskets && liveBaskets.length > 0) {
    return { awaitingDeployment: false, baskets: liveBaskets };
  }

  if (!rows || rows.length === 0) {
    const now = Date.now();
    const previewBaskets: BasketItem[] = [
      {
        id: "ai-agents",
        basketAddress: "0x0000000000000000000000000000000000000000",
        narrativeId: 2,
        narrativeLabel: "AI Agents",
        name: "NTI AI Agents Basket",
        symbol: "ntiAI",
        navEth: 4.82,
        tvlEth: 4.82,
        tvlCapEth: 10.0,
        sharePriceEth: 0.01042,
        managementFeeBps: 50,
        lastRebalancedAt: new Date(now - 5 * 3600_000).toISOString(),
        holdings: [
          { symbol: "AGNT", name: "Agentic Router", address: "0x2c8e1d44a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0", weightBps: 4000, liquidityEth: 42.5, twap30mEth: 0.00084 },
          { symbol: "MIND", name: "Mind Mesh Compute", address: "0x2d9f2e55b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1", weightBps: 3500, liquidityEth: 31.2, twap30mEth: 0.00112 },
          { symbol: "PAYX", name: "Autonomous Pay Rail", address: "0x2eaf3f66c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2", weightBps: 2500, liquidityEth: 24.8, twap30mEth: 0.00051 },
        ],
      },
      {
        id: "defi",
        basketAddress: "0x0000000000000000000000000000000000000000",
        narrativeId: 8,
        narrativeLabel: "DeFi",
        name: "NTI Core DeFi Basket",
        symbol: "ntiDEFI",
        navEth: 6.15,
        tvlEth: 6.15,
        tvlCapEth: 10.0,
        sharePriceEth: 0.01018,
        managementFeeBps: 50,
        lastRebalancedAt: new Date(now - 11 * 3600_000).toISOString(),
        holdings: [
          { symbol: "LEND", name: "Robinhood Money Market", address: "0x8a1c3d44a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0", weightBps: 3800, liquidityEth: 68.0, twap30mEth: 0.0021 },
          { symbol: "YLDX", name: "Yield Aggregator V3", address: "0x8b2d4e55b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1", weightBps: 3400, liquidityEth: 51.4, twap30mEth: 0.00145 },
          { symbol: "LIQX", name: "Liquid Staking ETH", address: "0x8c3e5f66c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2", weightBps: 2800, liquidityEth: 37.9, twap30mEth: 0.00308 },
        ],
      },
      {
        id: "rwa",
        basketAddress: "0x0000000000000000000000000000000000000000",
        narrativeId: 3,
        narrativeLabel: "RWA",
        name: "NTI RWA Yield Basket",
        symbol: "ntiRWA",
        navEth: 3.4,
        tvlEth: 3.4,
        tvlCapEth: 10.0,
        sharePriceEth: 0.01009,
        managementFeeBps: 50,
        lastRebalancedAt: new Date(now - 8 * 3600_000).toISOString(),
        holdings: [
          { symbol: "TBIL", name: "Tokenized T-Bill Pool", address: "0x3a1c3d44a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0", weightBps: 4000, liquidityEth: 54.0, twap30mEth: 0.00042 },
          { symbol: "CRDT", name: "Private Credit Vault", address: "0x3b2d4e55b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1", weightBps: 3500, liquidityEth: 29.6, twap30mEth: 0.00095 },
          { symbol: "GLDX", name: "On-Chain Gold Reserve", address: "0x3c3e5f66c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2", weightBps: 2500, liquidityEth: 22.1, twap30mEth: 0.00178 },
        ],
      },
    ];
    return { awaitingDeployment: true, baskets: previewBaskets };
  }

  return {
    awaitingDeployment: false,
    baskets: rows.map((r) => {
      const meta = NARRATIVE_BY_ID.get(r.narrative_id);
      const nav = Number(r.nav_eth ?? 0) / 1e18;
      return {
        id: (meta?.slug ?? String(r.narrative_id)).replaceAll("_", "-"),
        basketAddress: normalizeHex(r.basket_address) ?? r.basket_address,
        narrativeId: r.narrative_id,
        narrativeLabel: meta?.label ?? `Narrative #${r.narrative_id}`,
        name: r.name,
        symbol: r.symbol,
        navEth: nav,
        tvlEth: nav,
        tvlCapEth: 10.0,
        sharePriceEth: 0.01,
        managementFeeBps: 50,
        lastRebalancedAt: new Date().toISOString(),
        holdings: (r.tokens ?? []).map((tok, i) => ({
          symbol: `TOK${i + 1}`,
          name: tok,
          address: tok,
          weightBps: r.weights_bps?.[i] ?? 0,
          liquidityEth: 25,
          twap30mEth: 0.001,
        })),
      };
    }),
  };
}

export async function fetchGrantsData(): Promise<{
  awaitingDeployment: boolean;
  rounds: GrantRoundItem[];
}> {
  const rows = await supabaseSelect<{
    round_id: number;
    budget_eth: string;
    snapshot_block: string;
    vote_end: string;
    status: "active" | "finalized" | "upcoming";
  }>("grant_rounds?select=*&order=round_id.desc&limit=5", "anon");

  const liveRounds = await readLiveGrantRoundsFromChain();
  if (liveRounds && liveRounds.length > 0) {
    return { awaitingDeployment: false, rounds: liveRounds };
  }

  if (!rows || rows.length === 0) {
    const now = Date.now();
    const previewRound: GrantRoundItem = {
      roundId: 1,
      status: "active",
      budgetEth: 2.4,
      snapshotBlock: 18_420_000,
      voteEnd: new Date(now + 4 * 86400_000).toISOString(),
      totalVotesNti: 14_200_000,
      quorumNti: 10_000_000,
      proposals: [
        {
          proposalId: 1,
          roundId: 1,
          title: "Open-Source X Omission Verifier CLI",
          summary: "Independent Rust validator kit for verifying 10% omission samples and Arweave dataset hashes locally.",
          narrativeId: 1,
          proposer: "0x41a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
          recipient: "0x41a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
          metadataHash: "0x11aa22bb33cc44dd55ee66ff77889900aabbccddeeff00112233445566778899",
          votesNti: 5_400_000,
          projectedShareBps: 3802,
          projectedEth: 0.9125,
          claimed: false,
        },
        {
          proposalId: 2,
          roundId: 1,
          title: "Pons V2 Liquidity & Graduation Subgraph",
          summary: "Low-latency indexer feed tracking Pons V2 phase-2 graduations and Uniswap V4 pool depth on Robinhood Chain.",
          narrativeId: 2,
          proposer: "0x52b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1",
          recipient: "0x52b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1",
          metadataHash: "0x22bb33cc44dd55ee66ff77889900aabbccddeeff00112233445566778899aabb",
          votesNti: 4_100_000,
          projectedShareBps: 2887,
          projectedEth: 0.6929,
          claimed: false,
        },
        {
          proposalId: 3,
          roundId: 1,
          title: "Prediction Market Narrative SDK & Bot Templates",
          summary: "Reference TypeScript strategies and Dune-compatible datasets for Prediction Markets & Perp DEX pairs.",
          narrativeId: 6,
          proposer: "0x63c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
          recipient: "0x63c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
          metadataHash: "0x33cc44dd55ee66ff77889900aabbccddeeff00112233445566778899aabbccdd",
          votesNti: 2_900_000,
          projectedShareBps: 2042,
          projectedEth: 0.4901,
          claimed: false,
        },
        {
          proposalId: 4,
          roundId: 1,
          title: "Curated DePIN & RWA Builder Registry",
          summary: "Community-curated verification registry for active non-tokenised infrastructure teams across the Heatmap.",
          narrativeId: 5,
          proposer: "0x74d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
          recipient: "0x74d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
          metadataHash: "0x44dd55ee66ff77889900aabbccddeeff00112233445566778899aabbccddeeff",
          votesNti: 1_800_000,
          projectedShareBps: 1269,
          projectedEth: 0.3045,
          claimed: false,
        },
      ],
    };
    return { awaitingDeployment: true, rounds: [previewRound] };
  }

  const liveMap = new Map((liveRounds ?? []).map((r) => [r.roundId, r]));

  return {
    awaitingDeployment: false,
    rounds: rows.map((r) => {
      const live = liveMap.get(r.round_id);
      return {
        roundId: r.round_id,
        status: r.status,
        budgetEth: Number(r.budget_eth) / 1e18,
        snapshotBlock: Number(r.snapshot_block),
        voteEnd: r.vote_end,
        totalVotesNti: live?.totalVotesNti ?? 0,
        quorumNti: live?.quorumNti ?? 100_000,
        proposals: live?.proposals ?? [],
      };
    }),
  };
}

export async function fetchGovernorProposals(): Promise<GovernorProposalItem[]> {
  const rows = await supabaseSelect<{
    proposal_id: string;
    proposer: string;
    description: string;
    status: string;
    vote_end: string;
  }>("governance_proposals?select=*&order=created_block.desc&limit=10", "anon");

  if (!rows || rows.length === 0) {
    const now = Date.now();
    return [
      {
        proposalId: "104829104",
        title: "NTI-GP-01: Enable Permissionless Validator Bonding (5M $NTI Minimum)",
        category: "Validators",
        proposer: "0x71C04f92a38D4bE21970bA19e39a8E224a77f101",
        status: "Active",
        forVotesNti: 34_500_000,
        againstVotesNti: 2_100_000,
        abstainVotesNti: 800_000,
        quorumNti: 40_000_000,
        voteEndAt: new Date(now + 44 * 3600_000).toISOString(),
        summary: "Transitions OracleCommit from bootstrap validator set to open permissionless staking with 5M $NTI bond and 50/50 slash split.",
      },
      {
        proposalId: "104829103",
        title: "NTI-GP-02: Raise NarrativeMarket maxPoolPerMarket from 5 ETH to 15 ETH",
        category: "Risk Limits",
        proposer: "0x82D15a03b49E5cF32081cB20f40b9F335b88a202",
        status: "Queued",
        forVotesNti: 48_200_000,
        againstVotesNti: 6_400_000,
        abstainVotesNti: 1_200_000,
        quorumNti: 40_000_000,
        voteEndAt: new Date(now - 12 * 3600_000).toISOString(),
        summary: "48h Timelock queue active after passing 4% quorum following 30 days of zero-incident market settlements.",
      },
      {
        proposalId: "104829101",
        title: "NTI-GP-03: Whitelist Uniswap V3 Pool for AI Agents Basket",
        category: "Basket Whitelist",
        proposer: "0x93E26b14c50F6dA43192dC31a51c0A446c99b303",
        status: "Executed",
        forVotesNti: 52_000_000,
        againstVotesNti: 1_500_000,
        abstainVotesNti: 500_000,
        quorumNti: 40_000_000,
        voteEndAt: new Date(now - 96 * 3600_000).toISOString(),
        summary: "Verified >20 ETH liquidity and 30-minute TWAP observationCardinality on Robinhood Chain V3 factory.",
      },
    ];
  }

  return rows.map((r) => ({
    proposalId: r.proposal_id,
    title: r.description.split("\n")[0] || `Proposal #${r.proposal_id}`,
    category: "Config",
    proposer: r.proposer,
    status: (r.status.charAt(0).toUpperCase() + r.status.slice(1)) as GovernorProposalItem["status"],
    forVotesNti: 0,
    againstVotesNti: 0,
    abstainVotesNti: 0,
    quorumNti: 40_000_000,
    voteEndAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    summary: r.description,
  }));
}

export interface ActiveConfigVersion {
  version: number;
  configHash: string;
  modelVersion: string;
  promptVersion: string;
  payload: {
    version: number;
    epoch_seconds: number;
    half_life_hours: number;
    alpha: string;
    lookback_hours: number;
    kol_cap: string;
    kol_active_min_q: string;
    v_lag_epochs: number;
    v_min_index_bps: number;
    v_min_weighted_posts: number;
    engagement_reread_hours: number;
    classifier: { batch_size: number; temperature: number; min_agreement: number };
    validator: { sample_fraction: number; min_overlap: number; max_delta_bps: number };
    narratives: number[];
  };
}

export const DEFAULT_NTI_V1_CONFIG: ActiveConfigVersion = {
  version: 1,
  configHash: "0x9f12b7c4e82100a3f4c8d1e7a2b56c9031d4e6f8a0b2c4d6e8f0a1b3c5d7e9f1",
  modelVersion: "gemini-2.5-flash-lite@2026-11",
  promptVersion: "v1.0.0",
  payload: {
    version: 1,
    epoch_seconds: 14400,
    half_life_hours: 48,
    alpha: "0.3",
    lookback_hours: 168,
    kol_cap: "0.10",
    kol_active_min_q: "0.05",
    v_lag_epochs: 6,
    v_min_index_bps: 200,
    v_min_weighted_posts: 30,
    engagement_reread_hours: 24,
    classifier: { batch_size: 100, temperature: 0, min_agreement: 0.85 },
    validator: { sample_fraction: 0.1, min_overlap: 0.95, max_delta_bps: 100 },
    narratives: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
};

export async function fetchActiveConfig(): Promise<ActiveConfigVersion> {
  const rows = await supabaseSelect<{
    version: number;
    config_hash: string;
    payload: ActiveConfigVersion["payload"];
  }>("config_versions?select=*&order=version.desc&limit=1", "anon");

  if (!rows || rows.length === 0) {
    return DEFAULT_NTI_V1_CONFIG;
  }
  const latest = rows[0]!;
  return {
    version: latest.version,
    configHash: normalizeHex(latest.config_hash) ?? DEFAULT_NTI_V1_CONFIG.configHash,
    modelVersion: DEFAULT_NTI_V1_CONFIG.modelVersion,
    promptVersion: DEFAULT_NTI_V1_CONFIG.promptVersion,
    payload: latest.payload ?? DEFAULT_NTI_V1_CONFIG.payload,
  };
}
