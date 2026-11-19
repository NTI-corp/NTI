"use client";

import React, { useState } from "react";
import { keccak256, toHex } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { NARRATIVES } from "@nti/sdk";
import {
  disputeAbi,
  getActiveChainId,
  getProtocolAddresses,
  oracleCommitAbi,
} from "@/lib/contracts";
import { formatBpsPercent, formatRelativeTime, truncateHex } from "@/lib/format";
import { EpochBadge } from "./EpochBadge";
import { AwaitingEpochBanner } from "./AwaitingEpochBanner";
import type { EpochDetailResponse, EpochStatus } from "@/lib/types";

const LIFECYCLE_STEPS: Array<{ key: EpochStatus; title: string; offset: string }> = [
  { key: "collecting", title: "Collecting", offset: "B + 0m" },
  { key: "computed", title: "Computed & Arweave", offset: "B + 45m" },
  { key: "committed", title: "Committed (≥3 Atts)", offset: "B + 90m" },
  { key: "disputed", title: "Dispute Window (2h)", offset: "B + 90m..210m" },
  { key: "final", title: "Finalized", offset: "B + 210m" },
];

const STATUS_RANK: Record<EpochStatus, number> = {
  collecting: 0,
  computed: 1,
  committed: 2,
  disputed: 3,
  final: 4,
  incomplete: 2,
};

