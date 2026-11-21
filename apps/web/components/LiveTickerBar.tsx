"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import { Radio } from "lucide-react";
import { SectorGlyph } from "@/components/ui/Visuals";
import type { NarrativeIndexItem } from "@/lib/types";

/** Marquee of all sectors under the navbar: color dot, mindshare share and 24h velocity. */
export function LiveTickerBar({
  narratives,
  epochId,
}: {
  narratives: NarrativeIndexItem[];
  epochId: number | null;
}) {
  const [paused, setPaused] = useState(false);

  if (narratives.length === 0) return null;

  const sorted = [...narratives].sort((a, b) => b.iBps - a.iBps);
  const items = [...sorted, ...sorted];

  return (
    <div className="border-b border-[#232325] bg-[#08080A] font-mono text-[11px] tabular-nums">
      <div className="mx-auto flex max-w-[1480px] items-stretch px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2 border-x border-[#1B1B1D] pr-4 pl-3">
          <Radio className="live-dot h-3 w-3 text-[#CCFF00]" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
            {epochId ? `EP-${epochId}` : "Index"}
          </span>
        </div>

        <div
          className="relative flex-1 overflow-hidden py-2"
          style={{ maskImage: "linear-gradient(90deg, transparent, black 4%, black 96%, transparent)" }}
        >
          <div
            className="animate-ticker flex w-max items-center gap-7 px-4"
            style={paused ? { animationPlayState: "paused" } : undefined}
          >
            {items.map((n, idx) => {
              const up = (n.vBps ?? 0) >= 0;
              return (
                <Link
                  key={`${n.narrativeId}-${idx}`}
                  href={`/narratives/${n.narrativeId}`}
                  className="inline-flex items-center gap-2 whitespace-nowrap text-[#A1A1AA] transition-colors hover:text-white"
                >
                  <SectorGlyph id={n.narrativeId} className="h-3 w-3" />
                  <span className="uppercase tracking-wider text-[#E4E4E7]">{n.label}</span>
                  <span className="text-white">{formatBpsPercent(n.iBps, 1)}</span>
                  <span className={n.vBps === null ? "text-[#52525B]" : up ? "text-[#22C55E]" : "text-[#EF4444]"}>
                    {n.vBps === null ? "—" : `${up ? "▲" : "▼"} ${formatSignedBps(n.vBps, n.vFlag)}`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume ticker motion" : "Pause ticker motion"}
          className="shrink-0 cursor-pointer border-x border-[#1B1B1D] px-3 text-[10px] uppercase tracking-wider text-[#71717A] transition-colors hover:text-white"
        >
          {paused ? "Play" : "Pause"}
        </button>
      </div>
    </div>
  );
}
