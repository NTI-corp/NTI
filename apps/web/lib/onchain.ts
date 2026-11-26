import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  formatEther,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { unstable_cache } from "next/cache";
import { EXTERNAL_ADDRESSES, NARRATIVE_BY_ID } from "@nti/sdk";
import {
  basketAbi,
  basketFactoryAbi,
  erc20Abi,
  getActiveChainId,
  getChain,
  getProtocolAddresses,
  grantsAbi,
  governorAbi,
  narrativeMarketAbi,
  oracleCommitAbi,
  stakingAbi,
} from "./contracts";
import type { BasketItem, GovernorProposalItem, GrantRoundItem, MarketItem } from "./types";

function getServerPublicClient() {
  const chainId = getActiveChainId();
  const chain = getChain(chainId);
  return {
    chainId,
    addresses: getProtocolAddresses(chainId),
    client: createPublicClient({
      chain,
      transport: http(
        (chainId === 46630 ? process.env.RPC_URL_TESTNET : process.env.RPC_URL_MAINNET) ??
          chain.rpcUrls.default.http[0],
        {
          timeout: 10_000,
          retryCount: 2,
          fetchOptions: { next: { revalidate: 15 } } as RequestInit,
        },
      ),
    }),
  };
}

const GOVERNOR_STATES = [
  "Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed",
] as const;

type GovernorChainState = Pick<GovernorProposalItem,
  "status" | "forVotesNti" | "againstVotesNti" | "abstainVotesNti" |
  "quorumNti" | "voteDeadline" | "clockMode" | "executeAfter">;

const UNAVAILABLE_GOVERNOR_STATE: GovernorChainState = {
  status: "Unavailable", forVotesNti: null, againstVotesNti: null, abstainVotesNti: null,
  quorumNti: null, voteDeadline: null, clockMode: null, executeAfter: null,
};

export async function readGovernorStates(ids: bigint[]): Promise<Array<GovernorChainState | null>> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.governor || ids.length === 0) return [];
  const contract = { address: addresses.governor, abi: governorAbi } as const;

  try {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const view = { ...contract, blockNumber };
    const [clock, mode] = await Promise.all([
      client.readContract({ ...view, functionName: "clock" }),
      client.readContract({ ...view, functionName: "CLOCK_MODE" }),
    ]);
    const clockMode = mode.startsWith("mode=blocknumber") ? "blocknumber" :
      mode.startsWith("mode=timestamp") ? "timestamp" : null;

    return await Promise.all(ids.map(async (id): Promise<GovernorChainState | null> => {
      const args = [id] as const;
      try {
        const state = await client.readContract({ ...view, functionName: "state", args });
        const [snapshot, deadline, votes, eta] = await Promise.all([
          client.readContract({ ...view, functionName: "proposalSnapshot", args }),
          client.readContract({ ...view, functionName: "proposalDeadline", args }),
          client.readContract({ ...view, functionName: "proposalVotes", args }),
          client.readContract({ ...view, functionName: "proposalEta", args }),
        ]);
        const [against, forVotes, abstain] = votes;
        const quorum = snapshot < BigInt(clock)
          ? await client.readContract({ ...view, functionName: "quorum", args: [snapshot] })
          : null;
        return {
          status: GOVERNOR_STATES[state] ?? "Unavailable",
          forVotesNti: Number(formatEther(forVotes)),
          againstVotesNti: Number(formatEther(against)),
          abstainVotesNti: Number(formatEther(abstain)),
          quorumNti: quorum === null ? null : Number(formatEther(quorum)),
          voteDeadline: deadline.toString(),
          clockMode,
          executeAfter: eta ? new Date(Number(eta) * 1000).toISOString() : null,
        };
      } catch (error) {
        if (error instanceof BaseError &&
            error.walk((cause) => cause instanceof ContractFunctionRevertedError &&
              cause.data?.errorName === "GovernorNonexistentProposal") instanceof ContractFunctionRevertedError) {
          return null;
        }
        return UNAVAILABLE_GOVERNOR_STATE;
      }
    }));
  } catch {
    return ids.map(() => UNAVAILABLE_GOVERNOR_STATE);
  }
}

