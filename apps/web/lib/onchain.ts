import { createPublicClient, formatEther, http, type Address } from "viem";
import { NARRATIVE_BY_ID } from "@nti/sdk";
import {
  basketAbi,
  basketFactoryAbi,
  erc20Abi,
  getActiveChainId,
  getChain,
  getProtocolAddresses,
  grantsAbi,
  narrativeMarketAbi,
  oracleCommitAbi,
} from "./contracts";
import type { BasketItem, GrantRoundItem, MarketItem } from "./types";

function getServerPublicClient() {
  const chainId = getActiveChainId();
  const chain = getChain(chainId);
  return {
    chainId,
    addresses: getProtocolAddresses(chainId),
    client: createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0], { timeout: 7_000 }),
    }),
  };
}

export async function readLiveMarketsFromChain(
  currentIndexByNarrative: Map<number, number>,
): Promise<MarketItem[] | null> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.narrativeMarket) return null;

  try {
    const [nextId, maxPoolWei, latestFinalEpoch] = await Promise.all([
      client.readContract({
        address: addresses.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: "nextMarketId",
      }),
      client
        .readContract({
          address: addresses.narrativeMarket,
          abi: narrativeMarketAbi,
          functionName: "maxPoolPerMarket",
        })
        .catch(() => 5_000_000_000_000_000_000n),
      addresses.oracleCommit
        ? client
            .readContract({
              address: addresses.oracleCommit,
              abi: oracleCommitAbi,
              functionName: "latestFinalEpoch",
            })
            .catch(() => 0)
        : Promise.resolve(0),
    ]);

    const count = Number(nextId) - 1;
    if (count <= 0) return [];

    const start = Math.max(1, count - 29);
    const ids: number[] = [];
    for (let id = count; id >= start; id--) ids.push(id);

    const maxPoolEth = Number(formatEther(maxPoolWei));
    const nowMs = Date.now();

    const items = await Promise.all(
      ids.map(async (id): Promise<MarketItem | null> => {
        try {
          const [m, cutoffSec, settleSec, baseIAVal, baseIBVal] = await Promise.all([
            client.readContract({
              address: addresses.narrativeMarket!,
              abi: narrativeMarketAbi,
              functionName: "markets",
              args: [BigInt(id)],
            }),
            addresses.oracleCommit
              ? client
                  .readContract({
                    address: addresses.oracleCommit,
                    abi: oracleCommitAbi,
                    functionName: "epochBoundary",
                    args: [0], // placeholder replaced below once baseEpoch/settleEpoch known
                  })
                  .catch(() => 0n)
              : Promise.resolve(0n),
            Promise.resolve(0n),
            Promise.resolve(1000),
            Promise.resolve(1000),
          ]);

          void cutoffSec;
          void settleSec;
          void baseIAVal;
          void baseIBVal;

          const [
            narrativeA,
            narrativeB,
            baseEpoch,
            settleEpoch,
            baseSeriesId,
            ,
            ,
            pool0Gross,
            pool1Gross,
            ,
            outcomeNum,
            settled,
          ] = m;

          const [cutoffTs, settleTs, baseIAOnChain, baseIBOnChain] = await Promise.all([
            addresses.oracleCommit
              ? client
                  .readContract({
                    address: addresses.oracleCommit,
                    abi: oracleCommitAbi,
                    functionName: "epochBoundary",
                    args: [Math.max(0, Number(settleEpoch) - 2)],
                  })
                  .catch(() => 0n)
              : Promise.resolve(0n),
            addresses.oracleCommit
              ? client
                  .readContract({
                    address: addresses.oracleCommit,
                    abi: oracleCommitAbi,
                    functionName: "epochBoundary",
                    args: [Number(settleEpoch)],
                  })
                  .catch(() => 0n)
              : Promise.resolve(0n),
            addresses.oracleCommit
              ? client
                  .readContract({
                    address: addresses.oracleCommit,
                    abi: oracleCommitAbi,
                    functionName: "finalIndex",
                    args: [Number(baseEpoch), Number(narrativeA)],
                  })
                  .catch(() => currentIndexByNarrative.get(Number(narrativeA)) ?? 1000)
              : Promise.resolve(currentIndexByNarrative.get(Number(narrativeA)) ?? 1000),
            Number(narrativeB) === 0
              ? Promise.resolve(1000)
              : addresses.oracleCommit
                ? client
                    .readContract({
                      address: addresses.oracleCommit,
                      abi: oracleCommitAbi,
                      functionName: "finalIndex",
                      args: [Number(baseEpoch), Number(narrativeB)],
                    })
                    .catch(() => currentIndexByNarrative.get(Number(narrativeB)) ?? 1000)
                : Promise.resolve(currentIndexByNarrative.get(Number(narrativeB)) ?? 1000),
          ]);

          const cutoffMs =
            Number(cutoffTs) > 0
              ? Number(cutoffTs) * 1000
              : nowMs + Math.max(1, Number(settleEpoch) - Number(baseEpoch) - 2) * 4 * 3600_000;
          const settleMs =
            Number(settleTs) > 0
              ? Number(settleTs) * 1000
              : cutoffMs + 8 * 3600_000;

          const outcome: MarketItem["outcome"] =
            outcomeNum === 1
              ? "side_a"
              : outcomeNum === 2
                ? "side_b"
                : outcomeNum === 3
                  ? "refund"
                  : null;

          const status: MarketItem["status"] = settled
            ? outcome === "refund"
              ? "refunded"
              : "settled"
            : nowMs >= cutoffMs || Number(latestFinalEpoch) >= Number(settleEpoch) - 2
              ? "locked"
              : "open";

          const metaA = NARRATIVE_BY_ID.get(Number(narrativeA));
          const metaB = NARRATIVE_BY_ID.get(Number(narrativeB));

          return {
            marketId: id,
            narrativeA: Number(narrativeA),
            narrativeB: Number(narrativeB),
            narrativeALabel: metaA?.label ?? `Narrative #${narrativeA}`,
            narrativeBLabel:
              Number(narrativeB) === 0
                ? "All-Narrative Average"
                : metaB?.label ?? `Narrative #${narrativeB}`,
            baseEpoch: Number(baseEpoch),
            settleEpoch: Number(settleEpoch),
            horizonLabel:
              Number(settleEpoch) - Number(baseEpoch) >= 42
                ? "7D (42 epochs)"
                : "24H (6 epochs)",
            cutoffAt: new Date(cutoffMs).toISOString(),
            settleAt: new Date(settleMs).toISOString(),
            status,
            outcome,
            poolAEth: Number(formatEther(pool0Gross)),
            poolBEth: Number(formatEther(pool1Gross)),
            maxPoolEth,
            baseIA: Number(baseIAOnChain),
            baseIB: Number(baseIBOnChain),
            currentIA: currentIndexByNarrative.get(Number(narrativeA)) ?? Number(baseIAOnChain),
            currentIB:
              Number(narrativeB) === 0
                ? 1000
                : currentIndexByNarrative.get(Number(narrativeB)) ?? Number(baseIBOnChain),
            seriesId: Number(baseSeriesId),
          };
        } catch {
          return null;
        }
      }),
    );

    return items.filter((item): item is MarketItem => item !== null);
  } catch {
    return null;
  }
}

