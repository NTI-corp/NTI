"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Activity, Flame, Layers, Radio } from "lucide-react";
import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";

const SECTOR_PALETTE = [
  "#B8FF2E", // #1 Acid Lime
  "#23F7DD", // #2 Cyber Cyan
  "#4ADE80", // #3 Emerald
  "#38BDF8", // #4 Sky
  "#A3E635", // #5 Chartreuse
  "#F59E0B", // #6 Amber
  "#C084FC", // #7 Violet
  "#2DD4BF", // #8 Teal
  "#FB7185", // #9 Coral
  "#94A3B8", // #10 Slate
] as const;

export function MindshareExplorer({
  narratives,
  epochId,
}: {
  narratives: NarrativeIndexItem[];
  epochId: number | null;
}) {
  const sorted = [...narratives].sort((a, b) => b.iBps - a.iBps);
  const [selectedId, setSelectedId] = useState<number>(sorted[0]?.narrativeId ?? 8);

  const selectedIndex = Math.max(
    0,
    sorted.findIndex((n) => n.narrativeId === selectedId),
  );
  const active = sorted[selectedIndex] ?? sorted[0];
  const activeColor = SECTOR_PALETTE[selectedIndex % SECTOR_PALETTE.length];
  const totalBps = sorted.reduce((acc, item) => acc + item.iBps, 0) || 10_000;

  return (
    <div className="space-y-6">
      {/* Proportional 10,000 bps Mindshare Distribution Spectrum */}
      <div className="panel-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8B94A7]">
            <Layers className="h-3.5 w-3.5 text-[#B8FF2E]" />
            <span>INTERACTIVE MINDSHARE SPECTRUM</span>
            <span className="text-[#5A6478]">· CLICK ANY BAR SEGMENT TO INSPECT</span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-[#23F7DD]">
            {epochId ? `EP-${epochId}` : "PREVIEW"} · Σ I_n = {totalBps.toLocaleString("en-US")} BPS
          </span>
        </div>

        <div
          className="flex h-10 w-full overflow-hidden border border-[#1B202C] bg-[#06070A]"
          role="tablist"
          aria-label="Narrative mindshare spectrum"
        >
          {sorted.map((n, idx) => {
            const pct = (n.iBps / totalBps) * 100;
            const color = SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
            const isActive = n.narrativeId === active?.narrativeId;
            return (
              <button
                key={n.narrativeId}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedId(n.narrativeId)}
                style={{ width: `${Math.max(pct, 3.5)}%` }}
                title={`${n.label}: ${formatBpsPercent(n.iBps)}`}
                className={`group relative flex cursor-pointer items-center justify-center border-r border-[#06070A] transition-opacity last:border-r-0 ${
                  isActive ? "opacity-100" : "opacity-60 hover:opacity-95"
                }`}
              >
                <span
                  className="absolute inset-0"
                  style={{
                    backgroundColor: color,
                    opacity: isActive ? 0.34 : 0.16,
                  }}
                />
                <span
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ backgroundColor: color }}
                />
                <span className="relative z-10 truncate px-1 font-mono text-[10px] font-semibold tabular-nums text-[#F3F5F8]">
                  {pct >= 7.5 ? `${n.label.split(" ")[0]} ${(pct).toFixed(1)}%` : `${pct.toFixed(0)}%`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Focused Sector Telemetry Drawer */}
        {active && (
          <div className="mt-4 grid gap-4 border border-[#1B202C] bg-[#06070A]/80 p-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8B94A7]">
                <span
                  className="inline-block h-2 w-2"
                  style={{ backgroundColor: activeColor }}
                />
                <span>RANK #{String(selectedIndex + 1).padStart(2, "0")}</span>
                <span className="text-[#5A6478]">· SECTOR ID #{active.narrativeId}</span>
              </div>
              <h3 className="mt-1.5 font-display text-2xl font-bold text-[#F3F5F8]">
                {active.label}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#8B94A7]">
                {active.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/narratives/${active.narrativeId}`}
                  className="inline-flex items-center gap-1.5 border border-[#B8FF2E]/60 bg-[#B8FF2E] px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
                >
                  <span>Inspect Sector Detail</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-1.5 border border-[#2B3345] bg-[#0B0D12] px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-[#F3F5F8] transition-colors hover:border-[#23F7DD]/60"
                >
                  Trade in Pair Markets
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:col-span-7">
              <div className="border border-[#1B202C] bg-[#0B0D12] p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                  EMA Share (I_n)
                </span>
                <div className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[#B8FF2E]">
                  {formatBpsPercent(active.iBps)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[#8B94A7]">
                  {active.iBps.toLocaleString("en-US")} bps
                </div>
              </div>

              <div className="border border-[#1B202C] bg-[#0B0D12] p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                  Raw Epoch (M_n)
                </span>
                <div className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[#F3F5F8]">
                  {formatBpsPercent(active.mBps)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[#8B94A7]">
                  α = 0.3 smoothing
                </div>
              </div>

              <div className="border border-[#1B202C] bg-[#0B0D12] p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                  Velocity (V_n)
                </span>
                <div
                  className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${
                    active.vBps === null
                      ? "text-[#5A6478]"
                      : active.vBps >= 0
                        ? "text-[#23F7DD]"
                        : "text-[#F43F5E]"
                  }`}
                >
                  {active.vBps !== null ? formatSignedBps(active.vBps) : "WARMING"}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[#8B94A7]">
                  {active.vFlag ? active.vFlag.replace("_", " ") : "3-epoch baseline"}
                </div>
              </div>

              <div className="border border-[#1B202C] bg-[#0B0D12] p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                  Weighted Posts
                </span>
                <div className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[#F3F5F8]">
                  {active.weightedPosts}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[#8B94A7]">
                  S_n = {active.sN.toFixed(1)} decay
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 10-Sector Interactive Matrix */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {sorted.map((n, idx) => {
          const sharePct = Math.min(100, Math.max(4, (n.iBps / 2500) * 100));
          const isPositive = (n.vBps ?? 0) >= 0;
          const selected = n.narrativeId === active?.narrativeId;
          const color = SECTOR_PALETTE[idx % SECTOR_PALETTE.length];

          return (
            <button
              key={n.narrativeId}
              type="button"
              data-spot
              onClick={() => setSelectedId(n.narrativeId)}
              className={`group flex cursor-pointer flex-col justify-between border p-4 text-left transition-colors ${
                selected
                  ? "border-[#B8FF2E]/70 bg-[#11141C]"
                  : "border-[#1B202C] bg-[#0B0D12]/90 hover:border-[#2B3345] hover:bg-[#11141C]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[10px] text-[#5A6478]">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5"
                      style={{ backgroundColor: color }}
                    />
                    #{String(idx + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={
                      n.vBps === null
                        ? "text-[#5A6478]"
                        : isPositive
                          ? "text-[#23F7DD]"
                          : "text-[#F43F5E]"
                    }
                  >
                    {n.vBps !== null ? formatSignedBps(n.vBps) : "LIVE"}
                  </span>
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-2">
                  <span className="font-display text-base font-bold text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                    {n.label}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-[#F3F5F8]">
                    {formatBpsPercent(n.iBps)}
                  </span>
                </div>

                <div className="mt-2.5 h-1.5 w-full overflow-hidden bg-[#1B202C]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${sharePct}%`, backgroundColor: color }}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[#1B202C]/80 pt-2.5 font-mono text-[10px] text-[#5A6478]">
                <span className="flex items-center gap-1">
                  {idx === 0 ? (
                    <Flame className="h-3 w-3 text-[#B8FF2E]" />
                  ) : idx <= 2 ? (
                    <Activity className="h-3 w-3 text-[#23F7DD]" />
                  ) : (
                    <Radio className="h-3 w-3 text-[#5A6478]" />
                  )}
                  {n.iBps.toLocaleString("en-US")} bps
                </span>
                <span className={selected ? "text-[#B8FF2E]" : "group-hover:text-[#F3F5F8]"}>
                  {selected ? "ACTIVE" : "SELECT"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