async function readLiveMarketsUncached(
  currentIndexByNarrative: Map<number, number>,
): Promise<MarketItem[] | null> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.narrativeMarket || !addresses.oracleCommit) return null;
  const market = { address: addresses.narrativeMarket, abi: narrativeMarketAbi } as const;
  const oracle = { address: addresses.oracleCommit, abi: oracleCommitAbi } as const;

  try {
    const nextId = await client.readContract({ ...market, functionName: "nextMarketId" });
    const count = Number(nextId) - 1;
    if (count <= 0) return [];
    const [maxPoolWei, cutoffEpochs, feeBps, settleTimeout] = await Promise.all([
      client.readContract({ ...market, functionName: "maxPoolPerMarket" }),
      client.readContract({ ...market, functionName: "BET_CUTOFF_EPOCHS" }),
      client.readContract({ ...market, functionName: "BASE_FEE_BPS" }),
      client.readContract({ ...market, functionName: "SETTLE_TIMEOUT" }),
    ]);
    const ids = Array.from({ length: Math.min(30, count) }, (_, offset) => count - offset);

    // A few markets at a time: reading all of them at once is a burst of RPC calls that a free node answers with 429.
    const readMarket = async (marketId: number): Promise<MarketItem> => {
      const [narrativeA, narrativeB, baseEpoch, settleEpoch, seriesId,
        pool0Net, pool1Net, pool0Gross, pool1Gross, , outcomeNum, settled] = await client.readContract({
        ...market, functionName: "markets", args: [BigInt(marketId)],
      });
      const [cutoffAt, settleAt, baseIA, baseIB, settleStatus] = await Promise.all([
        client.readContract({ ...oracle, functionName: "epochBoundary", args: [settleEpoch - cutoffEpochs] }),
        client.readContract({ ...oracle, functionName: "epochBoundary", args: [settleEpoch] }),
        client.readContract({ ...oracle, functionName: "finalIndex", args: [baseEpoch, narrativeA] }),
        narrativeB === 0 ? Promise.resolve(1000) :
          client.readContract({ ...oracle, functionName: "finalIndex", args: [baseEpoch, narrativeB] }),
        client.readContract({ ...oracle, functionName: "epochStatus", args: [settleEpoch] }),
      ]);
      const settledIndex = settled && settleStatus === 3;
      const [settleIA, settleIB] = settledIndex
        ? await Promise.all([
            client.readContract({ ...oracle, functionName: "finalIndex", args: [settleEpoch, narrativeA] }),
            narrativeB === 0
              ? Promise.resolve(1000)
              : client.readContract({ ...oracle, functionName: "finalIndex", args: [settleEpoch, narrativeB] }),
          ])
        : [null, null];
      const outcome = outcomeNum === 1 ? "side_a" : outcomeNum === 2 ? "side_b" :
        outcomeNum === 3 ? "refund" : null;
      return {
        marketId,
        narrativeA,
        narrativeB,
        narrativeALabel: NARRATIVE_BY_ID.get(narrativeA)?.label ?? `Narrative #${narrativeA}`,
        narrativeBLabel: narrativeB === 0 ? "All-Narrative Average" :
          NARRATIVE_BY_ID.get(narrativeB)?.label ?? `Narrative #${narrativeB}`,
        baseEpoch,
        settleEpoch,
        horizonLabel: `${settleEpoch - baseEpoch} epochs`,
        cutoffAt: new Date(Number(cutoffAt) * 1000).toISOString(),
        settleAt: new Date(Number(settleAt) * 1000).toISOString(),
        status: settled ? outcome === "refund" ? "refunded" : "settled" :
          Date.now() >= Number(cutoffAt) * 1000 ? "locked" : "open",
        outcome,
        poolAEth: Number(formatEther(pool0Gross)),
        poolBEth: Number(formatEther(pool1Gross)),
        maxPoolEth: Number(formatEther(maxPoolWei)),
        baseIA,
        baseIB,
        currentIA: settledIndex ? settleIA : currentIndexByNarrative.get(narrativeA) ?? null,
        currentIB: settledIndex
          ? settleIB
          : narrativeB === 0 ? 1000 : currentIndexByNarrative.get(narrativeB) ?? null,
        seriesId,
        poolANetEth: Number(formatEther(pool0Net)),
        poolBNetEth: Number(formatEther(pool1Net)),
        cutoffEpochs: Number(cutoffEpochs),
        feeBps: Number(feeBps),
        settleTimeoutHours: Number(settleTimeout) / 3600,
      };
    };
    const items: MarketItem[] = [];
    for (let i = 0; i < ids.length; i += MARKET_READ_CONCURRENCY) {
      items.push(...(await Promise.all(ids.slice(i, i + MARKET_READ_CONCURRENCY).map(readMarket))));
    }
    return items;
  } catch {
    return null;
  }
}

