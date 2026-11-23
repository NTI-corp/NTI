"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, keccak256, stringToBytes, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { Sprout } from "lucide-react";
import { EmptyState } from "@/components/ui/Visuals";
import { TxStatusBanner } from "@/components/TxStatusBanner";
import { getActiveChainId, getProtocolAddresses, grantsAbi, stakingAbi } from "@/lib/contracts";
import { formatCompactNumber, formatCountdown, formatEth, formatBpsPercent, truncateHex } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import type { GrantRoundItem } from "@/lib/types";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

interface GrantsClientProps {
  rounds: GrantRoundItem[];
  awaitingDeployment?: boolean;
}

const DEFAULT_MIN_PROPOSAL_STAKE_WEI = 50_000n * 10n ** 18n;

export function GrantsClient({ rounds, awaitingDeployment = false }: GrantsClientProps) {
  const { address, isConnected } = useAccount();
  const addrs = getProtocolAddresses(getActiveChainId());
  const activeChainId = getActiveChainId();

  const [selectedRoundId, setSelectedRoundId] = useState<number>(
    () => rounds.find((r) => r.status === "active")?.roundId ?? rounds[0]?.roundId ?? 1,
  );
  const round = useMemo(
    () => rounds.find((r) => r.roundId === selectedRoundId) ?? rounds[0] ?? null,
    [rounds, selectedRoundId],
  );

  const [weights, setWeights] = useState<Record<number, number>>({});
  const [newTitle, setNewTitle] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!round) return;
    const init: Record<number, number> = {};
    round.proposals.forEach((p, idx) => {
      init[p.proposalId] = idx === 0 ? 100 : 0;
    });
    setWeights(init);
  }, [round?.roundId, round?.proposals.length]);

  const { data: votingPowerWei, refetch: refetchVotes } = useReadContract({
    address: addrs.staking ?? undefined,
    abi: stakingAbi,
    functionName: "getPastVotes",
    args:
      address && round && round.snapshotBlock > 0
        ? [address, BigInt(round.snapshotBlock)]
        : undefined,
    chainId: activeChainId,
    query: {
      enabled: Boolean(
        isConnected && address && addrs.staking && round && round.snapshotBlock > 0,
      ),
    },
  });

  const { data: activeStakeWei, refetch: refetchStake } = useReadContract({
    address: addrs.staking ?? undefined,
    abi: stakingAbi,
    functionName: "stakeOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address && addrs.staking) },
  });

  const { data: minProposalStakeWei } = useReadContract({
    address: addrs.grants ?? undefined,
    abi: grantsAbi,
    functionName: "minProposalStake",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.grants) },
  });

  const { data: hasVotedOnChain, refetch: refetchHasVoted } = useReadContract({
    address: addrs.grants ?? undefined,
    abi: grantsAbi,
    functionName: "hasVoted",
    args: round && address ? [BigInt(round.roundId), address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address && addrs.grants && round) },
  });

  const { txState, isBusy, wrongChain, targetChainId, explorerBase, execute, resetTx } =
    useChainAction(async () => {
      await Promise.all([refetchVotes(), refetchStake(), refetchHasVoted()]);
    });

  const votingPower = (votingPowerWei as bigint | undefined) ?? 0n;
  const activeStake = (activeStakeWei as bigint | undefined) ?? 0n;
  const minStake =
    (minProposalStakeWei as bigint | undefined) ?? DEFAULT_MIN_PROPOSAL_STAKE_WEI;
  const hasVoted = Boolean(hasVotedOnChain);

  const votingPowerNti = Number(formatEther(votingPower));
  const activeStakeNti = Number(formatEther(activeStake));
  const minStakeNti = Number(formatEther(minStake));
  const meetsProposalStake = activeStake >= minStake;

  if (!round) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Sprout}
          kicker="Ecosystem grants"
          title={awaitingDeployment ? "Grant data unavailable" : "No grant rounds yet"}
          text={awaitingDeployment ? "The grants contract did not return current round data." : "Awaiting a funded round on Robinhood Chain."}
          steps={["Governance opens a funded round", "Builders submit proposals", "Stakers vote, winners get paid"]}
        />
      </div>
    );
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const quorumPct =
    round.quorumNti && round.quorumNti > 0 ? Math.min(100, (round.totalVotesNti / round.quorumNti) * 100) : null;

  async function submitVote() {
    if (!round) return;
    setValidationError(null);
    if (!addrs.grants) {
      setValidationError("Grants contract address is not configured.");
      return;
    }
    if (!isConnected || !address) {
      setValidationError("Connect an EVM wallet before voting.");
      return;
    }
    if (hasVoted) {
      setValidationError(`Wallet has already voted in Round #${round.roundId}.`);
      return;
    }
    if (votingPower <= 0n) {
      setValidationError(
        `No snapshot voting power at block #${round.snapshotBlock.toLocaleString("en-US")}. Stake $NTI before the round snapshot.`,
      );
      return;
    }
    if (totalWeight !== 100) {
      setValidationError("Split weights must sum to exactly 100%.");
      return;
    }

    const entries = Object.entries(weights)
      .map(([id, w]) => ({ id: BigInt(id), pct: Math.round(w) }))
      .filter((x) => x.pct > 0);

    if (entries.length === 0) {
      setValidationError("Select at least one proposal with positive weight.");
      return;
    }

    // Grants.sol expects raw token-wei vote weights such that sum(weights) <= getPastVotes(voter, snapshotBlock)
    const ids = entries.map((e) => e.id);
    const weiWeights = entries.map((e) => (votingPower * BigInt(e.pct)) / 100n);
    const allocated = weiWeights.reduce((acc, w) => acc + w, 0n);
    const remainder = votingPower - allocated;
    if (remainder > 0n && weiWeights.length > 0) {
      weiWeights[0] = (weiWeights[0] ?? 0n) + remainder;
    }

    await execute(
      `Cast split vote in Round #${round.roundId}`,
      {
        address: addrs.grants,
        abi: grantsAbi,
        functionName: "vote",
        args: [BigInt(round.roundId), ids, weiWeights],
      },
      `Split vote recorded for Round #${round.roundId}.`,
    );
  }

  async function submitProposal() {
    setValidationError(null);
    if (!addrs.grants) {
      setValidationError("Grants contract address is not configured.");
      return;
    }
    if (!isConnected || !address) {
      setValidationError("Connect an EVM wallet to submit a proposal.");
      return;
    }
    if (!meetsProposalStake) {
      setValidationError(
        `Active stake (${formatCompactNumber(activeStakeNti)} $NTI) is below the ${formatCompactNumber(minStakeNti)} $NTI minimum.`,
      );
      return;
    }
    const cleanTitle = newTitle.trim();
    if (cleanTitle.length < 3) {
      setValidationError("Enter a descriptive proposal title or IPFS URI (min 3 characters).");
      return;
    }
    const cleanRecipient = newRecipient.trim();
    if (!isAddress(cleanRecipient)) {
      setValidationError("Recipient must be a valid 0x EVM address.");
      return;
    }

    const metadataHash = keccak256(stringToBytes(cleanTitle));
    const hash = await execute(
      "Submit grant proposal",
      {
        address: addrs.grants,
        abi: grantsAbi,
        functionName: "submitProposal",
        args: [metadataHash, cleanRecipient as Address],
      },
      "Grant proposal submitted on-chain.",
    );

    if (hash) {
      setNewTitle("");
      setNewRecipient("");
    }
  }

  async function invokeRoundAction(fn: "finalizeRound" | "claim", proposalId?: number) {
    if (!round) return;
    setValidationError(null);
    if (!addrs.grants) {
      setValidationError("Grants contract address is not configured.");
      return;
    }
    if (fn === "finalizeRound") {
      await execute(
        `Finalize Round #${round.roundId}`,
        {
          address: addrs.grants,
          abi: grantsAbi,
          functionName: "finalizeRound",
          args: [BigInt(round.roundId)],
        },
        `Round #${round.roundId} finalized.`,
      );
      return;
    }

    await execute(
      `Claim Grant #${proposalId ?? 1}`,
      {
        address: addrs.grants,
        abi: grantsAbi,
        functionName: "claim",
        args: [BigInt(round.roundId), BigInt(proposalId ?? 1)],
      },
      `Grant #${proposalId ?? 1} payout claimed.`,
    );
  }

  const recipientInvalid = newRecipient.trim().length > 0 && !isAddress(newRecipient.trim());

  return (
    <div className="space-y-4">
      {/* Header + Round Tabs */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#26262A] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
              Public Goods Allocation
            </span>
            {wrongChain && (
              <span className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                AUTO-SWITCHES TO CHAIN {targetChainId} ON TX
              </span>
            )}
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
            Grants · Round #{round.roundId}
          </h1>
          <p className="mt-1 text-xs text-[#71717A]">
            Split snapshot voting power across competing narrative proposals. Non-normalized weights sum up to your IVotes balance at snapshot block #{round.snapshotBlock.toLocaleString("en-US")}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {rounds.length > 1 && (
            <SegmentedTabs
              value={String(round.roundId)}
              onChange={(val) => setSelectedRoundId(Number(val))}
              options={rounds.map((r) => ({
                value: String(r.roundId),
                label: `Round #${r.roundId}`,
                tone: "lime" as const,
              }))}
              className="font-mono text-[11px]"
              buttonClassName="px-2.5 py-1"
            />
          )}

          <button
            type="button"
            disabled={isBusy || !isConnected || round.status !== "awaiting_finalization"}
            onClick={() => void invokeRoundAction("finalizeRound")}
            className="border border-[#CCFF00]/40 bg-[#CCFF00]/12 px-3 py-1.5 font-mono text-[11px] font-medium text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {round.status === "finalized" ? "ROUND FINALIZED" : `FINALIZE ROUND #${round.roundId}`}
          </button>
        </div>
      </div>

      {/* Round KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="border border-[#26262A] bg-[#161618] p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Round Budget
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#4ADE80] tabular-nums">
            {formatEth(round.budgetEth, 4)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#71717A]">Escrowed ETH allocation</div>
        </div>

        <div className="border border-[#26262A] bg-[#161618] p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Vote Deadline
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#F5F5F7] tabular-nums">
            {formatCountdown(round.voteEnd)}
          </div>
          <div className="mt-0.5 font-mono text-[11px] uppercase text-[#71717A]">
            {round.status.replaceAll("_", " ")}
          </div>
        </div>

        <div className="border border-[#26262A] bg-[#161618] p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Snapshot Block
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#F5F5F7] tabular-nums">
            #{round.snapshotBlock.toLocaleString("en-US")}
          </div>
          <div className="mt-0.5 text-[11px] text-[#71717A]">IVotes checkpoint</div>
        </div>

        <div className="border border-[#26262A] bg-[#161618] p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Quorum Progress
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#F5F5F7] tabular-nums">
            {quorumPct === null ? "Unavailable" : `${quorumPct.toFixed(0)}%`}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[#71717A] tabular-nums">
            {formatCompactNumber(round.totalVotesNti)}{round.quorumNti === null ? "" : ` / ${formatCompactNumber(round.quorumNti)}`} $NTI
          </div>
        </div>

        <div className="col-span-2 border border-[#26262A] bg-[#161618] p-3.5 sm:col-span-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Your Snapshot Power
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-[#CCFF00] tabular-nums">
            {isConnected ? `${formatCompactNumber(Math.round(votingPowerNti))} $NTI` : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-[#71717A]">
            {!isConnected
              ? "Connect wallet"
              : hasVoted
                ? "Voted in this round"
                : votingPower > 0n
                  ? "Eligible to split vote"
                  : "0 votes at snapshot"}
          </div>
        </div>
      </div>

      {/* Proposals + Submit Proposal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Active Proposals ({round.proposals.length})
            </h2>
            <span
              className={`font-mono text-xs tabular-nums ${
                totalWeight === 100 ? "text-[#4ADE80]" : "text-[#F59E0B]"
              }`}
            >
              Allocation: {totalWeight}% / 100%
            </span>
          </div>

          {round.proposals.length === 0 ? (
            <div className="border border-[#26262A] bg-[#161618] p-6 text-center text-xs text-[#71717A]">
              No proposals submitted for Round #{round.roundId} yet. Submit the first proposal on the right.
            </div>
          ) : (
            round.proposals.map((p) => {
              const myW = weights[p.proposalId] ?? 0;
              return (
                <div
                  key={p.proposalId}
                  className="border border-[#26262A] bg-[#161618] p-4 transition-colors hover:border-[#3A3A40]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#71717A]">
                        <span className="text-[#F5F5F7]">PROP #{p.proposalId}</span>
                        <span>Recipient {truncateHex(p.recipient, 6, 4)}</span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-[#F5F5F7]">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#71717A]">{p.summary}</p>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-[#4ADE80]">
                        {formatEth(p.projectedEth, 4)}
                      </div>
                      <div className="text-[11px] text-[#71717A]">
                        {formatBpsPercent(p.projectedShareBps, 1)} · {formatCompactNumber(p.votesNti)} votes
                      </div>
                    </div>
                  </div>

                  {/* Split weight slider & claim */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#26262A] pt-3">
                    <div className="flex flex-1 items-center gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                        Vote Split
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        disabled={hasVoted || round.status !== "active"}
                        value={myW}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [p.proposalId]: Number(e.target.value),
                          }))
                        }
                        className="h-1.5 flex-1 accent-[#CCFF00] disabled:opacity-40"
                      />
                      <span className="w-10 text-right font-mono text-xs font-semibold text-[#F5F5F7] tabular-nums">
                        {myW}%
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy || p.claimed || round.status !== "finalized" || p.projectedEth <= 0 || address?.toLowerCase() !== p.recipient.toLowerCase()}
                      onClick={() => void invokeRoundAction("claim", p.proposalId)}
                      className="border border-[#26262A] bg-[#111113] px-3 py-1 font-mono text-[11px] text-[#F5F5F7] transition-colors hover:border-[#CCFF00]/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {p.claimed ? "CLAIMED" : "CLAIM GRANT"}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border border-[#26262A] bg-[#161618] p-3.5">
            <div className="text-xs text-[#71717A]">
              Allocates your on-chain snapshot balance ({formatCompactNumber(Math.round(votingPowerNti))} $NTI wei) across selected proposals.
            </div>
            <button
              type="button"
              disabled={
                isBusy ||
                totalWeight !== 100 ||
                hasVoted ||
                votingPower <= 0n ||
                round.status !== "active" ||
                round.proposals.length === 0
              }
              onClick={() => void submitVote()}
              className="bg-[#CCFF00] px-4 py-2 font-mono text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#B8E600] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hasVoted ? "ALREADY VOTED" : `CAST SPLIT VOTE (${totalWeight}%)`}
            </button>
          </div>

          {validationError && (
            <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
              {validationError}
            </div>
          )}

          <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
        </div>

        {/* Submit Proposal Panel */}
        <div className="h-fit border border-[#26262A] bg-[#161618] p-4 lg:col-span-4">
          <h2 className="text-sm font-semibold text-[#F5F5F7]">Submit Grant Proposal</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#71717A]">
            Requires at least {formatCompactNumber(minStakeNti)} $NTI active stake. Metadata is hashed on-chain via keccak256.
          </p>

          <div className="mt-3 border border-[#26262A] bg-[#111113] px-3 py-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[#71717A]">Your Active Stake</span>
              <span
                className={`font-mono font-medium tabular-nums ${
                  meetsProposalStake ? "text-[#4ADE80]" : "text-[#F59E0B]"
                }`}
              >
                {isConnected ? `${formatCompactNumber(Math.round(activeStakeNti))} $NTI` : "Not connected"}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Proposal Title / IPFS URI
              </label>
              <input
                type="text"
                placeholder="e.g. Open-source Robinhood Chain Validator Kit"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 text-xs text-[#F5F5F7] placeholder-[#52525B] focus:border-[#CCFF00] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Recipient Address (0x...)
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                className={`mt-1 w-full border bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] placeholder-[#52525B] focus:outline-none ${
                  recipientInvalid
                    ? "border-[#EF4444]/60 focus:border-[#EF4444]"
                    : "border-[#26262A] focus:border-[#CCFF00]"
                }`}
              />
              {recipientInvalid && (
                <div className="mt-1 font-mono text-[10px] text-[#EF4444]">
                  Enter a valid 42-character EVM address.
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isBusy || !isConnected || !meetsProposalStake}
              onClick={() => void submitProposal()}
              className="w-full border border-[#CCFF00]/50 bg-[#CCFF00]/12 py-2.5 font-mono text-xs font-semibold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {!isConnected
                ? "CONNECT WALLET TO SUBMIT"
                : !meetsProposalStake
                  ? `NEED ${formatCompactNumber(minStakeNti)} $NTI STAKED`
                  : "SUBMIT PROPOSAL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
