"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { NarrativeIndexItem } from "@/lib/types";

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
    <div className="border-t border-[#232325] bg-[#090909] font-mono text-[11px] tabular-nums">
      <div className="mx-auto flex max-w-[1440px] items-center">
        <div className="flex shrink-0 items-center border-r border-[#232325] bg-[#0E0E0F] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
            {epochId ? `EPOCH #${epochId}` : "INDEX STREAM"}
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden py-2">
          <div
            className="animate-ticker flex w-max items-center gap-6 px-4"
            style={paused ? { animationPlayState: "paused" } : undefined}
          >
            {items.map((n, idx) => {
              const vPos = (n.vBps ?? 0) >= 0;
              return (
                <Link
                  key={`${n.narrativeId}-${idx}`}
                  href={`/narratives/${n.narrativeId}`}
                  className="inline-flex items-center gap-2 whitespace-nowrap text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
                >
                  <span className="uppercase tracking-wider text-[#F4F4F5]">{n.label}</span>
                  <span className="text-[#22C55E]">{formatBpsPercent(n.iBps)}</span>
                  <span
                    className={
                      n.vBps === null
                        ? "text-[#71717A]"
                        : vPos
                          ? "text-[#34D399]"
                          : "text-[#EF4444]"
                    }
                  >
                    {formatSignedBps(n.vBps, n.vFlag)}
                  </span>
                  <span className="text-[#232325]">/</span>
                </Link>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume ticker motion" : "Pause ticker motion"}
          className="shrink-0 cursor-pointer border-l border-[#232325] bg-[#0E0E0F] px-3 py-2 text-[10px] uppercase tracking-wider text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          {paused ? "PLAY" : "PAUSE"}
        </button>
      </div>
    </div>
  );
}