export async function readLiveBasketsFromChain(): Promise<BasketItem[] | null> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.basketFactory) return null;

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
          const [narrativeId, name, symbol, totalSupply, navWei, maxTvlWei, constituents] =
            await Promise.all([
              client.readContract({ address: addr, abi: basketAbi, functionName: "narrativeId" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "name" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "symbol" }),
              client.readContract({ address: addr, abi: basketAbi, functionName: "totalSupply" }),
              client
                .readContract({ address: addr, abi: basketAbi, functionName: "totalNavWeth" })
                .catch(() => 0n),
              client
                .readContract({ address: addr, abi: basketAbi, functionName: "maxTVL" })
                .catch(() => 10_000_000_000_000_000_000n),
              client
                .readContract({ address: addr, abi: basketAbi, functionName: "constituents" })
                .catch(() => [[], []] as readonly [readonly Address[], readonly number[]]),
            ]);

          const meta = NARRATIVE_BY_ID.get(Number(narrativeId));
          const navEth = Number(formatEther(navWei));
          const supplyEth = Number(formatEther(totalSupply));
          const sharePriceEth = supplyEth > 0 && navEth > 0 ? navEth / supplyEth : 1;

          const [tokAddrs, weights] = constituents;
          const holdings = await Promise.all(
            tokAddrs.map(async (tokAddr, idx) => {
              const [tokSym, tokName] = await Promise.all([
                client
                  .readContract({ address: tokAddr, abi: erc20Abi, functionName: "symbol" })
                  .catch(() => `TOK${idx + 1}`),
                client
                  .readContract({ address: tokAddr, abi: erc20Abi, functionName: "name" })
                  .catch(() => tokAddr),
              ]);
              return {
                symbol: tokSym,
                name: tokName,
                address: tokAddr,
                weightBps: Number(weights[idx] ?? 0),
                liquidityEth: 0,
                twap30mEth: 0,
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
            managementFeeBps: 50,
            lastRebalancedAt: new Date().toISOString(),
            holdings,
          };
        } catch {
          return null;
        }
      }),
    );

    return items.filter((b): b is BasketItem => b !== null);
  } catch {
    return null;
  }
}

