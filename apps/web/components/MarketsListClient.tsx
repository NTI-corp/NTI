"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { Swords } from "lucide-react";
import { EmptyState } from "@/components/ui/Visuals";
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
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

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
  const [longHorizon, setLongHorizon] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const addrs = getProtocolAddresses(activeChainId);

  const { data: onChainFinalEpoch, refetch: refetchFinalEpoch } = useReadContract({
    address: addrs.oracleCommit ?? undefined,
    abi: oracleCommitAbi,
    functionName: "latestFinalEpoch",
    chainId: activeChainId,
    query: { enabled: Boolean(addrs.oracleCommit) },
  });

  const { data: shortEpochs } = useReadContract({
    address: addrs.narrativeMarket ?? undefined, abi: narrativeMarketAbi, functionName: "HORIZON_SHORT",
    chainId: activeChainId, query: { enabled: Boolean(addrs.narrativeMarket) },
  });
  const { data: longEpochs } = useReadContract({
    address: addrs.narrativeMarket ?? undefined, abi: narrativeMarketAbi, functionName: "HORIZON_LONG",
    chainId: activeChainId, query: { enabled: Boolean(addrs.narrativeMarket) },
  });
  const horizonEpochs = longHorizon ? longEpochs : shortEpochs;

  const router = useRouter();
  // A new market only shows up once the page is read again; reload the server data after the transaction
  // confirms (twice, because the RPC node can lag a block behind the receipt).
  const { txState, isBusy, explorerBase, execute, resetTx } = useChainAction(() => {
    router.refresh();
    setTimeout(() => router.refresh(), 4_000);
  });

  const liveFinalEpoch =
    onChainFinalEpoch !== undefined ? Number(onChainFinalEpoch) : (latestFinalEpoch ?? 0);

  const visible = useMemo(
    () =>
      markets.filter((m) => {
        if (filter !== "all" && (filter === "settled" ? !["settled", "refunded"].includes(m.status) : m.status !== filter)) return false;
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

    if (!horizonEpochs) {
      setCreateErr("Market horizons are temporarily unavailable.");
      return;
    }
    const latest = await refetchFinalEpoch();
    if (latest.isError || !latest.data) {
      setCreateErr("Could not verify the latest finalized epoch on-chain.");
      return;
    }
    const targetSettleEpoch = latest.data + horizonEpochs;
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
    <div className="space-y-4">
      {awaitingDeployment && (
        <div className="border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>MARKET DATA UNAVAILABLE</strong>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-5 border border-[#303327] bg-[#151712] px-5 py-6 sm:px-7">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
            Narrative Markets · Fixed-Horizon Parimutuel
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#F5F5F7] sm:text-4xl">
            Pair markets<span className="text-[#CCFF00]">.</span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#71717A]">
            Settled from finalized on-chain oracle indexes. Zero leverage; gross refunds on ties or invalid settlement epochs.
            {markets[0] && ` Pool cap ${markets[0].maxPoolEth} ETH · fee ${(markets[0].feeBps / 100).toFixed(3)}% · cutoff ${markets[0].cutoffEpochs} epochs before settlement.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <SegmentedTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "ALL" },
              { value: "open", label: "OPEN", tone: "green" },
              { value: "locked", label: "LOCKED", tone: "amber" },
              { value: "settled", label: "SETTLED", tone: "lime" },
            ]}
            className="text-[11px]"
            buttonClassName="px-2.5 py-1 uppercase"
          />

          <button
            type="button"
            onClick={() => {
              setCreateOpen((v) => !v);
              setCreateErr(null);
            }}
            className="border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-3 py-1.5 font-semibold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22"
          >
            {createOpen ? "CLOSE CREATOR" : "+ CREATE MARKET"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 border border-[#262a22] bg-[#11130f] font-mono sm:grid-cols-4">
        {[
          ["Recent markets (up to 30)", markets.length],
          ["Open", markets.filter((m) => m.status === "open").length],
          ["Betting closed", markets.filter((m) => m.status === "locked").length],
          ["Finalized / refunded", markets.filter((m) => m.status === "settled" || m.status === "refunded").length],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-b border-[#262a22] px-4 py-3 last:border-r-0 sm:border-b-0">
            <div className="text-[10px] uppercase tracking-wider text-[#8a9080]">{label}</div>
            <div className="mt-1 text-xl tabular-nums text-[#f5f5f7]">{awaitingDeployment ? "—" : value}</div>
          </div>
        ))}
      </div>

      {/* Sector Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-[#71717A]">
          Sector:
        </span>
        <button
          type="button"
          onClick={() => setNarrativeFilter(null)}
          className={`border px-2.5 py-1 transition-colors ${
            narrativeFilter === null
              ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
              : "border-[#26262A] bg-[#161618] text-[#71717A] hover:text-[#F5F5F7]"
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
              className={`border px-2.5 py-1 transition-colors ${
                active
                  ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
                  : "border-[#26262A] bg-[#161618] text-[#71717A] hover:border-[#3A3A40] hover:text-[#F5F5F7]"
              }`}
            >
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Permissionless Market Creator */}
      {createOpen && (
        <div className="drawer-enter border border-[#26262A] bg-[#161618] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262A] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                Launch Permissionless Pair Market
              </h2>
              <p className="mt-0.5 text-xs text-[#71717A]">
                Anchored to latest finalized OracleCommit epoch #{liveFinalEpoch || "—"}. Choose one of the on-chain settlement horizons.
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
                Side B Counterparty
              </label>
              <select
                value={newNarB}
                onChange={(e) => setNewNarB(Number(e.target.value))}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] focus:border-[#CCFF00] focus:outline-none"
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
                value={longHorizon ? "long" : "short"}
                onChange={(e) => setLongHorizon(e.target.value === "long")}
                className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7] focus:border-[#CCFF00] focus:outline-none"
              >
                <option value="short" disabled={!shortEpochs}>{shortEpochs ? `Short (${shortEpochs} epochs)` : "Short horizon unavailable"}</option>
                <option value="long" disabled={!longEpochs}>{longEpochs ? `Long (${longEpochs} epochs)` : "Long horizon unavailable"}</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                disabled={isBusy || !isConnected || liveFinalEpoch <= 0 || !horizonEpochs}
                onClick={() => void handleCreateMarket()}
                className="w-full bg-[#CCFF00] py-2 font-mono text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#B8E600] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {!isConnected ? "CONNECT WALLET" : "DEPLOY MARKET"}
              </button>
            </div>
          </div>

          {createErr && (
            <div className="mt-3 border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
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
        <EmptyState
          icon={Swords}
          kicker="Narrative markets"
          title={markets.length === 0 ? "No markets yet" : "No markets match"}
          text={
            markets.length === 0
              ? "Launch the first permissionless pair market above; it appears here as soon as the transaction confirms."
              : "Try clearing the status or sector filter, or launch a new permissionless pair market above."
          }
          steps={["Pick two sectors to pair", "Both sides stake ETH into pools", "Oracle epoch settles the winner"]}
        >
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setNarrativeFilter(null);
            }}
            className="border border-[#26262A] bg-[#111113] px-3 py-1.5 font-mono text-xs text-[#F5F5F7] hover:border-[#CCFF00]/50"
          >
            RESET FILTERS
          </button>
        </EmptyState>
      ) : (
        <div
          key={`${filter}-${narrativeFilter ?? "all"}`}
          className="tab-panel-enter grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          {visible.map((m) => {
            const totalPool = m.poolAEth + m.poolBEth;
            const pctA = totalPool > 0 ? Math.round((m.poolAEth / totalPool) * 100) : 0;
            const pctB = totalPool > 0 ? 100 - pctA : 0;
            const relA = m.currentIA !== null && m.baseIA > 0 ? m.currentIA / m.baseIA : null;
            const relB = m.currentIB !== null && m.baseIB > 0 ? m.currentIB / m.baseIB : null;
            const delta = m.status !== "refunded" && relA !== null && relB !== null ? relA - relB : null;

            return (
              <div
                key={m.marketId}
                className="flex flex-col justify-between border border-[#30322b] bg-[#161815] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#CCFF00]/35"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#71717A]">MKT #{m.marketId}</span>
                      <span className="border border-[#26262A] bg-[#111113] px-1.5 py-0.5 text-[10px] text-[#71717A]">
                        {m.horizonLabel}
                      </span>
                    </div>
                    <span
                      className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        m.status === "open"
                          ? "border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]"
                          : m.status === "locked"
                            ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                            : "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  {m.refundBound && (
                    <div className="mt-2 border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F59E0B]">
                      Series changed since this market opened: it will refund at settlement
                    </div>
                  )}

                  <Link
                    href={`/markets/${m.marketId}`}
                    className="mt-2.5 block text-lg font-semibold text-[#F5F5F7] transition-colors hover:text-[#CCFF00]"
                  >
                    {m.narrativeALabel}{" "}
                    <span className="font-mono text-xs font-normal text-[#71717A]">vs</span>{" "}
                    {m.narrativeBLabel}
                  </Link>

                  {/* Live relative delta telemetry */}
                  <div className="mt-2.5 grid grid-cols-3 gap-2 border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <div className="text-[10px] text-[#71717A]">
                        SIDE A ({m.narrativeALabel.slice(0, 10)})
                      </div>
                      <div className="text-[#F5F5F7]">
                        {formatBpsPercent(m.baseIA, 1)} → {m.currentIA === null ? "\u2014" : formatBpsPercent(m.currentIA, 1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#71717A]">
                        SIDE B ({m.narrativeBLabel.slice(0, 10)})
                      </div>
                      <div className="text-[#F5F5F7]">
                        {formatBpsPercent(m.baseIB, 1)} → {m.currentIB === null ? "\u2014" : formatBpsPercent(m.currentIB, 1)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#71717A]">{m.status === "open" || m.status === "locked" ? "CURRENT Δ LEAD" : "SETTLEMENT Δ"}</div>
                      <div
                        className={
                          delta !== null && delta > 0
                            ? "font-semibold text-[#4ADE80]"
                            : delta !== null && delta < 0
                              ? "font-semibold text-[#CCFF00]"
                              : "text-[#71717A]"
                        }
                      >
                        {delta !== null && delta >= 0 ? "+" : ""}
                        {delta === null ? "\u2014" : `${(delta * 100).toFixed(2)}%`}
                      </div>
                    </div>
                  </div>

                  {/* Pool Split Bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between font-mono text-[11px] tabular-nums">
                      <span className="text-[#4ADE80]">
                        A: {formatEth(m.poolAEth, 3)} {totalPool > 0 ? `(${pctA}%)` : ""}
                      </span>
                      <span className="text-[#71717A]">
                        TOTAL {formatEth(totalPool, 3)} / {m.maxPoolEth} ETH CAP
                      </span>
                      <span className="text-[#CCFF00]">
                        B: {formatEth(m.poolBEth, 3)} {totalPool > 0 ? `(${pctB}%)` : ""}
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden bg-[#232325]">
                      <div className="bg-[#4ADE80]" style={{ width: `${pctA}%` }} />
                      <div className="bg-[#CCFF00]" style={{ width: `${pctB}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#26262A] pt-3 font-mono text-[11px]">
                  <span className="text-[#71717A] tabular-nums">
                    {m.status === "open"
                      ? `Cutoff in ${formatCountdown(m.cutoffAt)} · Settle E${m.settleEpoch}`
                      : m.status === "locked"
                        ? `Betting closed · Settles in ${formatCountdown(m.settleAt)}`
                        : `Settled · Outcome: ${m.outcome ?? "refund"}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {m.status === "open" && !m.refundBound && (
                      <button
                        type="button"
                        onClick={() => setActiveBetMarket({ market: m, side: 0 })}
                        className="bg-[#4ADE80] px-3 py-1.5 text-[11px] font-semibold text-[#0D0D0E] transition-colors hover:bg-[#22C55E]"
                      >
                        BET NOW
                      </button>
                    )}
                    <Link
                      href={`/markets/${m.marketId}`}
                      className="border border-[#26262A] bg-[#111113] px-3 py-1.5 text-[11px] text-[#F5F5F7] transition-colors hover:border-[#CCFF00]/50"
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
