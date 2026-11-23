"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther, keccak256, stringToBytes } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { TxStatusBanner } from "@/components/TxStatusBanner";
import { ModalShell } from "@/components/ui/ModalShell";
import { EpochTimeline, ValidatorSpread } from "@/components/ui/Visuals";
import { NARRATIVES, NARRATIVE_BY_ID } from "@nti/sdk";
import {
  disputeAbi,
  erc20Abi,
  getActiveChainId,
  getProtocolAddresses,
  oracleCommitAbi,
} from "@/lib/contracts";
import { formatBpsPercent, formatCompactNumber, formatRelativeTime, truncateHex } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import type { EpochDetailResponse, EpochSummary } from "@/lib/types";

interface OracleClientProps {
  initial: EpochDetailResponse;
}

type PopulatedEpoch = EpochDetailResponse & { epoch: EpochSummary };

const RANK: Record<string, number> = {
  collecting: 0,
  computed: 1,
  committed: 2,
  disputed: 3,
  final: 4,
  incomplete: -1,
};

function formatWindow(seconds: bigint | undefined): string {
  if (seconds === undefined) return "Contract-defined";
  if (seconds % 3600n === 0n) return `${seconds / 3600n}h`;
  if (seconds % 60n === 0n) return `${seconds / 60n}m`;
  return `${seconds}s`;
}

const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;

export function OracleClient({ initial }: OracleClientProps) {
  const epoch = initial.epoch;
  if (!epoch) {
    return (
      <section className="border border-[#26262A] bg-[#161618] p-4">
        <h1 className="text-lg font-semibold text-[#F5F5F7]">Oracle</h1>
        <p role="status" className="mt-2 text-xs text-[#A1A1AA]">
          {initial.dataSource === "unavailable" ? "Epoch data is temporarily unavailable." : "No oracle epochs have been indexed yet."}
        </p>
      </section>
    );
  }
  return <OracleEpoch initial={{ ...initial, epoch }} />;
}

