import type { Address } from "viem";

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
  dataSource: "supabase" | "preview";
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
}

export interface TokenItem {
  address: string;
  symbol: string;
  name: string;
  source: "pons_v1" | "pons_v2" | "uniswap" | null;
  graduated: boolean;
  liquidityEth: number;
  narrativeId: number | null;
  txs7d: number;
  createdAt: string | null;
}

export interface NarrativeHistoryResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "preview";
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
}

export interface ValidatorAttestationItem {
  validator: string;
  iBps: number[];
  vBps: number[];
  signature: string;
  createdAt: string;
  matchesMedian: boolean;
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
  dataSource: "supabase" | "preview";
  epoch: EpochSummary;
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
  dataSource: "supabase" | "preview";
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
  quadrant: "opportunity" | "crowded" | "emerging" | "quiet";
}

export interface HeatmapResponse {
  awaitingFirstEpoch: boolean;
  dataSource: "supabase" | "preview";
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
  horizonLabel: "24H (6 epochs)" | "7D (42 epochs)";
  cutoffAt: string;
  settleAt: string;
  status: "open" | "locked" | "settled" | "refunded";
  outcome: "side_a" | "side_b" | "refund" | null;
  poolAEth: number;
  poolBEth: number;
  maxPoolEth: number;
  baseIA: number;
  baseIB: number;
  currentIA: number;
  currentIB: number;
  seriesId: number;
}

export interface BasketHolding {
  symbol: string;
  name: string;
  address: string;
  weightBps: number;
  liquidityEth: number;
  twap30mEth: number;
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
  sharePriceEth: number;
  managementFeeBps: number;
  lastRebalancedAt: string;
  holdings: BasketHolding[];
}

export interface GrantProposalItem {
  proposalId: number;
  roundId: number;
  title: string;
  summary: string;
  narrativeId: number;
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
  status: "active" | "finalized" | "upcoming";
  budgetEth: number;
  snapshotBlock: number;
  voteEnd: string;
  totalVotesNti: number;
  quorumNti: number;
  proposals: GrantProposalItem[];
}

export interface GovernorProposalItem {
  proposalId: string;
  title: string;
  category: "Config" | "Validators" | "Risk Limits" | "Basket Whitelist" | "Insurance";
  proposer: string;
  status: "Active" | "Queued" | "Executed" | "Succeeded" | "Defeated";
  forVotesNti: number;
  againstVotesNti: number;
  abstainVotesNti: number;
  quorumNti: number;
  voteEndAt: string;
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
