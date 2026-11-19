"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BetModal } from "./BetModal";
import { formatBpsPercent, formatCountdown, formatEth } from "@/lib/format";
import type { MarketItem } from "@/lib/types";

export function MarketsListClient({
  markets,
  awaitingDeployment,
}: {
  markets: MarketItem[];
  awaitingDeployment: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "open" | "locked" | "settled">("all");
  const [activeBetMarket, setActiveBetMarket] = useState<{
    market: MarketItem;
    side: 0 | 1;
  } | null>(null);

  const visible = markets.filter((m) =>
    filter === "all" ? true : m.status === filter,
  );

  return (
    <div className="space-y-5">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/8 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW MARKETS</strong> · NarrativeMarket contract mirror has 0 indexed markets yet. Showing parimutuel market structure with live contract hooks ready once deployed.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
            NARRATIVE MARKETS · FIXED-HORIZON PARIMUTUEL
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#EDF1F7]">
            Relative Mindshare Pair Markets
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Settled purely by finalized on-chain oracle index Δ = I_A(settle)/I_A(base) − I_B(settle)/I_B(base). Zero leverage, 5 ETH pool cap, 0.1% fee (up to 50% discount for $NTI stakers), full gross refund on re-baseline or incomplete epoch.
          </p>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          {(["all", "open", "locked", "settled"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded border px-3 py-1.5 uppercase transition-colors ${
                filter === tab
                  ? "border-[#38BDF8]/50 bg-[#38BDF8]/12 text-[#EDF1F7]"
                  : "border-[#1B2028] bg-[#0E1117] text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map((m) => {
          const totalPool = m.poolAEth + m.poolBEth;
          const pctA = totalPool > 0 ? Math.round((m.poolAEth / totalPool) * 100) : 50;
          const pctB = 100 - pctA;
          const relA = m.baseIA > 0 ? m.currentIA / m.baseIA : 1;
          const relB = m.baseIB > 0 ? m.currentIB / m.baseIB : 1;
          const delta = relA - relB;

          return (
            <div key={m.marketId} className="panel-surface flex flex-col justify-between rounded-md p-4">
              <div>
                <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#556173]">MKT #{m.marketId}</span>
                    <span className="rounded border border-[#2A3342] bg-[#131820] px-1.5 py-0.5 text-[10px] text-[#8A96A8]">
                      {m.horizonLabel}
                    </span>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      m.status === "open"
                        ? "border-[#10B981]/35 bg-[#10B981]/10 text-[#10B981]"
                        : m.status === "locked"
                          ? "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                          : "border-[#38BDF8]/35 bg-[#38BDF8]/10 text-[#38BDF8]"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <Link
                  href={`/markets/${m.marketId}`}
                  className="mt-2.5 block font-display text-lg font-semibold text-[#EDF1F7] hover:text-[#38BDF8]"
                >
                  {m.narrativeALabel}{" "}
                  <span className="font-mono text-xs font-normal text-[#556173]">vs</span>{" "}
                  {m.narrativeBLabel}
                </Link>

                {/* Live relative delta telemetry */}
                <div className="mt-2 grid grid-cols-3 gap-2 rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2 font-mono text-[11px] tabular-nums">
                  <div>
                    <div className="text-[9px] text-[#556173]">SIDE A ({m.narrativeALabel.slice(0, 10)})</div>
                    <div className="text-[#EDF1F7]">
                      {formatBpsPercent(m.baseIA, 1)} → {formatBpsPercent(m.currentIA, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#556173]">SIDE B ({m.narrativeBLabel.slice(0, 10)})</div>
                    <div className="text-[#EDF1F7]">
                      {formatBpsPercent(m.baseIB, 1)} → {formatBpsPercent(m.currentIB, 1)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[#556173]">LIVE Δ LEAD</div>
                    <div
                      className={
                        delta > 0
                          ? "font-semibold text-[#10B981]"
                          : delta < 0
                            ? "font-semibold text-[#38BDF8]"
                            : "text-[#8A96A8]"
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
                    <span className="text-[#10B981]">
                      A: {formatEth(m.poolAEth, 2)} ({pctA}%)
                    </span>
                    <span className="text-[#8A96A8]">
                      TOTAL {formatEth(totalPool, 2)} / {m.maxPoolEth} ETH CAP
                    </span>
                    <span className="text-[#38BDF8]">
                      B: {formatEth(m.poolBEth, 2)} ({pctB}%)
                    </span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1B2028]">
                    <div className="bg-[#10B981]" style={{ width: `${pctA}%` }} />
                    <div className="bg-[#38BDF8]" style={{ width: `${pctB}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#1B2028] pt-3 font-mono text-[11px]">
                <span className="text-[#8A96A8] tabular-nums">
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
                      className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-3 py-1.5 text-[11px] font-semibold text-[#10B981] hover:bg-[#10B981]/25"
                    >
                      BET NOW
                    </button>
                  )}
                  <Link
                    href={`/markets/${m.marketId}`}
                    className="rounded border border-[#2A3342] bg-[#131820] px-3 py-1.5 text-[11px] text-[#EDF1F7] hover:border-[#38BDF8]/50"
                  >
                    DETAIL →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