function OracleEpoch({ initial }: { initial: PopulatedEpoch }) {
  const [detail, setDetail] = useState<PopulatedEpoch>(initial);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [detail.epoch.epochId]);
  const [loadingEpochId, setLoadingEpochId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeNarrativeId, setDisputeNarrativeId] = useState<number>(1);
  const [claimedIBps, setClaimedIBps] = useState<string>("1500");
  const [evidenceNote, setEvidenceNote] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const addrs = getProtocolAddresses(activeChainId);

  const { data: disputeWindow } = useReadContract({
    address: addrs.oracleCommit ?? undefined,
    abi: oracleCommitAbi,
    functionName: "DISPUTE_WINDOW",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.oracleCommit) },
  });
  const { data: minValidators } = useReadContract({
    address: addrs.oracleCommit ?? undefined,
    abi: oracleCommitAbi,
    functionName: "MIN_VALIDATORS",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.oracleCommit) },
  });
  const { data: resolutionWindow } = useReadContract({
    address: addrs.dispute ?? undefined,
    abi: disputeAbi,
    functionName: "RESOLUTION_WINDOW",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.dispute) },
  });

  const { data: disputeBondWei } = useReadContract({
    address: addrs.dispute ?? undefined,
    abi: disputeAbi,
    functionName: "disputeBond",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.dispute) },
  });

  const { data: ntiBalanceWei, refetch: refetchBalance } = useReadContract({
    address: addrs.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address && addrs.ntiToken) },
  });

  const { data: ntiAllowanceWei, refetch: refetchAllowance } = useReadContract({
    address: addrs.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && addrs.dispute ? [address, addrs.dispute] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address && addrs.ntiToken && addrs.dispute) },
  });

  const loadEpoch = useCallback(async (epochId: number) => {
    setLoadingEpochId(epochId);
    setLoadError(null);
    try {
      const res = await fetch(`/api/epochs/${epochId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch epoch #${epochId} (HTTP ${res.status})`);
      }
      const next = (await res.json()) as EpochDetailResponse;
      if (!next.epoch) throw new Error(`No indexed detail for epoch #${epochId}.`);
      setDetail({ ...next, epoch: next.epoch });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load epoch detail.");
    } finally {
      setLoadingEpochId(null);
    }
  }, []);

  const { txState, isBusy, wrongChain, targetChainId, explorerBase, execute, resetTx } =
    useChainAction(async () => {
      await Promise.all([refetchBalance(), refetchAllowance(), loadEpoch(detail.epoch.epochId)]);
    });

  const bondWei = disputeBondWei ?? 0n;
  const bondNti = Number(formatEther(bondWei));
  const balanceWei = (ntiBalanceWei as bigint | undefined) ?? 0n;
  const allowanceWei = (ntiAllowanceWei as bigint | undefined) ?? 0n;

  const hasEnoughBalance = balanceWei >= bondWei;
  const needsApproval = allowanceWei < bondWei;

  const activeRank = RANK[detail.epoch.status] ?? 0;
  const committedAt = detail.epoch.committedAt ? Date.parse(detail.epoch.committedAt) : null;
  const windowEnd = committedAt !== null && disputeWindow !== undefined
    ? committedAt + Number(disputeWindow) * 1000
    : null;
  const committed = detail.epoch.status === "committed";
  const canFinalize = committed && (windowEnd === null || now >= windowEnd);
  const canDispute = committed && disputeBondWei !== undefined && (windowEnd === null || now < windowEnd);
  const lifecycleSteps = [
    { key: "collecting", caption: "Ingestion", title: "Ingest & Filter" },
    { key: "computed", caption: "Scoring", title: "Deterministic Score" },
    { key: "committed", caption: minValidators ? `Minimum ${minValidators} validators` : "EIP-712", title: "Validator Commit" },
    { key: "disputed", caption: formatWindow(disputeWindow), title: "Bonded Challenge Window" },
    { key: "final", caption: "After challenge window", title: "Finalized On-Chain" },
  ];

  async function handleFinalize() {
    setValidationError(null);
    if (!addrs.oracleCommit) {
      setValidationError("OracleCommit contract address is not configured.");
      return;
    }
    if (!canFinalize) {
      setValidationError(
        `Epoch #${detail.epoch.epochId} must be in 'committed' status to finalize (current: ${detail.epoch.status}).`,
      );
      return;
    }
    await execute(
      `Finalize Epoch #${detail.epoch.epochId}`,
      {
        address: addrs.oracleCommit,
        abi: oracleCommitAbi,
        functionName: "finalize",
        args: [detail.epoch.epochId],
      },
      `Epoch #${detail.epoch.epochId} finalized on-chain.`,
    );
  }

  async function handleApproveBond() {
    setValidationError(null);
    if (!addrs.ntiToken || !addrs.dispute) {
      setValidationError("Token or Dispute contract address is not configured.");
      return;
    }
    await execute(
      `Approve ${formatCompactNumber(bondNti)} $NTI bond`,
      {
        address: addrs.ntiToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [addrs.dispute, bondWei],
      },
      `Approved ${formatCompactNumber(bondNti)} $NTI for Dispute contract.`,
    );
  }

  async function handleOpenDispute() {
    setValidationError(null);
    if (!addrs.dispute) {
      setValidationError("Dispute contract address is not configured.");
      return;
    }
    if (!canDispute) {
      setValidationError(
        `Disputes can only be opened during the 'committed' dispute window (current: ${detail.epoch.status}).`,
      );
      return;
    }
    if (!hasEnoughBalance) {
      setValidationError(
        `Insufficient $NTI balance (${formatCompactNumber(Math.floor(Number(formatEther(balanceWei))))} / ${formatCompactNumber(bondNti)} $NTI required).`,
      );
      return;
    }
    if (needsApproval) {
      setValidationError("Approve the $NTI dispute bond first.");
      return;
    }

    const iVal = Number(claimedIBps);
    if (!Number.isInteger(iVal) || iVal < 0 || iVal > 10000) {
      setValidationError("Claimed I_n must be an integer between 0 and 10000 bps.");
      return;
    }

    const trimmedEvidence = evidenceNote.trim();
    if (!trimmedEvidence) {
      setValidationError("Provide a 32-byte 0x hash or Arweave/replay evidence note.");
      return;
    }
    if (trimmedEvidence.startsWith("0x") && !BYTES32_HEX_RE.test(trimmedEvidence)) {
      setValidationError("Hex evidence hash must be exactly 66 characters (0x + 64 hex chars).");
      return;
    }

    const evidenceHash = BYTES32_HEX_RE.test(trimmedEvidence)
      ? (trimmedEvidence as `0x${string}`)
      : keccak256(stringToBytes(trimmedEvidence));

    const hash = await execute(
      `Open dispute on Epoch #${detail.epoch.epochId}`,
      {
        address: addrs.dispute,
        abi: disputeAbi,
        functionName: "openDispute",
        args: [detail.epoch.epochId, disputeNarrativeId, iVal, evidenceHash],
      },
      `Dispute opened for Epoch #${detail.epoch.epochId}.`,
    );

    if (hash) {
      setDisputeModalOpen(false);
      setEvidenceNote("");
    }
  }

  async function handleExpireDispute(disputeId: number) {
    setValidationError(null);
    if (!addrs.dispute) {
      setValidationError("Dispute contract address is not configured.");
      return;
    }
    await execute(
      `Expire Dispute #${disputeId}`,
      {
        address: addrs.dispute,
        abi: disputeAbi,
        functionName: "expire",
        args: [BigInt(disputeId)],
      },
      `Dispute #${disputeId} expired on-chain.`,
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#26262A] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
              Optimistic Attestation &amp; Provenance
            </span>
            {detail.dataSource === "unavailable" && (
              <span className="border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                PARTIAL INDEXER DATA
              </span>
            )}
            {wrongChain && (
              <span className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                AUTO-SWITCHES TO CHAIN {targetChainId} ON TX
              </span>
            )}
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
            Oracle · Epoch #{detail.epoch.epochId}
          </h1>
          <p className="mt-1 text-xs text-[#71717A]">
            Deterministic dataset snapshots with EIP-712 validator attestations and a bonded challenge window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            type="button"
            disabled={isBusy || !isConnected || !canDispute}
            onClick={() => {
              setValidationError(null);
              setDisputeModalOpen(true);
            }}
            className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-1.5 font-medium text-[#EF4444] transition-colors hover:bg-[#EF4444]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            OPEN DISPUTE{disputeBondWei !== undefined && ` (${formatCompactNumber(bondNti)} $NTI)`}
          </button>
          <button
            type="button"
            disabled={isBusy || !isConnected || !canFinalize}
            onClick={() => void handleFinalize()}
            className="border border-[#CCFF00]/40 bg-[#CCFF00]/12 px-3 py-1.5 font-medium text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-40"
          >
            FINALIZE EPOCH
          </button>
        </div>
      </div>

      {/* Epoch Switcher */}
      <EpochTimeline
        epochs={detail.recentEpochs}
        activeId={detail.epoch.epochId}
        loadingId={loadingEpochId}
        onSelect={(id) => void loadEpoch(id)}
      />
      <ValidatorSpread attestations={detail.attestations} />

      {loadError && (
        <div className="flex items-center justify-between border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadEpoch(detail.epoch.epochId)}
            className="font-mono text-[11px] underline hover:text-white"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Lifecycle Timeline */}
      <div className="border border-[#26262A] bg-[#161618] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[#F5F5F7]">Epoch State Machine</div>
          <div className="font-mono text-[11px] text-[#71717A]">
            Status:{" "}
            <span
              className={
                detail.epoch.status === "final"
                  ? "text-[#4ADE80]"
                  : detail.epoch.status === "disputed"
                    ? "text-[#EF4444]"
                    : detail.epoch.status === "incomplete"
                      ? "text-[#F59E0B]"
                      : "text-[#CCFF00]"
              }
            >
              {detail.epoch.status.toUpperCase()}
            </span>{" "}
            · Series #{detail.epoch.seriesId}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {lifecycleSteps.map((step, i) => {
            const reached = i <= activeRank;
            const current = step.key === detail.epoch.status;
            return (
              <div
                key={step.key}
                className={`border p-3 font-mono ${
                  current
                    ? "border-[#CCFF00]/60 bg-[#CCFF00]/10"
                    : reached
                      ? "border-[#4ADE80]/35 bg-[#4ADE80]/8"
                      : "border-[#26262A] bg-[#111113]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#71717A]">{step.caption}</span>
                  <span
                    className={
                      current
                        ? "text-[#CCFF00]"
                        : reached
                          ? "text-[#4ADE80]"
                          : "text-[#52525B]"
                    }
                  >
                    {current ? "ACTIVE" : reached ? "DONE" : "QUEUED"}
                  </span>
                </div>
                <div className="mt-1.5 font-sans text-xs font-semibold text-[#F5F5F7]">
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cryptographic Hashes & Arweave Provenance */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#26262A] pt-4 font-mono text-xs md:grid-cols-3">
          <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Dataset Hash (keccak256)
            </div>
            <div className="mt-1 break-all text-[11px] text-[#F5F5F7]">
              {detail.epoch.datasetHash ?? "Pending snapshot"}
            </div>
          </div>
          <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Config Hash (ConfigRegistry)
            </div>
            <div className="mt-1 break-all text-[11px] text-[#F5F5F7]">
              {detail.epoch.configHash ?? "Pending"}
            </div>
          </div>
          <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Public Dataset Snapshot
            </div>
            <div className="mt-1 truncate text-[11px] text-[#CCFF00]">
              {detail.epoch.datasetUrl ? (
                <a
                  href={detail.epoch.datasetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Download archive
                </a>
              ) : (
                <span className="text-[#71717A]">Public archive unavailable</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validator Attestation Matrix */}
      <div className="border border-[#26262A] bg-[#161618]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262A] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Validator Attestations ({detail.attestations.length} indexed)
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A]">
              Each index vector is compared with the indexed epoch values.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#26262A] bg-[#111113] font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                <th className="px-4 py-2.5">Validator</th>
                {NARRATIVES.map((n) => (
                  <th key={n.id} className="px-2.5 py-2.5 text-right">
                    {n.slug.slice(0, 6)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right">Delta Check</th>
                <th className="px-4 py-2.5 text-right">Signed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F23] font-mono tabular-nums">
              {detail.attestations.length === 0 ? (
                <tr>
                  <td
                    colSpan={NARRATIVES.length + 3}
                    className="px-4 py-6 text-center font-sans text-xs text-[#71717A]"
                  >
                    No validator attestations indexed for Epoch #{detail.epoch.epochId} yet.
                  </td>
                </tr>
              ) : (
                detail.attestations.map((att) => (
                  <tr key={att.validator} className="transition-colors hover:bg-[#111113]/60">
                    <td className="px-4 py-2.5 text-[#F5F5F7]">
                      {truncateHex(att.validator, 8, 6)}
                    </td>
                    {NARRATIVES.map((n, idx) => (
                      <td key={n.id} className="px-2.5 py-2.5 text-right text-[#71717A]">
                        {att.iBps[idx] !== undefined ? formatBpsPercent(att.iBps[idx]!, 1) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`border px-2 py-0.5 text-[10px] ${
                          att.matchesMedian === null
                            ? "border-[#26262A] text-[#71717A]"
                            : att.matchesMedian
                              ? "border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]"
                              : "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                        }`}
                      >
                        {att.matchesMedian === null ? "Unavailable" : att.matchesMedian ? "Equal" : "Different"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#71717A]">
                      {formatRelativeTime(att.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disputes Section */}
      <div className="border border-[#26262A] bg-[#161618] p-4">
        <h2 className="text-sm font-semibold text-[#F5F5F7]">
          Disputes for Epoch #{detail.epoch.epochId} ({detail.disputes.length})
        </h2>
        {detail.disputes.length === 0 ? (
          <p className="mt-2 text-xs text-[#71717A]">
            No disputes indexed for this epoch.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#1F1F23] font-mono text-xs">
            {detail.disputes.map((d) => {
              const nar = NARRATIVE_BY_ID.get(d.narrativeId);
              const isOpen = d.status.toLowerCase() === "open";
              const canExpire = resolutionWindow === undefined ||
                now >= Date.parse(d.openedAt) + Number(resolutionWindow) * 1000;
              return (
                <div key={d.disputeId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="text-[#71717A]">
                    <span className="text-[#EF4444]">DISPUTE #{d.disputeId}</span> ·{" "}
                    {nar?.label ?? `Narrative #${d.narrativeId}`} · Claimed I_n{" "}
                    <span className="text-[#F5F5F7]">{d.claimedIBps} bps</span> · Challenger{" "}
                    {truncateHex(d.challenger, 6, 4)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="uppercase text-[#F59E0B]">{d.status}</span>
                    {isOpen && (
                      <button
                        type="button"
                        disabled={isBusy || !isConnected || !canExpire}
                        onClick={() => void handleExpireDispute(d.disputeId)}
                        className="border border-[#26262A] bg-[#111113] px-2 py-1 text-[10px] text-[#F5F5F7] hover:border-[#F59E0B]/50 disabled:opacity-40"
                      >
                        EXPIRE AFTER {formatWindow(resolutionWindow)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {validationError && !disputeModalOpen && (
        <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
          {validationError}
        </div>
      )}

      {!disputeModalOpen && (
        <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
      )}

      {/* Open Dispute Modal */}
      <ModalShell
        open={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        canClose={!isBusy}
        labelledBy="nti-dispute-modal-title"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 border-b border-[#26262A] pb-3">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#EF4444]">
                ORACLE CHALLENGE
              </span>
              <h3 id="nti-dispute-modal-title" className="mt-0.5 text-sm font-semibold text-[#F5F5F7]">
                Open Oracle Dispute · Epoch #{detail.epoch.epochId}
              </h3>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setDisputeModalOpen(false)}
              aria-label="Close dispute modal"
              className="shrink-0 cursor-pointer border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA] transition-colors hover:border-[#3A3A40] hover:text-[#F5F5F7] disabled:opacity-40"
            >
              ESC
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#A1A1AA]">
            Locks {formatCompactNumber(bondNti)} $NTI bond. If validators confirm &gt;100 bps deviation, bond returns plus slashing reward; otherwise 50% is burned and 50% goes to validators.
          </p>

          {/* Bond Balance & Allowance Check */}
          <div className="mt-3 border border-[#26262A] bg-[#0D0D0E] p-3 font-mono text-[11px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-[#71717A]">$NTI Balance</span>
              <span className={hasEnoughBalance ? "text-[#4ADE80]" : "text-[#EF4444]"}>
                {isConnected
                  ? `${formatCompactNumber(Math.floor(Number(formatEther(balanceWei))))} / ${formatCompactNumber(bondNti)} $NTI`
                  : "Not connected"}
              </span>
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-[#71717A]">Dispute Allowance</span>
              <span className={!needsApproval ? "text-[#4ADE80]" : "text-[#F59E0B]"}>
                {needsApproval ? "Approval required" : "Approved"}
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Disputed Narrative
              </label>
              <select
                value={disputeNarrativeId}
                onChange={(e) => setDisputeNarrativeId(Number(e.target.value))}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] focus:border-[#CCFF00] focus:outline-none"
              >
                {NARRATIVES.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.id} {n.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Claimed True I_n (0..10000 bps)
              </label>
              <input
                type="number"
                min="0"
                max="10000"
                value={claimedIBps}
                onChange={(e) => setClaimedIBps(e.target.value)}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] focus:border-[#CCFF00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Evidence Hash (0x + 64 hex) or Replay URI
              </label>
              <input
                type="text"
                placeholder="0x... or Arweave replay URI"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] placeholder-[#52525B] focus:border-[#CCFF00] focus:outline-none"
              />
            </div>

            {validationError && (
              <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
                {validationError}
              </div>
            )}

            <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />

            {needsApproval ? (
              <button
                type="button"
                disabled={isBusy || !isConnected || !hasEnoughBalance}
                onClick={() => void handleApproveBond()}
                className="w-full cursor-pointer bg-[#CCFF00] py-2.5 font-mono text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#B8E600] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {!isConnected
                  ? "CONNECT WALLET TO APPROVE"
                  : !hasEnoughBalance
                    ? `NEED ${formatCompactNumber(bondNti)} $NTI`
                    : `1. APPROVE ${formatCompactNumber(bondNti)} $NTI BOND`}
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy || !isConnected || !hasEnoughBalance}
                onClick={() => void handleOpenDispute()}
                className="w-full cursor-pointer border border-[#EF4444]/50 bg-[#EF4444]/15 py-2.5 font-mono text-xs font-semibold text-[#EF4444] transition-colors hover:bg-[#EF4444]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                2. LOCK {formatCompactNumber(bondNti)} $NTI &amp; OPEN DISPUTE
              </button>
            )}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
