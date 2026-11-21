"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { BetModal } from "./BetModal";
import { TxStatusBanner } from "./TxStatusBanner";
import {
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
  oracleCommitAbi,
} from "@/lib/contracts";
import { NARRATIVES } from "@nti/sdk";
import { formatBpsPercent, formatCountdown, formatEth } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import type { MarketItem } from "@/lib/types";

interface MarketsListClientProps {
  markets: MarketItem[];
  awaitingDeployment: boolean;
  initialNarrativeId?: number | null;
  latestFinalEpoch?: number | null;
}

export function MarketsListClient({
  markets,
  awaitingDeployment,
  initialNarrativeId = null,
  latestFinalEpoch = null,
}: MarketsListClientProps) {
  const [filter, setFilter] = useState<"all" | "open" | "locked" | "settled">("all");
  const [narrativeFilter, setNarrativeFilter] = useState<number | null>(initialNarrativeId);
  const [activeBetMarket, setActiveBetMarket] = useState<{
    market: MarketItem;
    side: 0 | 1;
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newNarA, setNewNarA] = useState<number>(initialNarrativeId ?? 1);
  const [newNarB, setNewNarB] = useState<number>(initialNarrativeId === 2 ? 1 : 2);
  const [horizonEpochs, setHorizonEpochs] = useState<6 | 42>(6);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const addrs = getProtocolAddresses(activeChainId);

  const { data: onChainFinalEpoch } = useReadContract({
    address: addrs.oracleCommit ?? undefined,
    abi: oracleCommitAbi,
    functionName: "latestFinalEpoch",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.oracleCommit) },
  });

  const { txState, isBusy, explorerBase, execute, resetTx } = useChainAction();

  const liveFinalEpoch =
    onChainFinalEpoch !== undefined ? Number(onChainFinalEpoch) : (latestFinalEpoch ?? 0);

  const visible = useMemo(
    () =>
      markets.filter((m) => {
        if (filter !== "all" && m.status !== filter) return false;
        if (
          narrativeFilter !== null &&
          m.narrativeA !== narrativeFilter &&
          m.narrativeB !== narrativeFilter
        ) {
          return false;
        }
        return true;
      }),
    [markets, filter, narrativeFilter],
  );

  async function handleCreateMarket() {
    setCreateErr(null);
    if (!addrs.narrativeMarket) {
      setCreateErr("NarrativeMarket contract address is not configured.");
      return;
    }
    if (!isConnected) {
      setCreateErr("Connect your wallet in the top bar first.");
      return;
    }
    if (newNarA === newNarB) {
      setCreateErr("Narrative A and Narrative B must be different.");
      return;
    }
    if (liveFinalEpoch <= 0) {
      setCreateErr("Oracle has no finalized base epoch yet.");
      return;
    }

    const targetSettleEpoch = liveFinalEpoch + horizonEpochs;
    const hash = await execute(
      `Create market #${newNarA} vs #${newNarB} (settle E${targetSettleEpoch})`,
      {
        address: addrs.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: "createMarket",
        args: [newNarA, newNarB, targetSettleEpoch],
      },
      `Pair market created (settlement epoch #${targetSettleEpoch}).`,
    );

    if (hash) {
      setCreateOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW MARKETS</strong> · NarrativeMarket contract returned 0 markets. Showing parimutuel market structure with live contract hooks ready.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232325] pb-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
            Narrative Markets · Fixed-Horizon Parimutuel
          </span>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            Pair Markets
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
            Settled purely by finalized on-chain oracle index Δ = I_A(settle)/I_A(base) − I_B(settle)/I_B(base). Zero leverage, 5 ETH pool cap, 0.10% fee (up to 50% staker discount), full gross refund on tie or incomplete epoch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <div className="flex items-center rounded-md border border-[#232325] bg-[#0E0E0F] p-0.5">
            {(["all", "open", "locked", "settled"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded px-2.5 py-1 uppercase transition-colors ${
                  filter === tab
                    ? "bg-[#232325] text-[#F4F4F5]"
                    : "text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setCreateOpen((v) => !v);
              setCreateErr(null);
            }}
            className="rounded-md border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-3 py-1.5 font-semibold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22"
          >
            {createOpen ? "CLOSE CREATOR" : "+ CREATE MARKET"}
          </button>
        </div>
      </div>

      {/* Sector Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-[#71717A]">
          Sector:
        </span>
        <button
          type="button"
          onClick={() => setNarrativeFilter(null)}
          className={`rounded-md border px-2.5 py-1 transition-colors ${
            narrativeFilter === null
              ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F4F4F5]"
              : "border-[#232325] bg-[#0E0E0F] text-[#A1A1AA] hover:text-[#F4F4F5]"
          }`}
        >
          All ({markets.length})
        </button>
        {NARRATIVES.map((n) => {
          const active = narrativeFilter === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setNarrativeFilter(active ? null : n.id)}
              className={`rounded-md border px-2.5 py-1 transition-colors ${
                active
                  ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F4F4F5]"
                  : "border-[#232325] bg-[#0E0E0F] text-[#71717A] hover:border-[#3A3A3D] hover:text-[#F4F4F5]"
              }`}
            >
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Permissionless Market Creator */}
      {createOpen && (
        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232325] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F4F4F5]">
                Launch Permissionless Pair Market
              </h2>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                Anchored to latest finalized OracleCommit epoch #{liveFinalEpoch || "—"}. Anyone can open a 24H (6 epochs) or 7D (42 epochs) market.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Side A Narrative
              </label>
              <select
                value={newNarA}
                onChange={(e) => setNewNarA(Number(e.target.value))}
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
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Side B Counterparty
              </label>
              <select
                value={newNarB}
                onChange={(e) => setNewNarB(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-xs text-[#F4F4F5] focus:border-[#CCFF00] focus:outline-none"
              >
                <option value={0}>0 Market Average</option>
                {NARRATIVES.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.id} {n.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                Settlement Horizon
              </label>
              <select
                value={horizonEpochs}
                onChange={(e) => setHorizonEpochs(Number(e.target.value) === 42 ? 42 : 6)}
                className="mt-1 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-xs text-[#F4F4F5] focus:border-[#CCFF00] focus:outline-none"
              >
                <option value={6}>24H (6 epochs · E{liveFinalEpoch + 6})</option>
                <option value={42}>7D (42 epochs · E{liveFinalEpoch + 42})</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                disabled={isBusy || !isConnected || liveFinalEpoch <= 0}
                onClick={() => void handleCreateMarket()}
                className="w-full rounded-md bg-[#CCFF00] py-2 font-mono text-xs font-semibold text-black transition-colors hover:bg-[#B8E600] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {!isConnected ? "CONNECT WALLET" : "DEPLOY MARKET"}
              </button>
            </div>
          </div>

          {createErr && (
            <div className="mt-3 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
              {createErr}
            </div>
          )}
          <div className="mt-3">
            <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
          </div>
        </div>
      )}

      {/* Market Grid or Empty State */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-8 text-center">
          <div className="text-sm font-semibold text-[#F4F4F5]">
            No markets match the selected filter
          </div>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Try clearing the status or sector filter, or launch a new permissionless pair market above.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setNarrativeFilter(null);
            }}
            className="mt-3 rounded-md border border-[#232325] bg-[#131314] px-3 py-1.5 font-mono text-xs text-[#F4F4F5] hover:border-[#CCFF00]/50"
          >
            RESET FILTERS
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((m) => {
            const totalPool = m.poolAEth + m.poolBEth;
            const pctA = totalPool > 0 ? Math.round((m.poolAEth / totalPool) * 100) : 50;
            const pctB = 100 - pctA;
            const relA = m.baseIA > 0 ? m.currentIA / m.baseIA : 1;
            const relB = m.baseIB > 0 ? m.currentIB / m.baseIB : 1;
            const delta = relA - relB;

            return (
              <div
                key={m.marketId}
                className="flex flex-col justify-between rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 transition-colors hover:border-[#3A3A3D]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#71717A]">MKT #{m.marketId}</span>
                      <span className="rounded border border-[#232325] bg-[#131314] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                        {m.horizonLabel}
                      </span>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        m.status === "open"
                          ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
                          : m.status === "locked"
                            ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                            : "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>

                  <Link
                    href={`/markets/${m.marketId}`}
                    className="mt-2.5 block text-lg font-semibold text-[#F4F4F5] transition-colors hover:text-[#CCFF00]"
                  >
                    {m.narrativeALabel}{" "}
                    <span className="font-mono text-xs font-normal text-[#71717A]">vs</span>{" "}
                    {m.narrativeBLabel}
                  </Link>

                  {/* Live relative delta telemetry */}
                  <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <div className="text-[10px] text-[#71717A]">
                        SIDE A ({m.narrativeALabel.slice(0, 10)})
                      </div>
                      <div className="text-[#F4F4F5]">
                        {formatBpsPercent(m.baseIA, 1)} → {formatBpsPercent(m.currentIA, 1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#71717A]">
                        SIDE B ({m.narrativeBLabel.slice(0, 10)})
                      </div>
                      <div className="text-[#F4F4F5]">
                        {formatBpsPercent(m.baseIB, 1)} → {formatBpsPercent(m.currentIB, 1)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#71717A]">LIVE Δ LEAD</div>
                      <div
                        className={
                          delta > 0
                            ? "font-semibold text-[#22C55E]"
                            : delta < 0
                              ? "font-semibold text-[#CCFF00]"
                              : "text-[#A1A1AA]"
                        }
                      >
                        {delta >= 0 ? "+" : ""}
                        {(delta * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Pool Split Bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between font-mono text-[11px] tabular-nums">
                      <span className="text-[#22C55E]">
                        A: {formatEth(m.poolAEth, 3)} ({pctA}%)
                      </span>
                      <span className="text-[#71717A]">
                        TOTAL {formatEth(totalPool, 3)} / {m.maxPoolEth} ETH CAP
                      </span>
                      <span className="text-[#CCFF00]">
                        B: {formatEth(m.poolBEth, 3)} ({pctB}%)
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#232325]">
                      <div className="bg-[#22C55E]" style={{ width: `${pctA}%` }} />
                      <div className="bg-[#CCFF00]" style={{ width: `${pctB}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#232325] pt-3 font-mono text-[11px]">
                  <span className="text-[#A1A1AA] tabular-nums">
                    {m.status === "open"
                      ? `Cutoff in ${formatCountdown(m.cutoffAt)} · Settle E${m.settleEpoch}`
                      : m.status === "locked"
                        ? `Betting closed · Settles in ${formatCountdown(m.settleAt)}`
                        : `Settled · Outcome: ${m.outcome ?? "refund"}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {m.status === "open" && (
                      <button
                        type="button"
                        onClick={() => setActiveBetMarket({ market: m, side: 0 })}
                        className="rounded-md bg-[#22C55E] px-3 py-1.5 text-[11px] font-semibold text-[#090909] transition-colors hover:bg-[#16A34A]"
                      >
                        BET NOW
                      </button>
                    )}
                    <Link
                      href={`/markets/${m.marketId}`}
                      className="rounded-md border border-[#232325] bg-[#131314] px-3 py-1.5 text-[11px] text-[#F4F4F5] transition-colors hover:border-[#CCFF00]/50"
                    >
                      DETAIL →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeBetMarket && (
        <BetModal
          market={activeBetMarket.market}
          initialSide={activeBetMarket.side}
          onClose={() => setActiveBetMarket(null)}
        />
      )}
    </div>
  );
}
