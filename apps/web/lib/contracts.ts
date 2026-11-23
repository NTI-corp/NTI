import {
  formatEther,
  formatGwei,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import {
  EXTERNAL_ADDRESSES,
  PROTOCOL_ADDRESSES,
  ROBINHOOD_MAINNET_ID,
  ROBINHOOD_TESTNET_ID,
  getChain,
  ntiRegistryAbi,
  type ProtocolAddresses,
  type SupportedChainId,
} from "@nti/sdk";

export {
  EXTERNAL_ADDRESSES,
  PROTOCOL_ADDRESSES,
  ROBINHOOD_MAINNET_ID,
  ROBINHOOD_TESTNET_ID,
  getChain,
  ntiRegistryAbi,
};

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function faucet()",
  "function lastFaucetClaim(address account) view returns (uint64)",
]);

export const stakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function requestUnstake(uint256 amount)",
  "function withdraw()",
  "function claim() returns (uint256 ethReward)",
  "function stakeOf(address account) view returns (uint256)",
  "function cooldownOf(address account) view returns (uint256 amount, uint64 unlockAt)",
  "function totalActiveStaked() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function hasRadarAccess(address account) view returns (bool)",
  "function discountBps(address account) view returns (uint16)",
  "function pendingReward(address account) view returns (uint256)",
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",
  "function radarMinStake() view returns (uint256)",
  "function tier1Stake() view returns (uint256)",
  "function tier2Stake() view returns (uint256)",
  "function tier3Stake() view returns (uint256)",
]);

export const oracleCommitAbi = parseAbi([
  "function finalize(uint32 epochId)",
  "function markIncomplete(uint32 epochId)",
  "function finalIndex(uint32 epochId, uint8 narrativeId) view returns (uint16)",
  "function isFinal(uint32 epochId) view returns (bool)",
  "function latestFinalEpoch() view returns (uint32)",
  "function MIN_VALIDATORS() view returns (uint256)",
  "function DISPUTE_WINDOW() view returns (uint64)",
  "function lastProcessedEpoch() view returns (uint32)",
  "function epochBoundary(uint32 epochId) view returns (uint64)",
]);

export const disputeAbi = parseAbi([
  "function openDispute(uint32 epochId, uint8 narrativeId, uint16 claimedI, bytes32 evidenceHash)",
  "function expire(uint256 disputeId)",
  "function disputeBond() view returns (uint256)",
  "function RESOLUTION_WINDOW() view returns (uint64)",
  "function nextDisputeId() view returns (uint256)",
  "function disputes(uint256 disputeId) view returns (uint32 epochId, uint8 narrativeId, uint16 claimedI, bytes32 evidenceHash, address challenger, uint256 bondReceived, uint64 openedAt, uint8 state)",
]);

export const narrativeMarketAbi = parseAbi([
  "function createMarket(uint8 narrativeA, uint8 narrativeB, uint32 settleEpoch) returns (uint256 id)",
  "function bet(uint256 id, uint8 side) payable",
  "function settle(uint256 id)",
  "function claim(uint256 id)",
  "function minBet() view returns (uint256)",
  "function maxPoolPerMarket() view returns (uint256)",
  "function nextMarketId() view returns (uint256)",
  "function HORIZON_SHORT() view returns (uint32)",
  "function HORIZON_LONG() view returns (uint32)",
  "function BET_CUTOFF_EPOCHS() view returns (uint32)",
  "error InvalidHorizon(uint32 baseEpoch, uint32 settleEpoch)",
  "error BettingClosed(uint64 cutoffAt)",
  "error SettlementNotReady()",
  "function markets(uint256 id) view returns (uint8 narrativeA, uint8 narrativeB, uint32 baseEpoch, uint32 settleEpoch, uint32 baseSeriesId, uint256 pool0Net, uint256 pool1Net, uint256 pool0Gross, uint256 pool1Gross, uint256 escrowedFees, uint8 outcome, bool settled)",
  "function positions(uint256 id, address bettor) view returns (uint256 gross0, uint256 net0, uint256 gross1, uint256 net1, bool claimed)",
]);

export const basketFactoryAbi = parseAbi([
  "function allBaskets() view returns (address[])",
  "function basketCount() view returns (uint256)",
  "function basketOf(uint8 narrativeId) view returns (address)",
]);

export const basketAbi = parseAbi([
  "function deposit(uint256 minSharesOut) payable returns (uint256 shares)",
  "function redeem(uint256 shares, uint256 minEthOut) returns (uint256 ethOut)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalNavWeth() view returns (uint256)",
  "function paused() view returns (bool)",
  "function maxTVL() view returns (uint256)",
  "function lastRebalanceAt() view returns (uint64)",
  "function MGMT_FEE_BPS() view returns (uint16)",
  "function narrativeId() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function constituents() view returns (address[] tokens, uint16[] weightsBps)",
]);

export const grantsAbi = parseAbi([
  "function submitProposal(bytes32 metadataHash, address recipient) returns (uint256)",
  "function vote(uint256 round, uint256[] ids, uint256[] weights)",
  "function finalizeRound(uint256 round)",
  "function claim(uint256 round, uint256 id) returns (uint256)",
  "function currentRoundId() view returns (uint256)",
  "function QUORUM_BPS() view returns (uint16)",
  "function staking() view returns (address)",
  "error RoundNotEnded(uint64 endsAt)",
  "error RoundNotActive()",
  "error AlreadyVoted()",
  "error NothingToClaim()",
  "function minProposalStake() view returns (uint256)",
  "function hasVoted(uint256 round, address voter) view returns (bool)",
  "function rounds(uint256 roundId) view returns (uint256 budget, uint64 snapshotBlock, uint64 startedAt, uint64 endsAt, uint256 totalVotes, uint256 proposalCount, bool finalized)",
  "function proposals(uint256 roundId, uint256 proposalId) view returns (address proposer, address recipient, bytes32 metadataHash, uint256 votes, uint256 allocation, bool claimed)",
]);