export async function readLiveGrantRoundsFromChain(): Promise<GrantRoundItem[] | null> {
  const { addresses, client } = getServerPublicClient();
  if (!addresses.grants) return null;

  try {
    const currentRound = await client.readContract({
      address: addresses.grants,
      abi: grantsAbi,
      functionName: "currentRoundId",
    });

    const totalRounds = Number(currentRound);
    if (totalRounds <= 0) return [];

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

          const propIds: number[] = [];
          for (let pid = 1; pid <= Math.min(Number(proposalCount), 25); pid++) {
            propIds.push(pid);
          }

          const rawProps = await Promise.all(
            propIds.map(async (pid) => {
              const [proposer, recipient, metadataHash, votes, allocation, claimed] =
                await client.readContract({
                  address: addresses.grants!,
                  abi: grantsAbi,
                  functionName: "proposals",
                  args: [BigInt(rid), BigInt(pid)],
                });

              const votesNum = Number(formatEther(votes));
              const totalVotesNum = Number(formatEther(totalVotes));
              const budgetEth = Number(formatEther(budget));
              const shareBps =
                totalVotesNum > 0 ? Math.min(4000, Math.round((votesNum / totalVotesNum) * 10000)) : 0;
              const projectedEth =
                Number(allocation) > 0
                  ? Number(formatEther(allocation))
                  : (budgetEth * shareBps) / 10000;

              return {
                proposalId: pid,
                roundId: rid,
                title: `Grant Proposal #${pid}`,
                summary: `Metadata digest ${metadataHash.slice(0, 18)}…${metadataHash.slice(-6)} · Recipient ${recipient.slice(0, 8)}…${recipient.slice(-4)}`,
                narrativeId: ((pid - 1) % 10) + 1,
                proposer,
                recipient,
                metadataHash,
                votesNti: votesNum,
                projectedShareBps: shareBps,
                projectedEth,
                claimed,
              };
            }),
          );

          const status: GrantRoundItem["status"] = finalized
            ? "finalized"
            : nowSec >= Number(endsAt)
              ? "finalized"
              : "active";

          return {
            roundId: rid,
            status,
            budgetEth: Number(formatEther(budget)),
            snapshotBlock: Number(snapshotBlock),
            voteEnd: new Date(Number(endsAt) * 1000).toISOString(),
            totalVotesNti: Number(formatEther(totalVotes)),
            quorumNti: 100_000,
            proposals: rawProps,
          };
        } catch {
          return null;
        }
      }),
    );

    return rounds.filter((r): r is GrantRoundItem => r !== null);
  } catch {
    return null;
  }
}
