import { unstable_cache } from "next/cache";
import { NARRATIVES, NARRATIVE_BY_ID } from "@nti/sdk";
import { encodeAbiParameters, isAddress, keccak256, maxUint256, stringToHex, type Address, type Hex } from "viem";
import { getActiveChainId, getProtocolAddresses } from "./contracts";
import {
  readLiveBasketsFromChain,
  readGovernorStates,
  readLiveGrantRoundsFromChain,
  readLiveMarketsFromChain,
  readPonsLogos,
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
  KolLeaderboardItem,
  KolLeaderboardResponse,
  MarketItem,
  MentionedTokenItem,
  NarrativeHistoryResponse,
  NarrativeIndexItem,
  RadarAlertItem,
  RecentLaunchItem,
  RadarResponse,
  TokenItem,
  TopPostItem,
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

export const PUBLIC_DATA_REVALIDATE_SECONDS = 15;

async function fetchSupabaseRows(pathWithQuery: string, mode: "anon" | "service"): Promise<unknown[]> {
  const cfg = getSupabaseConfig();
  const key = mode === "service" ? cfg.serviceKey ?? cfg.anonKey : cfg.anonKey;
  if (!cfg.url || !key) throw new Error("Supabase is not configured");
  const res = await fetch(`${cfg.url}/rest/v1/${pathWithQuery}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Supabase returned a non-array body");
  return data;
}

// Pages are rendered per request, but these rows are public and identical for every visitor, so a 15 second
// shared cache removes the round trip from most navigations. A failed read throws inside the cache wrapper and
// is therefore never cached.
const cachedSupabaseRows = unstable_cache(fetchSupabaseRows, ["supabase-select"], {
  revalidate: PUBLIC_DATA_REVALIDATE_SECONDS,
});
// Heavy joins (posts with classifications and engagement) and data that only moves every few minutes at most
// (epoch history, token list) keep a longer cache, so a click on a narrative is rarely a cold query.
const SLOW_DATA_REVALIDATE_SECONDS = 300;
const cachedSlowSupabaseRows = unstable_cache(fetchSupabaseRows, ["supabase-select-slow"], {
  revalidate: SLOW_DATA_REVALIDATE_SECONDS,
});

export async function supabaseSelect<T>(
  pathWithQuery: string,
  mode: "anon" | "service" = "anon",
  freshness: "live" | "slow" = "live",
): Promise<T[] | null> {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !(mode === "service" ? cfg.serviceKey ?? cfg.anonKey : cfg.anonKey)) return null;
  try {
    const read = freshness === "slow" ? cachedSlowSupabaseRows : cachedSupabaseRows;
    return (await read(pathWithQuery, mode)) as T[];
  } catch {
    return null;
  }
}

interface DbEpochRow {
  epoch_id: number;
  series_id: number;
  status: EpochStatus;
  dataset_hash: string | null;
  arweave_tx: string | null;
  arweave_tx_bytes32?: string | null;
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

/** Recover an overwritten local locator only if the chain commitment authenticates it. */
function datasetUrlFor(row: DbEpochRow): string | null {
  const datasetHash = normalizeHex(row.dataset_hash)?.toLowerCase();
  const expectedLocal = datasetHash && /^0x[0-9a-f]{64}$/.test(datasetHash)
    ? `local_${row.epoch_id}_${datasetHash.slice(2, 18)}`
    : null;
  const stored = normalizeHex(row.arweave_tx);
  const commitment = normalizeHex(row.arweave_tx_bytes32) ??
    (stored && /^0x[0-9a-fA-F]{64}$/.test(stored) ? stored : null);

  if (expectedLocal && (
    commitment ? keccak256(stringToHex(expectedLocal)) === commitment.toLowerCase() : stored === expectedLocal
  )) {
    const base = getSupabaseConfig().url;
    return base ? `${base}/storage/v1/object/public/nti-datasets/${expectedLocal}.jsonl.gz` : null;
  }

  if (!stored || (commitment && keccak256(stringToHex(stored)) !== commitment.toLowerCase())) return null;
  if (/^[A-Za-z0-9_-]{43}$/.test(stored)) return `https://arweave.net/${stored}`;

  const cid = stored.startsWith("ipfs://") ? stored.slice(7) : stored;
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{25,})$/.test(cid)) return `https://ipfs.io/ipfs/${cid}`;
  return null;
}