export function OracleClient({ initial }: { initial: EpochDetailResponse }) {
  const { isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const addresses = getProtocolAddresses(getActiveChainId());

  const [detail, setDetail] = useState<EpochDetailResponse>(initial);
  const [loadingEpoch, setLoadingEpoch] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeNarrativeId, setDisputeNarrativeId] = useState(1);
  const [claimedIBps, setClaimedIBps] = useState("1000");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  const loadEpoch = async (epochId: number) => {
    setLoadingEpoch(true);
    try {
      const res = await fetch(`/api/epochs/${epochId}`);
      if (res.ok) {
        const next = (await res.json()) as EpochDetailResponse;
        setDetail(next);
      }
    } finally {
      setLoadingEpoch(false);
    }
  };

  const handleFinalize = async () => {
    setTxErr(null);
    setTxMsg(null);
    if (!isConnected || !addresses.oracleCommit) {
      setTxErr("Connect wallet with OracleCommit contract configured.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: addresses.oracleCommit,
        abi: oracleCommitAbi,
        functionName: "finalize",
        args: [detail.epoch.epochId],
      });
      setTxMsg(`finalize(${detail.epoch.epochId}) submitted: ${hash}`);
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Finalize failed");
    }
  };

  const handleOpenDispute = async () => {
    setTxErr(null);
    setTxMsg(null);
    if (!isConnected || !addresses.dispute) {
      setTxErr("Connect wallet with Dispute contract configured (requires 50,000 $NTI bond approval).");
      return;
    }
    const claimed = Number.parseInt(claimedIBps, 10);
    if (!Number.isInteger(claimed) || claimed < 0 || claimed > 10_000) {
      setTxErr("Claimed I_n must be between 0 and 10,000 bps.");
      return;
    }
    try {
      const evHash = evidenceNote.startsWith("0x") && evidenceNote.length === 66
        ? (evidenceNote as `0x${string}`)
        : keccak256(toHex(evidenceNote || `dispute-epoch-${detail.epoch.epochId}`));

      const hash = await writeContractAsync({
        address: addresses.dispute,
        abi: disputeAbi,
        functionName: "openDispute",
        args: [detail.epoch.epochId, disputeNarrativeId, claimed, evHash],
      });
      setTxMsg(`Dispute opened on epoch #${detail.epoch.epochId}: ${hash}`);
      setDisputeModalOpen(false);
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Dispute transaction failed");
    }
  };

  const activeRank = STATUS_RANK[detail.epoch.status] ?? 0;

  return (
    <div className="space-y-6">
      {detail.awaitingFirstEpoch && <AwaitingEpochBanner />}

      {/* Header + Epoch Selector */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
              ORACLE TRANSPARENCY &amp; DISPUTE AUDIT
            </span>
            <EpochBadge epochId={detail.epoch.epochId} status={detail.epoch.status} />
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-[#EDF1F7]">
            Epoch #{detail.epoch.epochId} · Verifiable Attestation Ledger
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Every committed epoch requires ≥3 independent EIP-712 validator attestations within 100 bps of median and ≥95% omission sample overlap. Disputes lock a 50,000 $NTI bond during the 2-hour challenge window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            type="button"
            disabled={isPending}
            onClick={() => void handleFinalize()}
            className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-3 py-2 text-[#10B981] hover:bg-[#10B981]/25 disabled:opacity-50"
          >
            FINALIZE EPOCH
          </button>
          <button
            type="button"
            onClick={() => setDisputeModalOpen(true)}
            className="rounded border border-[#EF4444]/50 bg-[#EF4444]/15 px-3 py-2 text-[#EF4444] hover:bg-[#EF4444]/25"
          >
            OPEN DISPUTE (50K $NTI)
          </button>
        </div>
      </div>

      {/* Recent Epochs Bar */}
      {detail.recentEpochs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="mr-1 text-[#556173]">EPOCHS:</span>
          {detail.recentEpochs.map((ep) => (
            <button
              key={ep.epochId}
              type="button"
              disabled={loadingEpoch}
              onClick={() => void loadEpoch(ep.epochId)}
              className={`rounded border px-2.5 py-1 transition-colors ${
                ep.epochId === detail.epoch.epochId
                  ? "border-[#38BDF8]/60 bg-[#38BDF8]/12 text-[#EDF1F7]"
                  : "border-[#1B2028] bg-[#0E1117] text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              E{ep.epochId} · {ep.status}
            </button>
          ))}
        </div>
      )}

      {/* Lifecycle Timeline */}
      <div className="panel-surface rounded-md p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#556173]">
          EPOCH LIFECYCLE TIMELINE (SERIES S{detail.epoch.seriesId})
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {LIFECYCLE_STEPS.map((step, i) => {
            const reached = i <= activeRank;
            const current = step.key === detail.epoch.status;
            return (
              <div
                key={step.key}
                className={`rounded border p-3 font-mono ${
                  current
                    ? "border-[#38BDF8]/60 bg-[#38BDF8]/10"
                    : reached
                      ? "border-[#10B981]/35 bg-[#10B981]/8"
                      : "border-[#1B2028] bg-[#0B0E13]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#556173]">{step.offset}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      current
                        ? "bg-[#38BDF8] animate-pulse"
                        : reached
                          ? "bg-[#10B981]"
                          : "bg-[#2A3342]"
                    }`}
                  />
                </div>
                <div className="mt-1.5 text-xs font-semibold text-[#EDF1F7]">
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cryptographic Hashes & Arweave Provenance */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#1B2028] pt-4 font-mono text-xs md:grid-cols-3">
          <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <div className="text-[10px] text-[#556173]">DATASET HASH (keccak256)</div>
            <div className="mt-1 break-all text-[11px] text-[#EDF1F7]">
              {detail.epoch.datasetHash ?? "Pending snapshot"}
            </div>
          </div>
          <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <div className="text-[10px] text-[#556173]">CONFIG HASH (ConfigRegistry)</div>
            <div className="mt-1 break-all text-[11px] text-[#EDF1F7]">
              {detail.epoch.configHash ?? "Pending"}
            </div>
          </div>
          <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <div className="text-[10px] text-[#556173]">ARWEAVE PERMANENT SNAPSHOT</div>
            <div className="mt-1 truncate text-[11px] text-[#38BDF8]">
              {detail.epoch.arweaveTx ? (
                <a
                  href={`https://arweave.net/${detail.epoch.arweaveTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  ar://{detail.epoch.arweaveTx} ↗
                </a>
              ) : (
                "Awaiting upload"
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validator Attestation Matrix */}
      <div className="panel-surface rounded-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1B2028] px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Validator EIP-712 Attestation Vectors ({detail.attestations.length} / 3 Quorum)
            </h2>
            <p className="font-mono text-[11px] text-[#8A96A8]">
              Median per narrative is committed on-chain; operator and validators must agree within ±100 bps
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1B2028] bg-[#0B0E13] font-mono text-[10px] uppercase text-[#556173]">
                <th className="px-4 py-2.5">Validator</th>
                {NARRATIVES.slice(0, 6).map((n) => (
                  <th key={n.id} className="px-2.5 py-2.5 text-right">
                    {n.slug.slice(0, 6)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right">Delta Check</th>
                <th className="px-4 py-2.5 text-right">Signed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B2028] font-mono tabular-nums">
              {detail.attestations.map((att) => (
                <tr key={att.validator} className="hover:bg-[#131820]/50">
                  <td className="px-4 py-2.5 text-[#EDF1F7]">
                    {truncateHex(att.validator, 8, 6)}
                  </td>
                  {NARRATIVES.slice(0, 6).map((n, idx) => (
                    <td key={n.id} className="px-2.5 py-2.5 text-right text-[#8A96A8]">
                      {att.iBps[idx] !== undefined ? formatBpsPercent(att.iBps[idx]!, 1) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] ${
                        att.matchesMedian
                          ? "border-[#10B981]/35 bg-[#10B981]/10 text-[#10B981]"
                          : "border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]"
                      }`}
                    >
                      {att.matchesMedian ? "≤100 BPS OK" : "DEVIATED"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#556173]">
                    {formatRelativeTime(att.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disputes Section */}
      <div className="panel-surface rounded-md p-4">
        <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
          Disputes for Epoch #{detail.epoch.epochId} ({detail.disputes.length})
        </h2>
        {detail.disputes.length === 0 ? (
          <p className="mt-2 font-mono text-xs text-[#556173]">
            Zero disputes opened for this epoch. Max 1 dispute per epoch prevents infinite finalization griefing.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#1B2028] font-mono text-xs">
            {detail.disputes.map((d) => (
              <div key={d.disputeId} className="flex flex-wrap justify-between gap-2 py-2.5">
                <div>
                  <span className="text-[#EF4444]">DISPUTE #{d.disputeId}</span> · Narrative #
                  {d.narrativeId} · Claimed I_n {d.claimedIBps} bps · Challenger{" "}
                  {truncateHex(d.challenger, 6, 4)}
                </div>
                <span className="uppercase text-[#F59E0B]">{d.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {txErr && (
        <div className="rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 font-mono text-xs text-[#EF4444]">
          {txErr}
        </div>
      )}
      {txMsg && (
        <div className="rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-xs text-[#10B981]">
          {txMsg}
        </div>
      )}

      {/* Open Dispute Modal */}
      {disputeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel-surface w-full max-w-md rounded-md p-4">
            <div className="flex items-center justify-between border-b border-[#1B2028] pb-3">
              <h3 className="font-display text-sm font-semibold text-[#EF4444]">
                Open Oracle Dispute · Epoch #{detail.epoch.epochId}
              </h3>
              <button
                type="button"
                onClick={() => setDisputeModalOpen(false)}
                className="rounded border border-[#1B2028] px-2 py-0.5 font-mono text-xs text-[#8A96A8]"
              >
                ESC
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-[#8A96A8]">
              Locks 50,000 $NTI bond. If validators recompute &gt;100 bps deviation for this narrative, bond returns + slashing reward; otherwise 50% is burned and 50% goes to responding validators.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="font-mono text-[10px] text-[#8A96A8]">DISPUTED NARRATIVE</label>
                <select
                  value={disputeNarrativeId}
                  onChange={(e) => setDisputeNarrativeId(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-xs text-[#EDF1F7]"
                >
                  {NARRATIVES.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{n.id} {n.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-mono text-[10px] text-[#8A96A8]">
                  CLAIMED TRUE I_n (0..10000 BPS)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={claimedIBps}
                  onChange={(e) => setClaimedIBps(e.target.value)}
                  className="mt-1 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-xs text-[#EDF1F7]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-[#8A96A8]">
                  EVIDENCE HASH OR ARWEAVE / REPLAY NOTE
                </label>
                <input
                  type="text"
                  placeholder="0x... or Arweave replay URI"
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  className="mt-1 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-xs text-[#EDF1F7]"
                />
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void handleOpenDispute()}
                className="w-full rounded border border-[#EF4444]/50 bg-[#EF4444]/15 py-2.5 font-mono text-xs font-semibold text-[#EF4444] hover:bg-[#EF4444]/25 disabled:opacity-50"
              >
                LOCK 50,000 $NTI &amp; OPEN DISPUTE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