const MARKET_READ_CONCURRENCY = 3;
const MARKET_STALE_MAX_AGE_MS = 10 * 60_000;
let lastGoodMarkets: { at: number; items: MarketItem[] } | null = null;

/**
 * Markets are read straight from the chain on every request (a market created a moment ago must show up).
 * One failed RPC call must not blank the page, so a failed read is retried once and, if it still fails,
 * the last successful list from this server instance is served for up to ten minutes.
 */
export async function readLiveMarketsFromChain(
  currentIndexByNarrative: Map<number, number>,
): Promise<MarketItem[] | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const items = await readLiveMarketsUncached(currentIndexByNarrative);
    if (items !== null) {
      lastGoodMarkets = { at: Date.now(), items };
      return items;
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (lastGoodMarkets && Date.now() - lastGoodMarkets.at < MARKET_STALE_MAX_AGE_MS) return lastGoodMarkets.items;
  return null;
}


const basketTokenConfigAbi = parseAbi([
  "function tokenConfigs(address) view returns (bool whitelisted, address pool, uint24 fee)",
]);
const uniswapV3PoolAbi = parseAbi([
  "function token0() view returns (address)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",
]);
const TWAP_WINDOW_SECONDS = 1800;

/** 30 minute TWAP (ETH per token) and WETH-side depth of the Uniswap V3 pool behind a basket constituent. */
async function readConstituentMarket(
  client: PublicClient,
  basket: Address,
  token: Address,
  weth: Address,
  decimals: number,
): Promise<{ twap30mEth: number | null; liquidityEth: number | null }> {
  try {
    const [, pool] = await client.readContract({
      address: basket,
      abi: basketTokenConfigAbi,
      functionName: "tokenConfigs",
      args: [token],
    });
    const [token0, observed, wethInPool] = await Promise.all([
      client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "token0" }),
      client.readContract({
        address: pool,
        abi: uniswapV3PoolAbi,
        functionName: "observe",
        args: [[TWAP_WINDOW_SECONDS, 0]],
      }),
      client.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
    ]);
    const cumulative = observed[0];
    const start = cumulative[0];
    const end = cumulative[1];
    if (start === undefined || end === undefined) return { twap30mEth: null, liquidityEth: null };
    const tick = Number((end - start) / BigInt(TWAP_WINDOW_SECONDS));
    const price = 1.0001 ** tick; // token1 per token0, raw units
    const wethPerRawToken = token0.toLowerCase() === token.toLowerCase() ? price : 1 / price;
    return {
      twap30mEth: wethPerRawToken * 10 ** (decimals - 18),
      liquidityEth: Number(formatEther(wethInPool)),
    };
  } catch {
    return { twap30mEth: null, liquidityEth: null };
  }
}

