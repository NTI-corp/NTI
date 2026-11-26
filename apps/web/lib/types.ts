import type { Address, Hex } from "viem";

export type EpochStatus =
  | "collecting"
  | "computed"
  | "committed"
  | "disputed"
  | "final"
  | "incomplete";

export type VFlag = "too_small" | "series_break" | "incomplete_gap" | null;

export interface EpochSummary {
  epochId: number;
  seriesId: number;
  status: EpochStatus;
  datasetHash: string | null;
  arweaveTx: string | null;
  /** Public download URL of the epoch dataset (Supabase Storage mirror or Arweave). */
  datasetUrl?: string | null;
  configHash: string | null;
  commitTx: string | null;
  committedAt: string | null;
  finalizedAt: string | null;
}

export interface NarrativeIndexItem {
  narrativeId: number;
  slug: string;
  label: string;
  description: string;
  sN: number;
  mBps: number;
  iBps: number;
  vBps: number | null;
  vFlag: VFlag;
  weightedPosts: number;
}

export interface IndexesSnapshot {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "unavailable";
  latestFinalEpoch: EpochSummary | null;
  latestObservedEpoch: EpochSummary | null;
  pendingFinalization: boolean;
  narratives: NarrativeIndexItem[];
  recentSeries: Record<number, Array<{ epochId: number; iBps: number; vBps: number | null; vFlag: VFlag; seriesId: number; incomplete: boolean }>>;
  updatedAt: string;
}

export interface HistoryPoint {
  epochId: number;
  seriesId: number;
  status: EpochStatus;
  sN: number;
  mBps: number;
  iBps: number;
  vBps: number | null;
  vFlag: VFlag;
  weightedPosts: number;
  seriesBreak: boolean;
  incomplete: boolean;
  finalizedAt: string | null;
}

export interface ContributorRow {
  userId: string;
  handle: string;
  followers: number;
  shareBps: number;
  capped: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export interface TokenItem {
  address: string;
  symbol: string;
  name: string;
  source: "pons_v1" | "pons_v2" | "uniswap" | "testnet_mock" | null;
  graduated: boolean;
  liquidityEth: number;
  narrativeId: number | null;
  txs7d: number;
  createdAt: string | null;
}

export interface TopPostItem {
  tweetId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  followers: number;
  likes: number;
  reposts: number;
  quotes: number;
  replies: number;
  relevanceQ: number;
  createdAt: string;
}

export interface MentionedTokenItem {
  symbol: string;
  name: string | null;
  mentions: number;
  kolCount: number;
  weightedQ: number;
  chainId: string | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  dexUrl: string | null;
  imageUrl?: string | null;
}

export interface NarrativeHistoryResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "unavailable";
  narrative: {
    id: number;
    slug: string;
    label: string;
    description: string;
  };
  latestFinalEpoch: EpochSummary | null;
  series: HistoryPoint[];
  contributors: ContributorRow[];
  tokens: TokenItem[];
  mentionedTokens?: MentionedTokenItem[];
  topPosts?: TopPostItem[];
}

export interface ValidatorAttestationItem {
  validator: string;
  iBps: number[];
  vBps: number[];
  signature: string;
  createdAt: string;
  matchesMedian: boolean | null;
}

export interface DisputeItem {
  disputeId: number;
  epochId: number;
  narrativeId: number;
  challenger: string;
  claimedIBps: number;
  evidenceHash: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
}

export interface EpochDetailResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "unavailable";
  epoch: EpochSummary | null;
  narratives: NarrativeIndexItem[];
  attestations: ValidatorAttestationItem[];
  disputes: DisputeItem[];
  recentEpochs: EpochSummary[];
}

export interface RadarAlertItem {
  id: number;
  kind: "velocity" | "new_token";
  narrativeId: number;
  narrativeLabel: string;
  narrativeSlug: string;
  locked: boolean;
  vBps: number | null;
  token: {
    address: string;
    symbol: string | null;
    name: string | null;
    liquidityEth: number | null;
    graduated: boolean;
    source: string | null;
  } | null;
  detectedAt: string;
  publicAt: string;
  unlocksInSeconds: number;
}

export interface RadarResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "unavailable";
  realtimeUnlocked: boolean;
  wallet: Address | null;
  stakeFormatted: string;
  minStakeRequired: string;
  lockedCount: number;
  alerts: RadarAlertItem[];
  serverTime: string;
}

