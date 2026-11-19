"use client";

import React, { useMemo, useState } from "react";
import { keccak256, toHex } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { NARRATIVE_BY_ID } from "@nti/sdk";
import {
  getActiveChainId,
  getProtocolAddresses,
  grantsAbi,
} from "@/lib/contracts";
import {
  formatBpsPercent,
  formatCompactNumber,
  formatCountdown,
  formatEth,
  truncateHex,
} from "@/lib/format";
import type { GrantRoundItem } from "@/lib/types";

export function GrantsClient({
  rounds,
  awaitingDeployment,
}: {
  rounds: GrantRoundItem[];
  awaitingDeployment: boolean;
}) {
  const { isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const addresses = getProtocolAddresses(getActiveChainId());

  const round = rounds[0];
  const [weights, setWeights] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    round?.proposals.forEach((p, idx) => {
      init[p.proposalId] = idx === 0 ? 50 : idx === 1 ? 50 : 0;
    });
    return init;
  });

  const [newTitle, setNewTitle] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalWeight = useMemo(
    () => Object.values(weights).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0),
    [weights],
  );

  const submitVote = async () => {
    if (!round) return;
    setMsg(null);
    setErr(null);
    if (totalWeight !== 100) {
      setErr("Split vote weights must sum to exactly 100%.");
      return;
    }
    if (!isConnected) {
      setErr("Connect your wallet to submit your stake-weighted vote.");
      return;
    }
    if (!addresses.grants) {
      setErr("Grants contract not yet deployed on this chain.");
      return;
    }

    const entries = Object.entries(weights)
      .filter(([, w]) => w > 0)
      .map(([id, w]) => [BigInt(id), BigInt(w * 100)] as const);

    try {
      const hash = await writeContractAsync({
        address: addresses.grants,
        abi: grantsAbi,
        functionName: "vote",
        args: [
          BigInt(round.roundId),
          entries.map(([id]) => id),
          entries.map(([, w]) => w),
        ],
      });
      setMsg(`Split vote submitted: ${hash}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Vote transaction failed");
    }
  };

  const submitProposal = async () => {
    setMsg(null);
    setErr(null);
    if (!isConnected) {
      setErr("Connect your wallet first (requires ≥50,000 $NTI staked).");
      return;
    }
    if (!addresses.grants) {
      setErr("Grants contract not yet deployed on this chain.");
      return;
    }
    if (!newTitle.trim() || !/^0x[0-9a-fA-F]{40}$/.test(newRecipient.trim())) {
      setErr("Enter a proposal title and valid 0x recipient address.");
      return;
    }
    try {
      const metadataHash = keccak256(toHex(newTitle.trim()));
      const hash = await writeContractAsync({
        address: addresses.grants,
        abi: grantsAbi,
        functionName: "submitProposal",
        args: [metadataHash, newRecipient.trim() as `0x${string}`],
      });
      setMsg(`Grant proposal submitted: ${hash}`);
      setNewTitle("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Proposal transaction failed");
    }
  };

  const invokeRoundAction = async (fn: "finalizeRound" | "claim", proposalId?: number) => {
    if (!round) return;
    setMsg(null);
    setErr(null);
    if (!isConnected || !addresses.grants) {
      setErr("Connect wallet with Grants contract configured.");
      return;
    }
    try {
      const hash =
        fn === "finalizeRound"
          ? await writeContractAsync({
              address: addresses.grants,
              abi: grantsAbi,
              functionName: "finalizeRound",
              args: [BigInt(round.roundId)],
            })
          : await writeContractAsync({
              address: addresses.grants,
              abi: grantsAbi,
              functionName: "claim",
              args: [BigInt(round.roundId), BigInt(proposalId ?? 0)],
            });
      setMsg(`${fn} submitted: ${hash}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  if (!round) {
    return (
      <div className="panel-surface rounded-md p-8 text-center font-mono text-xs text-[#8A96A8]">
        No grant rounds indexed yet.
      </div>
    );
  }

  const quorumPct = Math.min(100, (round.totalVotesNti / Math.max(1, round.quorumNti)) * 100);

  return (
    <div className="space-y-6">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/8 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW GRANT ROUND</strong> · Grants contract mirror has 0 indexed rounds yet. Funded by 20% of FeeRouter ETH revenue (not token inflation).
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
            ECOSYSTEM GRANTS · 20% OF PROTOCOL FEES
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-[#EDF1F7]">
            Grant Round #{round.roundId} · Stake-Weighted Split Voting
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Voting power snapshots from Staking.getPastVotes() at block #{round.snapshotBlock.toLocaleString("en-US")}. Top 5 proposals split the ETH pool pro-rata (max 40% cap per proposal; 1% total stake quorum).
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            type="button"
            disabled={isPending}
            onClick={() => void invokeRoundAction("finalizeRound")}
            className="rounded border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-2 text-[#38BDF8] hover:bg-[#38BDF8]/20 disabled:opacity-50"
          >
            FINALIZE ROUND #{round.roundId}
          </button>
        </div>
      </div>

      {/* Round KPI Strip */}
      <div className="grid grid-cols-2 gap-3 font-mono tabular-nums sm:grid-cols-4">
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">ROUND BUDGET</div>
          <div className="mt-1 text-lg font-semibold text-[#10B981]">
            {formatEth(round.budgetEth, 2)}
          </div>
          <div className="text-[10px] text-[#8A96A8]">Unreserved ETH balance</div>
        </div>
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">VOTE DEADLINE</div>
          <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">
            {formatCountdown(round.voteEnd)}
          </div>
          <div className="text-[10px] text-[#8A96A8]">Status: {round.status.toUpperCase()}</div>
        </div>
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">SNAPSHOT BLOCK</div>
          <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">
            #{round.snapshotBlock.toLocaleString("en-US")}
          </div>
          <div className="text-[10px] text-[#8A96A8]">IVotes checkpoint</div>
        </div>
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">QUORUM PROGRESS</div>
          <div className="mt-1 text-lg font-semibold text-[#38BDF8]">
            {quorumPct.toFixed(0)}%
          </div>
          <div className="text-[10px] text-[#8A96A8]">
            {formatCompactNumber(round.totalVotesNti)} / {formatCompactNumber(round.quorumNti)} $NTI
          </div>
        </div>
      </div>

      {/* Proposals + Split Vote Allocation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Active Proposals ({round.proposals.length})
            </h2>
            <span
              className={`font-mono text-xs tabular-nums ${
                totalWeight === 100 ? "text-[#10B981]" : "text-[#F59E0B]"
              }`}
            >
              YOUR ALLOCATION: {totalWeight}% / 100%
            </span>
          </div>

          {round.proposals.map((p) => {
            const nar = NARRATIVE_BY_ID.get(p.narrativeId);
            const myW = weights[p.proposalId] ?? 0;
            return (
              <div key={p.proposalId} className="panel-surface rounded-md p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 font-mono text-[10px] text-[#8A96A8]">
                      <span>PROP #{p.proposalId}</span>
                      {nar && (
                        <span className="rounded border border-[#2A3342] bg-[#131820] px-1.5 py-0.5 text-[#38BDF8]">
                          {nar.label}
                        </span>
                      )}
                      <span>Recipient {truncateHex(p.recipient, 6, 4)}</span>
                    </div>
                    <h3 className="mt-1 font-display text-sm font-semibold text-[#EDF1F7]">
                      {p.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#8A96A8]">{p.summary}</p>
                  </div>

                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-semibold text-[#10B981]">
                      {formatEth(p.projectedEth, 3)}
                    </div>
                    <div className="text-[10px] text-[#8A96A8]">
                      {formatBpsPercent(p.projectedShareBps, 1)} · {formatCompactNumber(p.votesNti)} votes
                    </div>
                  </div>
                </div>

                {/* Split weight slider & claim */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#1B2028] pt-3">
                  <div className="flex flex-1 items-center gap-3">
                    <span className="font-mono text-[10px] text-[#556173]">VOTE SPLIT</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={myW}
                      onChange={(e) =>
                        setWeights((prev) => ({
                          ...prev,
                          [p.proposalId]: Number(e.target.value),
                        }))
                      }
                      className="h-1.5 flex-1 accent-[#10B981]"
                    />
                    <span className="w-10 text-right font-mono text-xs font-semibold text-[#EDF1F7] tabular-nums">
                      {myW}%
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isPending || round.status !== "finalized"}
                    onClick={() => void invokeRoundAction("claim", p.proposalId)}
                    className="rounded border border-[#2A3342] bg-[#131820] px-2.5 py-1 font-mono text-[10px] text-[#8A96A8] hover:text-[#EDF1F7] disabled:opacity-40"
                  >
                    {p.claimed ? "CLAIMED" : "CLAIM GRANT"}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#1B2028] bg-[#0B0E13] p-3.5">
            <div className="font-mono text-xs text-[#8A96A8]">
              Vote split allocates your snapshot voting weight across unique proposals (no duplicate IDs).
            </div>
            <button
              type="button"
              disabled={isPending || totalWeight !== 100}
              onClick={() => void submitVote()}
              className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-4 py-2 font-mono text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/25 disabled:opacity-40"
            >
              CAST SPLIT VOTE ({totalWeight}%)
            </button>
          </div>

          {err && (
            <div className="rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 font-mono text-xs text-[#EF4444]">
              {err}
            </div>
          )}
          {msg && (
            <div className="rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-xs text-[#10B981]">
              {msg}
            </div>
          )}
        </div>

        {/* Submit Proposal Panel */}
        <div className="panel-surface h-fit rounded-md p-4 lg:col-span-4">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            Submit Grant Proposal
          </h2>
          <p className="mt-1 font-mono text-[11px] text-[#8A96A8]">
            Requires ≥50,000 $NTI active stake. Metadata hash is stored on-chain via keccak256.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="font-mono text-[10px] text-[#8A96A8]">
                PROPOSAL TITLE / IPFS URI
              </label>
              <input
                type="text"
                placeholder="e.g. Open-source Robinhood Chain Validator Kit"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 text-xs text-[#EDF1F7] focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-[#8A96A8]">
                RECIPIENT ADDRESS (0x...)
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                className="mt-1 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-xs text-[#EDF1F7] focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={() => void submitProposal()}
              className="w-full rounded border border-[#38BDF8]/50 bg-[#38BDF8]/15 py-2.5 font-mono text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 disabled:opacity-50"
            >
              SUBMIT PROPOSAL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
