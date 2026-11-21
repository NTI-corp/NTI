"use client";

import { useCallback, useState } from "react";
import { formatEther, keccak256, stringToBytes } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { TxStatusBanner } from "@/components/TxStatusBanner";
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
import type { EpochDetailResponse } from "@/lib/types";

interface OracleClientProps {
  initial: EpochDetailResponse;
}

const LIFECYCLE_STEPS = [
  { key: "collecting", offset: "T+00m", title: "Ingest & Filter" },
  { key: "computed", offset: "T+02m", title: "Deterministic Score" },
  { key: "committed", offset: "T+04m", title: "2-of-3 EIP-712 Commit" },
  { key: "disputed", offset: "0..2h", title: "Dispute Window" },
  { key: "final", offset: "T+2h05m", title: "Final On-Chain Root" },
] as const;

const RANK: Record<string, number> = {
  collecting: 0,
  computed: 1,
  committed: 2,
  disputed: 3,
  final: 4,
  incomplete: 2,
};

const DEFAULT_BOND_WEI = 50_000n * 10n ** 18n;
const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;

export function OracleClient({ initial }: OracleClientProps) {
  const [detail, setDetail] = useState<EpochDetailResponse>(initial);
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
      setDetail(next);
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

  const bondWei = (disputeBondWei as bigint | undefined) ?? DEFAULT_BOND_WEI;
  const bondNti = Number(formatEther(bondWei));
  const balanceWei = (ntiBalanceWei as bigint | undefined) ?? 0n;
  const allowanceWei = (ntiAllowanceWei as bigint | undefined) ?? 0n;

  const hasEnoughBalance = balanceWei >= bondWei;
  const needsApproval = allowanceWei < bondWei;

  const activeRank = RANK[detail.epoch.status] ?? 0;
  const canFinalize = detail.epoch.status === "committed";
  const canDispute = detail.epoch.status === "committed";

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
      `Dispute #${disputeId} expired after 6h resolution window.`,
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#232325] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
              Optimistic Attestation &amp; Provenance
            </span>
            {detail.dataSource === "preview" && (
              <span className="rounded border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                PREVIEW DATA
              </span>
            )}
            {wrongChain && (
              <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                AUTO-SWITCHES TO CHAIN {targetChainId} ON TX
              </span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            Oracle · Epoch #{detail.epoch.epochId}
          </h1>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Deterministic dataset snapshot, 2-of-3 validator EIP-712 median commit, and 2h bonded dispute window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            type="button"
            disabled={isBusy || !canDispute}
            onClick={() => {
              setValidationError(null);
              setDisputeModalOpen(true);
            }}
            className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-1.5 font-medium text-[#F87171] transition-colors hover:bg-[#EF4444]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            OPEN DISPUTE ({formatCompactNumber(bondNti)} $NTI)
          </button>
          <button
            type="button"
            disabled={isBusy || !canFinalize}
            onClick={() => void handleFinalize()}
            className="rounded-md border border-[#CCFF00]/40 bg-[#CCFF00]/12 px-3 py-1.5 font-medium text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-40"
          >
            FINALIZE EPOCH
          </button>
        </div>
      </div>

      {/* Epoch Switcher */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-[#71717A]">
          Recent Epochs:
        </span>
        {detail.recentEpochs.map((ep) => {
          const active = ep.epochId === detail.epoch.epochId;
          return (
            <button
              key={ep.epochId}
              type="button"
              disabled={loadingEpochId === ep.epochId}
              onClick={() => void loadEpoch(ep.epochId)}
              className={`rounded-md border px-2.5 py-1 transition-colors tabular-nums ${
                active
                  ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F4F4F5]"
                  : "border-[#232325] bg-[#0E0E0F] text-[#A1A1AA] hover:border-[#3A3A3D] hover:text-[#F4F4F5]"
              }`}
            >
              #{ep.epochId} · {ep.status.toUpperCase()}
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="flex items-center justify-between rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
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
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[#F4F4F5]">Epoch State Machine</div>
          <div className="font-mono text-[11px] text-[#A1A1AA]">
            Status:{" "}
            <span
              className={
                detail.epoch.status === "final"
                  ? "text-[#22C55E]"
                  : detail.epoch.status === "disputed"
                    ? "text-[#F87171]"
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
          {LIFECYCLE_STEPS.map((step, i) => {
            const reached = i <= activeRank;
            const current = step.key === detail.epoch.status;
            return (
              <div
                key={step.key}
                className={`rounded-md border p-3 font-mono ${
                  current
                    ? "border-[#CCFF00]/60 bg-[#CCFF00]/10"
                    : reached
                      ? "border-[#22C55E]/35 bg-[#22C55E]/8"
                      : "border-[#232325] bg-[#131314]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#71717A]">{step.offset}</span>
                  <span
                    className={
                      current
                        ? "text-[#CCFF00]"
                        : reached
                          ? "text-[#22C55E]"
                          : "text-[#52525B]"
                    }
                  >
                    {current ? "ACTIVE" : reached ? "DONE" : "QUEUED"}
                  </span>
                </div>
                <div className="mt-1.5 font-sans text-xs font-semibold text-[#F4F4F5]">
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cryptographic Hashes & Arweave Provenance */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#232325] pt-4 font-mono text-xs md:grid-cols-3">
          <div className="rounded-md border border-[#232325] bg-[#090909] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Dataset Hash (keccak256)
            </div>
            <div className="mt-1 break-all text-[11px] text-[#F4F4F5]">
              {detail.epoch.datasetHash ?? "Pending snapshot"}
            </div>
          </div>
          <div className="rounded-md border border-[#232325] bg-[#090909] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Config Hash (ConfigRegistry)
            </div>
            <div className="mt-1 break-all text-[11px] text-[#F4F4F5]">
              {detail.epoch.configHash ?? "Pending"}
            </div>
          </div>
          <div className="rounded-md border border-[#232325] bg-[#090909] p-3">
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
                  {detail.epoch.arweaveTx} ↗
                </a>
              ) : (
                <span className="text-[#71717A]">Awaiting upload</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validator Attestation Matrix */}
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232325] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F4F4F5]">
              Validator EIP-712 Attestation Vectors ({detail.attestations.length} / 3 Quorum)
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              Median per narrative is committed on-chain; operator and validators must agree within ±100 bps.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232325] bg-[#131314] font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
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
            <tbody className="divide-y divide-[#232325] font-mono tabular-nums">
              {detail.attestations.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center font-sans text-xs text-[#71717A]"
                  >
                    No validator attestations indexed for Epoch #{detail.epoch.epochId} yet.
                  </td>
                </tr>
              ) : (
                detail.attestations.map((att) => (
                  <tr key={att.validator} className="transition-colors hover:bg-[#131314]/60">
                    <td className="px-4 py-2.5 text-[#F4F4F5]">
                      {truncateHex(att.validator, 8, 6)}
                    </td>
                    {NARRATIVES.slice(0, 6).map((n, idx) => (
                      <td key={n.id} className="px-2.5 py-2.5 text-right text-[#A1A1AA]">
                        {att.iBps[idx] !== undefined ? formatBpsPercent(att.iBps[idx]!, 1) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] ${
                          att.matchesMedian
                            ? "border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]"
                            : "border-[#EF4444]/35 bg-[#EF4444]/10 text-[#F87171]"
                        }`}
                      >
                        {att.matchesMedian ? "≤100 BPS OK" : "DEVIATED"}
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
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4">
        <h2 className="text-sm font-semibold text-[#F4F4F5]">
          Disputes for Epoch #{detail.epoch.epochId} ({detail.disputes.length})
        </h2>
        {detail.disputes.length === 0 ? (
          <p className="mt-2 text-xs text-[#71717A]">
            Zero disputes opened for this epoch. Max 1 dispute per epoch prevents finalization griefing.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#232325] font-mono text-xs">
            {detail.disputes.map((d) => {
              const nar = NARRATIVE_BY_ID.get(d.narrativeId);
              const isOpen = d.status.toLowerCase() === "open";
              return (
                <div key={d.disputeId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="text-[#A1A1AA]">
                    <span className="text-[#F87171]">DISPUTE #{d.disputeId}</span> ·{" "}
                    {nar?.label ?? `Narrative #${d.narrativeId}`} · Claimed I_n{" "}
                    <span className="text-[#F4F4F5]">{d.claimedIBps} bps</span> · Challenger{" "}
                    {truncateHex(d.challenger, 6, 4)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="uppercase text-[#F59E0B]">{d.status}</span>
                    {isOpen && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleExpireDispute(d.disputeId)}
                        className="rounded border border-[#232325] bg-[#131314] px-2 py-1 text-[10px] text-[#F4F4F5] hover:border-[#F59E0B]/50 disabled:opacity-40"
                      >
                        EXPIRE (6H)
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
        <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
          {validationError}
        </div>
      )}

      {!disputeModalOpen && (
        <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
      )}

      {/* Open Dispute Modal */}
      {disputeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232325] pb-3">
              <h3 className="text-sm font-semibold text-[#F87171]">
                Open Oracle Dispute · Epoch #{detail.epoch.epochId}
              </h3>
              <button
                type="button"
                onClick={() => setDisputeModalOpen(false)}
                className="rounded border border-[#232325] bg-[#131314] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] hover:text-[#F4F4F5]"
              >
                ESC
              </button>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[#A1A1AA]">
              Locks {formatCompactNumber(bondNti)} $NTI bond. If validators confirm &gt;100 bps deviation, bond returns plus slashing reward; otherwise 50% is burned and 50% goes to validators.
            </p>

            {/* Bond Balance & Allowance Check */}
            <div className="mt-3 rounded-md border border-[#232325] bg-[#131314] p-2.5 font-mono text-[11px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-[#71717A]">$NTI Balance</span>
                <span className={hasEnoughBalance ? "text-[#22C55E]" : "text-[#F87171]"}>
                  {isConnected
                    ? `${formatCompactNumber(Math.floor(Number(formatEther(balanceWei))))} / ${formatCompactNumber(bondNti)} $NTI`
                    : "Not connected"}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-[#71717A]">Dispute Allowance</span>
                <span className={!needsApproval ? "text-[#22C55E]" : "text-[#F59E0B]"}>
                  {needsApproval ? "Approval required" : "Approved"}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
                  Disputed Narrative
                </label>
                <select
                  value={disputeNarrativeId}
                  onChange={(e) => setDisputeNarrativeId(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-xs text-[#F4F4F5] focus:border-[#CCFF00] focus:outline-none"
                >
                  {NARRATIVES.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{n.id} {n.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
                  Claimed True I_n (0..10000 bps)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={claimedIBps}
                  onChange={(e) => setClaimedIBps(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-xs text-[#F4F4F5] focus:border-[#CCFF00] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
                  Evidence Hash (0x + 64 hex) or Replay URI
                </label>
                <input
                  type="text"
                  placeholder="0x... or Arweave replay URI"
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-xs text-[#F4F4F5] placeholder-[#52525B] focus:border-[#CCFF00] focus:outline-none"
                />
              </div>

              {validationError && (
                <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
                  {validationError}
                </div>
              )}

              <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />

              {needsApproval ? (
                <button
                  type="button"
                  disabled={isBusy || !isConnected || !hasEnoughBalance}
                  onClick={() => void handleApproveBond()}
                  className="w-full rounded-md bg-[#CCFF00] py-2.5 font-mono text-xs font-semibold text-black transition-colors hover:bg-[#B8E600] disabled:cursor-not-allowed disabled:opacity-45"
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
                  className="w-full rounded-md border border-[#EF4444]/50 bg-[#EF4444]/15 py-2.5 font-mono text-xs font-semibold text-[#F87171] transition-colors hover:bg-[#EF4444]/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  2. LOCK {formatCompactNumber(bondNti)} $NTI &amp; OPEN DISPUTE
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