export interface HeatmapPoint {
  narrativeId: number;
  slug: string;
  label: string;
  mBps: number;
  iBps: number;
  vBps: number | null;
  activeTokens: number;
  curatedProjects: number;
  activeProjects: number;
  opportunityScore: number;
  /** No indexed token and no curated project is known for this narrative, so there is no meaningful score. */
  noProjectData: boolean;
  quadrant: "opportunity" | "crowded" | "emerging" | "quiet";
}

export interface HeatmapResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "unavailable";
  latestFinalEpoch: EpochSummary | null;
  points: HeatmapPoint[];
}

export interface MarketItem {
  marketId: number;
  narrativeA: number;
  narrativeB: number; // 0 = market average
  narrativeALabel: string;
  narrativeBLabel: string;
  baseEpoch: number;
  settleEpoch: number;
  horizonLabel: string;
  cutoffAt: string;
  settleAt: string;
  status: "open" | "locked" | "settled" | "refunded";
  /** The oracle series moved on after this market opened, so settlement is certain to refund. */
  refundBound?: boolean;
  outcome: "side_a" | "side_b" | "refund" | null;
  poolAEth: number;
  poolBEth: number;
  poolANetEth: number;
  poolBNetEth: number;
  maxPoolEth: number;
  cutoffEpochs: number;
  feeBps: number;
  settleTimeoutHours: number;
  baseIA: number;
  baseIB: number;
  currentIA: number | null;
  currentIB: number | null;
  seriesId: number;
}

export interface BasketHolding {
  symbol: string;
  name: string;
  address: string;
  weightBps: number;
  liquidityEth: number | null;
  twap30mEth: number | null;
}

export interface BasketItem {
  id: string;
  basketAddress: string;
  narrativeId: number;
  narrativeLabel: string;
  name: string;
  symbol: string;
  navEth: number;
  tvlEth: number;
  tvlCapEth: number;
  sharePriceEth: number | null;
  managementFeeBps: number;
  lastRebalancedAt: string | null;
  holdings: BasketHolding[];
}

export interface GrantProposalItem {
  proposalId: number;
  roundId: number;
  title: string;
  summary: string;
  narrativeId: number | null;
  proposer: string;
  recipient: string;
  metadataHash: string;
  votesNti: number;
  projectedShareBps: number;
  projectedEth: number;
  claimed: boolean;
}

export interface GrantRoundItem {
  roundId: number;
  status: "active" | "awaiting_finalization" | "finalized";
  budgetEth: number;
  snapshotBlock: number;
  voteEnd: string;
  totalVotesNti: number;
  quorumNti: number | null;
  proposals: GrantProposalItem[];
}

export interface GovernorProposalItem {
  proposalId: string;
  title: string;
  proposer: string;
  status: "Pending" | "Active" | "Canceled" | "Defeated" | "Succeeded" | "Queued" | "Expired" | "Executed" | "Unavailable";
  forVotesNti: number | null;
  againstVotesNti: number | null;
  abstainVotesNti: number | null;
  quorumNti: number | null;
  voteDeadline: string | null;
  clockMode: "blocknumber" | "timestamp" | null;
  executeAfter: string | null;
  actions: Array<{ target: Address; value: string; calldata: Hex }> | null;
  summary: string;
}

export interface SiweSessionState {
  authenticated: boolean;
  address: Address | null;
  chainId: number | null;
  stakeWei: string;
  stakeFormatted: string;
  discountBps: number;
  hasRadarAccess: boolean;
  radarMinStakeFormatted: string;
  tierName: string;
  stakeSource: "onchain" | "unconfigured";
}

export interface KolLeaderboardItem {
  userId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  followers: number;
  rK: number;
  hK: number;
  pollTier: number;
  narrativeIds: number[];
  authorityScore: number;
}

export interface KolLeaderboardResponse {
  dataSource: "supabase" | "unavailable";
  totalActive: number;
  tier1Count: number;
  flaggedBots: number;
  avgReputation: number;
  kols: KolLeaderboardItem[];
}

export interface RecentLaunchItem {
  address: string;
  symbol: string;
  name: string;
  createdAt: string;
  graduated: boolean;
  liquidityEth: number;
  narrativeLabel: string | null;
  imageUrl?: string | null;
}