function mapEpoch(r: DbEpochRow): EpochSummary {
  return {
    epochId: r.epoch_id,
    seriesId: r.series_id,
    status: r.status,
    datasetHash: normalizeHex(r.dataset_hash),
    arweaveTx: r.arweave_tx,
    datasetUrl: datasetUrlFor(r),
    configHash: normalizeHex(r.config_hash),
    commitTx: normalizeHex(r.commit_tx),
    committedAt: r.committed_at,
    finalizedAt: r.finalized_at,
  };
}

function mapNarrative(meta: (typeof NARRATIVES)[number], row: DbNarrativeEpochRow): NarrativeIndexItem {
  return {
    narrativeId: meta.id,
    slug: meta.slug,
    label: meta.label,
    description: meta.description,
    sN: Number(row.s_n),
    mBps: row.m_bps,
    iBps: row.i_bps,
    vBps: row.v_bps,
    vFlag: row.v_flag,
    weightedPosts: Number(row.weighted_posts),
  };
}

function mapHistory(epochs: DbEpochRow[], rows: DbNarrativeEpochRow[]): HistoryPoint[] {
  const byEpoch = new Map(rows.map((row) => [row.epoch_id, row]));
  const history: HistoryPoint[] = [];
  let previous: DbEpochRow | undefined;
  for (const epoch of epochs) {
    if (epoch.status !== "final" && epoch.status !== "incomplete") continue;
    const row = byEpoch.get(epoch.epoch_id);
    const incomplete = epoch.status === "incomplete";
    const seriesBreak = row?.v_flag === "series_break" ||
      (previous !== undefined && epoch.series_id !== previous.series_id);
    const vFlag: VFlag = seriesBreak ? "series_break" :
      incomplete || previous?.status === "incomplete" ? "incomplete_gap" : row?.v_flag ?? null;
    previous = epoch;
    if (!incomplete && !row) continue;

    history.push({
      epochId: epoch.epoch_id,
      seriesId: epoch.series_id,
      status: epoch.status,
      sN: incomplete || !row ? 0 : Number(row.s_n),
      mBps: incomplete || !row ? 0 : row.m_bps,
      iBps: incomplete || !row ? 0 : row.i_bps,
      vBps: vFlag ? null : row?.v_bps ?? null,
      vFlag,
      weightedPosts: incomplete || !row ? 0 : Number(row.weighted_posts),
      seriesBreak,
      incomplete,
      finalizedAt: epoch.finalized_at,
    });
  }
  return history;
}

export async function fetchIndexesSnapshot(): Promise<IndexesSnapshot> {
  const [epochs, finals] = await Promise.all([
    supabaseSelect<DbEpochRow>("epochs?select=*&order=epoch_id.desc&limit=20"),
    supabaseSelect<DbEpochRow>("epochs?select=*&status=eq.final&order=epoch_id.desc&limit=1"),
  ]);
  const latestObserved = epochs?.[0] ? mapEpoch(epochs[0]) : null;
  const latestFinalRow = epochs?.find((epoch) =>
    epoch.status === "final" && epoch.epoch_id > (finals?.[0]?.epoch_id ?? 0),
  ) ?? finals?.[0];
  const latestFinalEpoch = latestFinalRow ? mapEpoch(latestFinalRow) : null;
  const unavailable = epochs === null || finals === null;
  const snapshot: IndexesSnapshot = {
    awaitingFirstEpoch: !unavailable && !latestFinalEpoch,
    dataSource: unavailable ? "unavailable" : "supabase",
    latestFinalEpoch,
    latestObservedEpoch: latestObserved,
    pendingFinalization: latestObserved?.status === "committed" || latestObserved?.status === "disputed",
    narratives: [],
    recentSeries: {},
    updatedAt: new Date().toISOString(),
  };

  if (unavailable) return snapshot;
  const relevant = epochs.filter((epoch) => epoch.status === "final" || epoch.status === "incomplete");
  if (latestFinalRow && !relevant.some((epoch) => epoch.epoch_id === latestFinalRow.epoch_id)) {
    relevant.push(latestFinalRow);
  }
  relevant.sort((a, b) => a.epoch_id - b.epoch_id);
  if (relevant.length === 0) return snapshot;

  const epochIds = relevant.map((epoch) => epoch.epoch_id).join(",");
  const rows = await supabaseSelect<DbNarrativeEpochRow>(
    `narrative_epoch?select=*&epoch_id=in.(${epochIds})&order=epoch_id.asc`,
  );
  if (!rows) return { ...snapshot, dataSource: "unavailable" };

  for (const meta of NARRATIVES) {
    const series = mapHistory(relevant, rows.filter((row) => row.narrative_id === meta.id));
    snapshot.recentSeries[meta.id] = series;
    const latest = rows.find((row) => row.epoch_id === latestFinalRow?.epoch_id && row.narrative_id === meta.id);
    if (latest) snapshot.narratives.push(mapNarrative(meta, latest));
  }
  if (latestFinalEpoch && snapshot.narratives.length !== NARRATIVES.length) {
    return { ...snapshot, dataSource: "unavailable", narratives: [] };
  }
  return snapshot;
}