export const kolRegistryAbi = parseAbi([
  "function register(address wallet, bytes32 handleHash, uint256 deadline, bytes sig)",
  "function unregister()",
  "function handleOf(address wallet) view returns (bytes32)",
  "error SignatureExpired(uint256 deadline)",
  "error DigestAlreadyUsed()",
  "error InvalidAttesterSignature(address recovered)",
  "error HandleAlreadyBound(bytes32 handleHash, address existingWallet)",
]);

export const governorAbi = parseAbi([
  "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
  "function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalEta(uint256 proposalId) view returns (uint256)",
  "function quorum(uint256 timepoint) view returns (uint256)",
  "function clock() view returns (uint48)",
  "function CLOCK_MODE() view returns (string)",
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
  "error GovernorNonexistentProposal(uint256 proposalId)",
]);

export function getActiveChainId(): SupportedChainId {
  const raw = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? ROBINHOOD_TESTNET_ID);
  return raw === ROBINHOOD_MAINNET_ID ? ROBINHOOD_MAINNET_ID : ROBINHOOD_TESTNET_ID;
}

function asAddress(val: string | undefined): Address | null {
  if (!val || !/^0x[0-9a-fA-F]{40}$/.test(val)) return null;
  return val as Address;
}

export function getProtocolAddresses(chainId: SupportedChainId = getActiveChainId()): ProtocolAddresses {
  const base = PROTOCOL_ADDRESSES[chainId];
  return {
    registry: asAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS) ?? base.registry,
    ntiToken: asAddress(process.env.NEXT_PUBLIC_NTI_TOKEN_ADDRESS) ?? base.ntiToken,
    staking: asAddress(process.env.NEXT_PUBLIC_STAKING_ADDRESS) ?? base.staking,
    configRegistry: asAddress(process.env.NEXT_PUBLIC_CONFIG_REGISTRY_ADDRESS) ?? base.configRegistry,
    oracleCommit: asAddress(process.env.NEXT_PUBLIC_ORACLE_COMMIT_ADDRESS) ?? base.oracleCommit,
    dispute: asAddress(process.env.NEXT_PUBLIC_DISPUTE_ADDRESS) ?? base.dispute,
    narrativeMarket: asAddress(process.env.NEXT_PUBLIC_NARRATIVE_MARKET_ADDRESS) ?? base.narrativeMarket,
    feeRouter: asAddress(process.env.NEXT_PUBLIC_FEE_ROUTER_ADDRESS) ?? base.feeRouter,
    buybackAdapterV3: base.buybackAdapterV3,
    buybackAdapterV4: base.buybackAdapterV4,
    basketFactory: asAddress(process.env.NEXT_PUBLIC_BASKET_FACTORY_ADDRESS) ?? base.basketFactory,
    grants: asAddress(process.env.NEXT_PUBLIC_GRANTS_ADDRESS) ?? base.grants,
    governor: asAddress(process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS) ?? base.governor,
    timelock: asAddress(process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS) ?? base.timelock,
    insuranceFund: base.insuranceFund,
    kolRegistry: base.kolRegistry,
  };
}

export interface GasEstimateDisplay {
  gasLimit: string;
  gasPriceGwei: string;
  estimatedCostEth: string;
  elevatedFeeWarning: boolean;
  source: "rpc" | "fallback";
}

/**
 * Estimates gas before user transaction confirmation.
 * Robinhood Chain gas prices have swung ~40x over 2 weeks, so every tx modal displays
 * a pre-confirmation estimate and warns whenever gas exceeds 1 gwei.
 */
export async function estimateTxGas(
  publicClient: PublicClient | undefined,
  params: {
    account?: Address;
    to?: Address | null;
    data?: `0x${string}`;
    value?: bigint;
    fallbackGasLimit?: bigint;
  },
): Promise<GasEstimateDisplay> {
  const fallbackLimit = params.fallbackGasLimit ?? 180_000n;
  try {
    if (!publicClient) throw new Error("no client");
    const gasPrice = await publicClient.getGasPrice();
    let gasLimit = fallbackLimit;
    if (params.to && params.account) {
      try {
        gasLimit = await publicClient.estimateGas({
          account: params.account,
          to: params.to,
          data: params.data,
          value: params.value,
        });
      } catch {
        gasLimit = fallbackLimit;
      }
    }
    const costWei = gasLimit * gasPrice;
    const gwei = Number(formatGwei(gasPrice));
    return {
      gasLimit: gasLimit.toString(),
      gasPriceGwei: gwei.toFixed(4),
      estimatedCostEth: Number(formatEther(costWei)).toFixed(6),
      elevatedFeeWarning: gwei >= 1.0,
      source: "rpc",
    };
  } catch {
    const fallbackPrice = 100_000_000n; // 0.1 gwei conservative baseline
    const costWei = fallbackLimit * fallbackPrice;
    return {
      gasLimit: fallbackLimit.toString(),
      gasPriceGwei: "0.1000",
      estimatedCostEth: Number(formatEther(costWei)).toFixed(6),
      elevatedFeeWarning: false,
      source: "fallback",
    };
  }
}