async function readLiveBasketsUncached(): Promise<BasketItem[] | null> {
  const { addresses, client, chainId } = getServerPublicClient();
  if (!addresses.basketFactory) return null;
  const weth = EXTERNAL_ADDRESSES[chainId]?.weth?.address ?? null;

  try {
    const basketAddrs = await client.readContract({
      address: addresses.basketFactory,
      abi: basketFactoryAbi,
      functionName: "allBaskets",
    });

    if (!basketAddrs || basketAddrs.length === 0) return [];

    const items = await Promise.all(
      basketAddrs.map(async (addr): Promise<BasketItem | null> => {
        try {
          const [narrativeId, name, symbol, totalSupply, navWei, maxTvlWei, constituents, lastRebalanceAt, managementFeeBps] =
            await Promise.all([
              client.readContract({ address: addr, abi: basketAbi, functionName: "narrativeId" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "name" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "symbol" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "totalSupply" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "totalNavWeth" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "maxTVL" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "constituents" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "lastRebalanceAt" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "MGMT_FEE_BPS" }),
            ]);

          const meta = NARRATIVE_BY_ID.get(Number(narrativeId));
          const navEth = Number(formatEther(navWei));
          // Same pricing as Basket.deposit: virtual shares and assets of 1e6 each, so an empty basket starts at 1 ETH.
          const virtual = 1_000_000n;
          const sharePriceEth = Number(formatEther(((navWei + virtual) * 10n ** 18n) / (totalSupply + virtual)));

          const [tokAddrs, weights] = constituents;
          const holdings = await Promise.all(
            tokAddrs.map(async (tokAddr, idx) => {
              const [tokSym, tokName, tokDecimals] = await Promise.all([
                client
                  .readContract({ address: tokAddr, abi: erc20Abi, functionName: "symbol" })
                  .catch(() => `TOK${idx + 1}`),
                client
                  .readContract({ address: tokAddr, abi: erc20Abi, functionName: "name" })
                  .catch(() => tokAddr),
                client
                  .readContract({ address: tokAddr, abi: erc20Abi, functionName: "decimals" })
                  .catch(() => 18),
              ]);
              const market = weth
                ? await readConstituentMarket(client as PublicClient, addr, tokAddr, weth, Number(tokDecimals))
                : { twap30mEth: null, liquidityEth: null };
              return {
                symbol: tokSym,
                name: tokName,
                address: tokAddr,
                weightBps: Number(weights[idx] ?? 0),
                liquidityEth: market.liquidityEth,
                twap30mEth: market.twap30mEth,
              };
            }),
          );

          return {
            id: (meta?.slug ?? String(narrativeId)).replaceAll("_", "-"),
            basketAddress: addr,
            narrativeId: Number(narrativeId),
            narrativeLabel: meta?.label ?? `Narrative #${narrativeId}`,
            name,
            symbol,
            navEth,
            tvlEth: navEth,
            tvlCapEth: Number(formatEther(maxTvlWei)),
            sharePriceEth,
            managementFeeBps,
            lastRebalancedAt: lastRebalanceAt ? new Date(Number(lastRebalanceAt) * 1000).toISOString() : null,
            holdings,
          };
        } catch {
          return null;
        }
      }),
    );

    return items.every((item) => item !== null) ? items : null;
  } catch {
    return null;
  }
}

// The vault list and its pool reads are the same for every visitor. A 15 second shared cache keeps the page quick;
// an unavailable read throws inside the wrapper so a failure is not cached.
const cachedLiveBaskets = unstable_cache(
  async (): Promise<BasketItem[]> => {
    const items = await readLiveBasketsUncached();
    if (items === null) throw new Error("basket data unavailable");
    return items;
  },
  ["live-baskets"],
  { revalidate: 15 },
);

export async function readLiveBasketsFromChain(): Promise<BasketItem[] | null> {
  try {
    return await cachedLiveBaskets();
  } catch {
    return null;
  }
}