const TICKER_REGEX = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/g;
const TICKER_STOPWORDS = new Set([
  "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "CHF", "KRW", "INR", "IDR",
]);

interface DexMarketInfo {
  name: string | null;
  chainId: string | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  dexUrl: string | null;
  imageUrl: string | null;
}

const dexCache = new Map<string, { expiresAt: number; data: DexMarketInfo | null }>();
const DEX_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchDexMarketInfo(symbol: string): Promise<DexMarketInfo | null> {
  const key = symbol.toUpperCase();
  const cached = dexCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(key)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      pairs?: Array<{
        chainId?: string;
        url?: string;
        priceUsd?: string;
        baseToken?: { symbol?: string; name?: string };
        liquidity?: { usd?: number };
        volume?: { h24?: number };
        priceChange?: { h24?: number };
        txns?: { h24?: { buys?: number; sells?: number } };
        info?: { imageUrl?: string };
      }>;
    };
    const pairs = (json.pairs ?? []).filter((pair) => {
      if ((pair.baseToken?.symbol ?? "").toUpperCase() !== key) return false;
      const liq = Number(pair.liquidity?.usd ?? 0);
      const tx24 = Number(pair.txns?.h24?.buys ?? 0) + Number(pair.txns?.h24?.sells ?? 0);
      return liq >= 50_000 && tx24 >= 20;
    });
    pairs.sort((a, b) => Number(b.volume?.h24 ?? 0) - Number(a.volume?.h24 ?? 0));
    const best = pairs[0];
    const data: DexMarketInfo | null = best
      ? {
          name: best.baseToken?.name ?? null,
          chainId: best.chainId ?? null,
          priceUsd: best.priceUsd != null && Number.isFinite(Number(best.priceUsd)) ? Number(best.priceUsd) : null,
          volume24hUsd: best.volume?.h24 != null && Number.isFinite(Number(best.volume.h24)) ? Number(best.volume.h24) : null,
          change24hPct: best.priceChange?.h24 != null && Number.isFinite(Number(best.priceChange.h24)) ? Number(best.priceChange.h24) : null,
          dexUrl: best.url ?? null,
          imageUrl: best.info?.imageUrl ?? null,
        }
      : null;
    dexCache.set(key, { expiresAt: Date.now() + DEX_CACHE_TTL_MS, data });
    return data;
  } catch {
    return null;
  }
}

