import { parseAbi } from "viem";

// Synchronized verbatim with compiled Solidity events in contracts/out/*.json.

export const ntiRegistryEventsAbi = parseAbi([
  "event NtiUpdated(address indexed token)",
  "event StakingUpdated(address indexed stakingContract)",
  "event BuybackAdapterUpdated(address indexed adapter)",
  "event RegistryFrozen(address indexed ntiToken)",
]);

export const stakingEventsAbi = parseAbi([
  "event Staked(address indexed account, uint256 receivedAmount)",
  "event UnstakeRequested(address indexed account, uint256 amount, uint64 unlockAt)",
  "event Withdrawn(address indexed account, uint256 amount)",
  "event RewardNotified(uint256 ethAdded, uint256 distributed, uint256 buffered)",
  "event RewardClaimed(address indexed account, uint256 ethReward)",
  "event Slashed(address indexed account, uint256 requestedAmount, uint256 actualSlashed, uint256 toReward, uint256 toBurn, address indexed rewardTo)",
  "event TiersUpdated(uint256 radarMin, uint256 t1Stake, uint256 t2Stake, uint256 t3Stake, uint16 t1Bps, uint16 t2Bps, uint16 t3Bps)",
]);

export const oracleCommitEventsAbi = parseAbi([
  "event EpochCommitted(uint32 indexed epochId, uint32 indexed seriesId, bytes32 datasetHash, bytes32 configHash, bytes32 arweaveTx, address indexed operator)",
  "event EpochFinalized(uint32 indexed epochId)",
  "event EpochMarkedIncomplete(uint32 indexed epochId)",
  "event EpochDisputed(uint32 indexed epochId)",
  "event EpochDisputeResolved(uint32 indexed epochId, bool challengerWon)",
  "event PermissionlessUpdated(bool enabled)",
  "event ValidatorJoined(address indexed validator)",
]);

export const disputeEventsAbi = parseAbi([
  "event DisputeOpened(uint256 indexed disputeId, uint32 indexed epochId, uint8 narrativeId, address indexed challenger, uint16 claimedI, uint256 bondReceived, bytes32 evidenceHash)",
  "event DisputeResolved(uint256 indexed disputeId, uint32 indexed epochId, bool challengerWon)",
  "event DisputeExpired(uint256 indexed disputeId, uint32 indexed epochId)",
]);

export const narrativeMarketEventsAbi = parseAbi([
  "event MarketCreated(uint256 indexed marketId, uint8 narrativeA, uint8 narrativeB, uint32 baseEpoch, uint32 settleEpoch, uint32 baseSeriesId)",
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, uint8 side, uint256 grossAmount, uint256 netAmount, uint256 feeAmount)",
  "event MarketSettled(uint256 indexed marketId, uint8 outcome, uint256 feesSent)",
  "event Claimed(uint256 indexed marketId, address indexed bettor, uint256 payout)",
]);

export const feeRouterEventsAbi = parseAbi([
  "event FeesDistributed(uint256 totalDistributed, uint256 buybackShare, uint256 stakingShare, uint256 grantsShare, uint256 insuranceShare)",
  "event BuybackExecuted(address indexed adapter, uint256 ethIn, uint256 ntiBurned)",
  "event BasketFeeRedeemed(address indexed basket, uint256 shares, uint256 ethOut)",
]);

export const basketFactoryEventsAbi = parseAbi([
  "event BasketCreated(uint8 indexed narrativeId, address indexed basket, string name, string symbol)",
]);

export const basketEventsAbi = parseAbi([
  "event TokenWhitelisted(address indexed token, address indexed pool, uint24 fee)",
  "event TokenDelisted(address indexed token)",
  "event AllocationSet(address[] tokens, uint16[] weightsBps)",
  "event Deposited(address indexed account, uint256 ethIn, uint256 addedNav, uint256 sharesMinted)",
  "event Redeemed(address indexed account, uint256 sharesBurned, uint256 ethOut)",
  "event Rebalanced(address[] tokens, uint16[] weightsBps, uint256 navBefore, uint256 navAfter)",
  "event ManagementFeeAccrued(uint256 feeShares)",
]);

export const grantsEventsAbi = parseAbi([
  "event RoundStarted(uint256 indexed roundId, uint256 budget, uint64 snapshotBlock, uint64 endsAt)",
  "event ProposalSubmitted(uint256 indexed roundId, uint256 indexed proposalId, address indexed proposer, address recipient, bytes32 metadataHash)",
  "event Voted(uint256 indexed roundId, address indexed voter, uint256[] ids, uint256[] weights)",
  "event RoundFinalized(uint256 indexed roundId, uint256 totalAllocated, bool quorumMet)",
  "event GrantClaimed(uint256 indexed roundId, uint256 indexed proposalId, address indexed recipient, uint256 amount)",
]);

export const governorEventsAbi = parseAbi([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
  "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
  "event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)",
  "event ProposalQueued(uint256 proposalId, uint256 etaSeconds)",
  "event ProposalExecuted(uint256 proposalId)",
  "event ProposalCanceled(uint256 proposalId)",
]);

export const kolRegistryEventsAbi = parseAbi([
  "event KOLRegistered(address indexed wallet, bytes32 indexed handleHash, address indexed attester)",
  "event KOLUnregistered(address indexed wallet, bytes32 indexed handleHash)",
]);

export const ALL_NTI_EVENTS_ABI = [
  ...ntiRegistryEventsAbi,
  ...stakingEventsAbi,
  ...oracleCommitEventsAbi,
  ...disputeEventsAbi,
  ...narrativeMarketEventsAbi,
  ...feeRouterEventsAbi,
  ...basketFactoryEventsAbi,
  ...basketEventsAbi,
  ...grantsEventsAbi,
  ...governorEventsAbi,
  ...kolRegistryEventsAbi,
] as const;

export const CONTRACT_EVENT_ABIS = {
  NTIRegistry: ntiRegistryEventsAbi,
  Staking: stakingEventsAbi,
  OracleCommit: oracleCommitEventsAbi,
  Dispute: disputeEventsAbi,
  NarrativeMarket: narrativeMarketEventsAbi,
  FeeRouter: feeRouterEventsAbi,
  BasketFactory: basketFactoryEventsAbi,
  Basket: basketEventsAbi,
  Grants: grantsEventsAbi,
  NTIGovernor: governorEventsAbi,
  KOLRegistry: kolRegistryEventsAbi,
} as const;