export async function readLiveGrantRoundsFromChain(): Promise<GrantRoundItem[] | null> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.grants) return null;

  try {
    const grants = { address: addresses.grants, abi: grantsAbi } as const;
    const currentRound = await client.readContract({ ...grants, functionName: "currentRoundId" });

    const totalRounds = Number(currentRound);
    if (totalRounds <= 0) return [];

    const [quorumBps, staking] = await Promise.all([
      client.readContract({ ...grants, functionName: "QUORUM_BPS" }),
      client.readContract({ ...grants, functionName: "staking" }),
    ]);
    const nowSec = Math.floor(Date.now() / 1000);
    const roundIds: number[] = [];
    for (let r = totalRounds; r >= Math.max(1, totalRounds - 4); r--) {
      roundIds.push(r);
    }

    const rounds = await Promise.all(
      roundIds.map(async (rid): Promise<GrantRoundItem | null> => {
        try {
          const [budget, snapshotBlock, , endsAt, totalVotes, proposalCount, finalized] =
            await client.readContract({
              address: addresses.grants!,
              abi: grantsAbi,
              functionName: "rounds",
              args: [BigInt(rid)],
            });

          const pastSupply = await client.readContract({
            address: staking, abi: stakingAbi, functionName: "getPastTotalSupply", args: [snapshotBlock],
          }).catch(() => null);
          const quorum = pastSupply === null ? null : pastSupply * BigInt(quorumBps) / 10_000n;
          const rawProps = [];
          for (let start = 1; start <= Number(proposalCount); start += 20) {
            const size = Math.min(20, Number(proposalCount) - start + 1);
            const batch = await Promise.all(Array.from({ length: size }, async (_, offset) => {
              const pid = start + offset;
              const [proposer, recipient, metadataHash, votes, allocation, claimed] =
                await client.readContract({
                  address: addresses.grants!,
                  abi: grantsAbi,
                  functionName: "proposals",
                  args: [BigInt(rid), BigInt(pid)],
                });

              return { pid, proposer, recipient, metadataHash, votes, allocation, claimed };
            }));
            rawProps.push(...batch);
          }

          const top = rawProps.filter((proposal) => proposal.votes > 0n).sort((a, b) =>
            a.votes === b.votes ? a.pid - b.pid : a.votes > b.votes ? -1 : 1,
          ).slice(0, 5);
          const topVotes = top.reduce((sum, proposal) => sum + proposal.votes, 0n);
          const cap = budget * 4000n / 10000n;
          const quorumMet = quorum !== null && pastSupply !== 0n && totalVotes >= quorum;
          const proposals = rawProps.map(({ pid, proposer, recipient, metadataHash, votes, allocation, claimed }) => {
            const estimated = quorumMet && topVotes > 0n && top.some((proposal) => proposal.pid === pid)
              ? (budget * votes) / topVotes : 0n;
            const payout = finalized ? allocation : estimated > cap ? cap : estimated;
            return {
              proposalId: pid,
              roundId: rid,
              title: `Grant Proposal #${pid}`,
              summary: `Metadata digest ${metadataHash}`,
              narrativeId: null,
              proposer,
              recipient,
              metadataHash,
              votesNti: Number(formatEther(votes)),
              projectedShareBps: budget > 0n ? Number(payout * 10000n / budget) : 0,
              projectedEth: Number(formatEther(payout)),
              claimed,
            };
          });
          const status: GrantRoundItem["status"] = finalized ? "finalized" :
            nowSec >= Number(endsAt) ? "awaiting_finalization" : "active";

          return {
            roundId: rid,
            status,
            budgetEth: Number(formatEther(budget)),
            snapshotBlock: Number(snapshotBlock),
            voteEnd: new Date(Number(endsAt) * 1000).toISOString(),
            totalVotesNti: Number(formatEther(totalVotes)),
            quorumNti: quorum === null ? null : Number(formatEther(quorum)),
            proposals,
          };
        } catch {
          return null;
        }
      }),
    );

    return rounds.every((round) => round !== null) ? rounds : null;
  } catch {
    return null;
  }
}

const ponsLogoAbi = parseAbi(["function logo() view returns (string)"]);
const LOGO_CID = /^[A-Za-z0-9]{46,100}$/;

/** A bare `ipfs://CID` becomes our cached logo route; an https URL is kept; anything else is dropped. */
function logoUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.startsWith("ipfs://")) {
    const cid = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return LOGO_CID.test(cid) ? `/api/token-logo/${cid}` : null;
  }
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

async function readPonsLogosUncached(addresses: Address[]): Promise<Record<string, string>> {
  const { client } = getServerPublicClient();
  const results = await client.multicall({
    allowFailure: true,
    contracts: addresses.map((address) => ({ address, abi: ponsLogoAbi, functionName: "logo" as const })),
  });
  const out: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.status !== "success" || typeof r.result !== "string") return;
    const url = logoUrl(r.result);
    if (url) out[addresses[i]!.toLowerCase()] = url;
  });
  return out;
}

// A token's logo never changes once launched, so an hour of caching is plenty. A failed read throws inside the
// wrapper and is not cached.
const cachedPonsLogos = unstable_cache(readPonsLogosUncached, ["pons-logos-v2"], { revalidate: 3600 });

/** Logo image URL per token address (lower case) for Pons tokens; missing entries simply have no logo. */
export async function readPonsLogos(addresses: Address[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  try {
    return await cachedPonsLogos([...addresses].map((a) => a.toLowerCase() as Address).sort());
  } catch {
    return {};
  }
}