export async function fetchNarrativeHistory(
  narrativeId: number,
  fromEpoch?: number,
  toEpoch?: number,
): Promise<NarrativeHistoryResponse> {
  const meta = NARRATIVE_BY_ID.get(narrativeId) ?? NARRATIVES[0]!;

  const filters: string[] = [];
  if (Number.isSafeInteger(fromEpoch)) filters.push(`epoch_id=gte.${fromEpoch}`);
  if (Number.isSafeInteger(toEpoch)) filters.push(`epoch_id=lte.${toEpoch}`);

  type ContribRow = {
    user_id: number;
    share_bps: number;
    capped: boolean;
    kols?: {
      handle?: string;
      followers?: number;
      display_name?: string | null;
      avatar_url?: string | null;
    } | null;
  };
  type TokenRow = {
    address: string;
    symbol: string | null;
    name: string | null;
    source: "pons_v1" | "pons_v2" | "uniswap" | "testnet_mock" | null;
    graduated: boolean;
    liquidity_eth: number | string | null;
    narrative_id: number | null;
    txs_7d: number;
    created_at: string | null;
  };
  type PostRow = {
    tweet_id: number | string;
    user_id: number | string;
    created_at: string;
    body?: string | null;
    kols?: {
      handle?: string;
      followers?: number;
      display_name?: string | null;
      avatar_url?: string | null;
    } | null;
    post_engagement?: Array<{
      likes?: number;
      reposts?: number;
      quotes?: number;
      replies?: number;
      fetched_at?: string;
    }> | null;
    classifications?: Array<{
      q?: Record<string, number> | null;
    }> | null;
  };

  // Two independent chains run side by side instead of one four-step waterfall:
  //   A: latest final epoch -> its top contributors -> their recent posts
  //   B: epoch history -> this narrative's rows for those epochs
  const chainA = async () => {
    const finals = await supabaseSelect<DbEpochRow>(
      "epochs?select=*&status=eq.final&order=epoch_id.desc&limit=1",
      "anon",
      "slow",
    );
    const latestFinalRow = finals?.[0];
    const contribRows = latestFinalRow
      ? await supabaseSelect<ContribRow>(
          `kol_contribution?select=user_id,share_bps,capped,kols(handle,followers,display_name,avatar_url)&epoch_id=eq.${latestFinalRow.epoch_id}&narrative_id=eq.${meta.id}&order=share_bps.desc&limit=20`,
          "service",
          "slow",
        )
      : [];
    const contributorIds = (contribRows ?? []).map((c) => String(c.user_id));
    const postsFilter = contributorIds.length > 0 ? `&user_id=in.(${contributorIds.join(",")})` : "";
    const postRows = await supabaseSelect<PostRow>(
      `posts?select=tweet_id,user_id,created_at,body,kols(handle,followers,display_name,avatar_url),post_engagement(likes,reposts,quotes,replies,fetched_at),classifications!inner(q)${postsFilter}&order=created_at.desc&limit=400`,
      "service",
      "slow",
    );
    return { finals, latestFinalRow, contribRows, postRows };
  };
  const chainB = async () => {
    const epochs = await supabaseSelect<DbEpochRow>(
      ["epochs?select=*", "status=in.(final,incomplete)", ...filters, "order=epoch_id.desc", "limit=120"].join("&"),
      "anon",
      "slow",
    );
    const epochIds = (epochs ?? []).map((epoch) => epoch.epoch_id);
    const neRows =
      epochIds.length > 0
        ? await supabaseSelect<DbNarrativeEpochRow>(
            `narrative_epoch?select=*&narrative_id=eq.${meta.id}&epoch_id=in.(${epochIds.join(",")})&order=epoch_id.asc`,
            "anon",
            "slow",
          )
        : [];
    return { epochs, neRows };
  };
  const [{ finals, latestFinalRow, contribRows, postRows }, { epochs, neRows }, tokenRows] = await Promise.all([
    chainA(),
    chainB(),
    supabaseSelect<TokenRow>(
      `tokens?select=*&narrative_id=eq.${meta.id}&order=liquidity_eth.desc.nullslast&limit=25`,
      "anon",
      "slow",
    ),
  ]);
  const latestFinalEpoch = latestFinalRow ? mapEpoch(latestFinalRow) : null;

  const series = mapHistory([...(epochs ?? [])].reverse(), neRows ?? []);

  const contributors: ContributorRow[] = (contribRows ?? []).map((c) => ({
    userId: String(c.user_id),
    handle: c.kols?.handle ?? `kol_${c.user_id}`,
    followers: c.kols?.followers ?? 0,
    displayName: c.kols?.display_name ?? undefined,
    avatarUrl: c.kols?.avatar_url ?? undefined,
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

  const scoredPosts: Array<{ influence: number; item: TopPostItem }> = [];
  const tickerStats = new Map<string, { mentions: number; weightedQ: number; kols: Set<string> }>();
  for (const p of postRows ?? []) {
    const clsList = p.classifications ?? [];
    let bestQ = 0;
    for (const c of clsList) {
      const qObj = c.q;
      if (!qObj || typeof qObj !== "object") continue;
      const candidate = Number(qObj[meta.slug] ?? qObj[String(meta.id)] ?? 0);
      if (Number.isFinite(candidate) && candidate > bestQ) bestQ = candidate;
    }
    if (bestQ < 0.25) continue;

    // Extract $TICKER mentions strictly server-side; raw body is never returned to clients.
    if (typeof p.body === "string" && p.body.length > 0) {
      const seenInPost = new Set<string>();
      for (const match of p.body.matchAll(TICKER_REGEX)) {
        const sym = match[1]?.toUpperCase();
        if (!sym || TICKER_STOPWORDS.has(sym) || seenInPost.has(sym)) continue;
        seenInPost.add(sym);
        const prev = tickerStats.get(sym) ?? { mentions: 0, weightedQ: 0, kols: new Set<string>() };
        prev.mentions += 1;
        prev.weightedQ += bestQ;
        prev.kols.add(String(p.user_id));
        tickerStats.set(sym, prev);
      }
    }

    const engList = p.post_engagement ?? [];
    let likes = 0;
    let reposts = 0;
    let quotes = 0;
    let replies = 0;
    let bestEngSum = -1;
    for (const e of engList) {
      const l = Number(e.likes ?? 0);
      const rp = Number(e.reposts ?? 0);
      const qt = Number(e.quotes ?? 0);
      const rl = Number(e.replies ?? 0);
      const sum = l + rp + qt + rl;
      if (sum > bestEngSum) {
        bestEngSum = sum;
        likes = l;
        reposts = rp;
        quotes = qt;
        replies = rl;
      }
    }

    const item: TopPostItem = {
      tweetId: String(p.tweet_id),
      handle: p.kols?.handle ?? `kol_${p.user_id}`,
      followers: Number(p.kols?.followers ?? 0),
      likes,
      reposts,
      quotes,
      replies,
      relevanceQ: bestQ,
      createdAt: p.created_at,
    };
    if (p.kols?.display_name) item.displayName = p.kols.display_name;
    if (p.kols?.avatar_url) item.avatarUrl = p.kols.avatar_url;

    scoredPosts.push({
      influence: bestQ * Math.log1p(likes + 2 * reposts + 3 * quotes + replies),
      item,
    });
  }

  const topPosts: TopPostItem[] = [];
  const countByHandle = new Map<string, number>();
  for (const entry of scoredPosts.sort((a, b) => b.influence - a.influence)) {
    const seen = countByHandle.get(entry.item.handle) ?? 0;
    if (seen >= 2) continue;
    countByHandle.set(entry.item.handle, seen + 1);
    topPosts.push(entry.item);
    if (topPosts.length >= 8) break;
  }

  const topTickers = [...tickerStats.entries()]
    .sort((a, b) => b[1].weightedQ - a[1].weightedQ || b[1].kols.size - a[1].kols.size || b[1].mentions - a[1].mentions)
    .slice(0, 8);

  const marketInfos = await Promise.all(
    topTickers.map(([symbol]) => fetchDexMarketInfo(symbol)),
  );

  const mentionedTokens: MentionedTokenItem[] = topTickers.map(([symbol, stat], idx) => {
    const market = marketInfos[idx] ?? null;
    return {
      symbol,
      name: market?.name ?? null,
      mentions: stat.mentions,
      kolCount: stat.kols.size,
      weightedQ: Number(stat.weightedQ.toFixed(2)),
      chainId: market?.chainId ?? null,
      priceUsd: market?.priceUsd ?? null,
      volume24hUsd: market?.volume24hUsd ?? null,
      change24hPct: market?.change24hPct ?? null,
      dexUrl: market?.dexUrl ?? null,
      imageUrl: market?.imageUrl ?? null,
    };
  });

  return {
    awaitingFirstEpoch: finals !== null && !latestFinalEpoch,
    dataSource: epochs && finals && neRows ? "supabase" : "unavailable",
    narrative: meta,
    latestFinalEpoch,
    series,
    contributors,
    tokens,
    mentionedTokens,
    topPosts,
  };
}

export async function fetchEpochDetail(epochId?: number): Promise<EpochDetailResponse> {
  const [recentRows, requestedRows] = await Promise.all([
    supabaseSelect<DbEpochRow>("epochs?select=*&order=epoch_id.desc&limit=12"),
    epochId === undefined
      ? Promise.resolve(undefined)
      : supabaseSelect<DbEpochRow>(`epochs?select=*&epoch_id=eq.${epochId}&limit=1`),
  ]);
  const target = epochId === undefined ? recentRows?.[0] : requestedRows?.[0];
  const recentEpochs = (recentRows ?? []).map(mapEpoch);
  if (!target) {
    return {
      awaitingFirstEpoch: epochId === undefined && recentRows !== null,
      dataSource: recentRows === null || requestedRows === null ? "unavailable" : "supabase",
      epoch: null,
      narratives: [],
      attestations: [],
      disputes: [],
      recentEpochs,
    };
  }
  if (!recentEpochs.some((epoch) => epoch.epochId === target.epoch_id)) {
    recentEpochs.push(mapEpoch(target));
  }

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

  const byId = new Map((neRows ?? []).map((row) => [row.narrative_id, row]));
  const narratives = NARRATIVES.flatMap((meta) => {
    const row = byId.get(meta.id);
    return row ? [mapNarrative(meta, row)] : [];
  });
  const medianVec = NARRATIVES.map((meta) => byId.get(meta.id)?.i_bps);
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
      matchesMedian: a.i_bps.length === NARRATIVES.length && narratives.length === NARRATIVES.length
        ? maxDelta === 0
        : null,
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
    dataSource: neRows && attRows && dispRows ? "supabase" : "unavailable",
    epoch: mapEpoch(target),
    narratives,
    attestations,
    disputes,
    recentEpochs,
  };
}

/** Newest Pons launches the discovery job is watching, including those still below the 1 ETH alert threshold. */
export async function fetchRecentLaunches(limit = 25): Promise<RecentLaunchItem[]> {
  const rows = await supabaseSelect<{
    address: string;
    symbol: string;
    name: string;
    created_at: string;
    graduated: boolean;
    liquidity_eth: number | string | null;
    narrative_id: number | null;
  }>(
    `tokens?select=address,symbol,name,created_at,graduated,liquidity_eth,narrative_id&source=eq.pons_v2&order=created_at.desc&limit=${limit}`,
    "anon",
  );
  const addresses = (rows ?? [])
    .map((r) => normalizeHex(r.address) ?? r.address)
    .filter((a): a is Address => isAddress(a, { strict: false }));
  const logos = await readPonsLogos(addresses);
  return (rows ?? []).map((r) => {
    const address = normalizeHex(r.address) ?? r.address;
    return {
      address,
      symbol: r.symbol,
      name: r.name,
      createdAt: r.created_at,
      graduated: r.graduated,
      liquidityEth: Number(r.liquidity_eth ?? 0),
      narrativeLabel: r.narrative_id ? (NARRATIVE_BY_ID.get(r.narrative_id)?.label ?? null) : null,
      imageUrl: logos[address.toLowerCase()] ?? null,
    };
  });
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

  let lockedCount = 0;
  const alerts: RadarAlertItem[] = (rows ?? []).map((r) => {
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
    dataSource: rows ? "supabase" : "unavailable",
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

  if (!tokenRows || !projectRows) {
    return { awaitingFirstEpoch: snapshot.awaitingFirstEpoch, dataSource: "unavailable", latestFinalEpoch: snapshot.latestFinalEpoch, points: [] };
  }

  const tokenCountByNar = new Map<number, number>();
  const curatedByNar = new Map<number, number>();
  for (const t of tokenRows) {
    if (t.narrative_id && Number(t.liquidity_eth ?? 0) >= 1 && t.txs_7d >= 10) {
      tokenCountByNar.set(t.narrative_id, (tokenCountByNar.get(t.narrative_id) ?? 0) + 1);
    }
  }
  for (const p of projectRows) {
    if (p.active && p.curated) {
      curatedByNar.set(p.narrative_id, (curatedByNar.get(p.narrative_id) ?? 0) + 1);
    }
  }

  const rawPoints = snapshot.narratives.map((n) => {
    const activeTokens = tokenCountByNar.get(n.narrativeId) ?? 0;
    const curatedProjects = curatedByNar.get(n.narrativeId) ?? 0;
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

export async function fetchMarketsData(): Promise<{ awaitingDeployment: boolean; markets: MarketItem[] }> {
  const snapshot = await fetchIndexesSnapshot();
  const indexes = new Map(snapshot.narratives.map((item) => [item.narrativeId, item.iBps]));
  const markets = await readLiveMarketsFromChain(indexes);
  // A market compares two epochs of one series. Series only ever increase, so once the newest final epoch is in a
  // later series than the market's base, the settlement epoch cannot be in the base series and the contract refunds.
  const latestSeries = snapshot.latestFinalEpoch?.seriesId ?? null;
  const flagged = (markets ?? []).map((m) => ({
    ...m,
    refundBound:
      latestSeries !== null && (m.status === "open" || m.status === "locked") && latestSeries > m.seriesId,
  }));
  return { awaitingDeployment: markets === null, markets: flagged };
}

export async function fetchBasketsData(): Promise<{ awaitingDeployment: boolean; baskets: BasketItem[] }> {
  const baskets = await readLiveBasketsFromChain();
  return { awaitingDeployment: baskets === null, baskets: baskets ?? [] };
}

export async function fetchGrantsData(): Promise<{ awaitingDeployment: boolean; rounds: GrantRoundItem[] }> {
  const rounds = await readLiveGrantRoundsFromChain();
  return { awaitingDeployment: rounds === null, rounds: rounds ?? [] };
}

interface DbGovernorProposal {
  proposal_id: string;
  proposer: string;
  description: string;
  targets: Address[];
  values: Array<string | number>;
  calldatas: Hex[];
}

function governorActions(row: DbGovernorProposal): GovernorProposalItem["actions"] {
  const { targets, values, calldatas, description } = row;
  if (!Array.isArray(targets) || !Array.isArray(values) || !Array.isArray(calldatas) ||
      targets.length === 0 || targets.length !== values.length || targets.length !== calldatas.length ||
      !targets.every((target) => isAddress(target, { strict: false })) ||
      !values.every((value) => /^\d{1,78}$/.test(String(value)) && BigInt(value) <= maxUint256 &&
        (typeof value !== "number" || Number.isSafeInteger(value))) ||
      !calldatas.every((calldata) => typeof calldata === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(calldata))) return null;

  const hash = keccak256(encodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }],
    [targets, values.map(BigInt), calldatas, keccak256(stringToHex(description))],
  ));
  if (BigInt(hash) !== BigInt(row.proposal_id)) return null;
  return targets.map((target, index) => ({
    target, value: String(values[index]), calldata: calldatas[index]!,
  }));
}

export async function fetchGovernorProposals(): Promise<GovernorProposalItem[] | null> {
  const chainId = getActiveChainId();
  const governor = getProtocolAddresses(chainId).governor;
  if (!governor) return null;

  // Cast uint256 proposal IDs to strings before JSON serialization. A JSON number loses precision.
  const query = `governance_proposals?select=proposal_id::text,proposer,description,targets,values,calldatas&chain_id=eq.${chainId}&created_block=not.is.null&order=created_block.desc&limit=20`;
  const addressFilter = encodeURIComponent(`\\x${governor.slice(2).toLowerCase()}`);
  const rows = await supabaseSelect<DbGovernorProposal>(
    `${query}&governor_address=eq.${addressFilter}`,
  );
  if (!rows) return null;

  const validRows = rows.filter((row) => typeof row.proposal_id === "string" && /^\d{1,78}$/.test(row.proposal_id) && BigInt(row.proposal_id) <= maxUint256);
  const states = await readGovernorStates(validRows.map((row) => BigInt(row.proposal_id)));
  return validRows.flatMap((row, index) => {
    const state = states[index];
    if (!state) return [];
    const description = row.description ?? "";
    return [{
      ...state,
      proposalId: row.proposal_id,
      title: description.split("\n")[0] || `Proposal #${row.proposal_id}`,
      proposer: normalizeHex(row.proposer) ?? "",
      summary: description,
      actions: governorActions({ ...row, description }),
    }];
  });
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
  configHash: "0x07acec1d77949027e6ba95a4ec7b43ce380fb70efd317e79d0f024e4afc8c297",
  modelVersion: "mimo-v2.6-pro",
  promptVersion: "v1",
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
  const [rows, llmRows] = await Promise.all([
    supabaseSelect<{
      version: number;
      config_hash: string;
      payload: ActiveConfigVersion["payload"];
    }>("config_versions?select=*&order=version.desc&limit=1", "anon"),
    supabaseSelect<{
      model_version: string;
      prompt_version: string;
    }>("llm_runs?select=model_version,prompt_version&order=id.desc&limit=1", "service"),
  ]);

  const liveModel = llmRows?.[0]?.model_version || DEFAULT_NTI_V1_CONFIG.modelVersion;
  const livePrompt = llmRows?.[0]?.prompt_version || DEFAULT_NTI_V1_CONFIG.promptVersion;

  if (!rows || rows.length === 0) {
    return {
      ...DEFAULT_NTI_V1_CONFIG,
      modelVersion: liveModel,
      promptVersion: livePrompt,
    };
  }
  const latest = rows[0]!;
  return {
    version: latest.version,
    configHash: normalizeHex(latest.config_hash) ?? DEFAULT_NTI_V1_CONFIG.configHash,
    modelVersion: liveModel,
    promptVersion: livePrompt,
    payload: latest.payload ?? DEFAULT_NTI_V1_CONFIG.payload,
  };
}

export async function fetchKolLeaderboard(): Promise<KolLeaderboardResponse> {
  const [kolRowsPage1, kolRowsPage2, linkRowsPage1, linkRowsPage2] = await Promise.all([
    supabaseSelect<{
      user_id: number | string;
      handle: string;
      display_name?: string | null;
      avatar_url?: string | null;
      followers: number;
      r_k: number | string;
      h_k: number;
      poll_tier: number;
    }>(
      "kols?select=user_id,handle,display_name,avatar_url,followers,r_k,h_k,poll_tier&active=eq.true&order=followers.desc&limit=1000&offset=0",
      "service",
    ),
    supabaseSelect<{
      user_id: number | string;
      handle: string;
      display_name?: string | null;
      avatar_url?: string | null;
      followers: number;
      r_k: number | string;
      h_k: number;
      poll_tier: number;
    }>(
      "kols?select=user_id,handle,display_name,avatar_url,followers,r_k,h_k,poll_tier&active=eq.true&order=followers.desc&limit=1000&offset=1000",
      "service",
    ),
    supabaseSelect<{ user_id: number | string; narrative_id: number }>(
      "kol_narratives?select=user_id,narrative_id&limit=1000&offset=0",
      "service",
    ),
    supabaseSelect<{ user_id: number | string; narrative_id: number }>(
      "kol_narratives?select=user_id,narrative_id&limit=1000&offset=1000",
      "service",
    ),
  ]);

  if (!kolRowsPage1) {
    return {
      dataSource: "unavailable",
      totalActive: 0,
      tier1Count: 0,
      flaggedBots: 0,
      avgReputation: 0,
      kols: [],
    };
  }

  const allKols = [...kolRowsPage1, ...(kolRowsPage2 ?? [])];
  const narrMap = new Map<string, number[]>();
  for (const link of [...(linkRowsPage1 ?? []), ...(linkRowsPage2 ?? [])]) {
    const uid = String(link.user_id);
    const list = narrMap.get(uid) ?? [];
    if (!list.includes(link.narrative_id)) list.push(link.narrative_id);
    narrMap.set(uid, list);
  }

  let tier1Count = 0;
  let flaggedBots = 0;
  let repSum = 0;
  const items: KolLeaderboardItem[] = allKols.map((k) => {
    const uid = String(k.user_id);
    const followers = Number(k.followers ?? 0);
    const rK = Number(k.r_k ?? 1);
    const hK = Number(k.h_k ?? 1);
    const pollTier = Number(k.poll_tier ?? 4);
    if (pollTier === 1) tier1Count += 1;
    if (hK === 0) flaggedBots += 1;
    repSum += rK;
    const authorityScore = hK > 0 ? Math.log1p(Math.max(0, followers)) * rK : 0;
    const item: KolLeaderboardItem = {
      userId: uid,
      handle: k.handle,
      followers,
      rK,
      hK,
      pollTier,
      narrativeIds: narrMap.get(uid) ?? [],
      authorityScore,
    };
    if (k.display_name) item.displayName = k.display_name;
    if (k.avatar_url) item.avatarUrl = k.avatar_url;
    return item;
  });

  items.sort((a, b) => b.authorityScore - a.authorityScore || b.followers - a.followers);

  return {
    dataSource: "supabase",
    totalActive: allKols.length,
    tier1Count,
    flaggedBots,
    avgReputation: allKols.length > 0 ? Number((repSum / allKols.length).toFixed(3)) : 0,
    kols: items.slice(0, 250),
  };
}
