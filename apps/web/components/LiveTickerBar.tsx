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
    <div className="border-t border-[#1B202C] bg-[#06070A] font-mono text-[11px] tabular-nums">
      <div className="mx-auto flex max-w-[1440px] items-center">
        <div className="flex shrink-0 items-center gap-2 border-r border-[#1B202C] bg-[#0B0D12] px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#8B94A7]">
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
                  className="inline-flex items-center gap-2 whitespace-nowrap text-[#8B94A7] transition-colors hover:text-[#F3F5F8]"
                >
                  <span className="uppercase tracking-wider text-[#F3F5F8]">{n.label}</span>
                  <span className="text-[#B8FF2E]">{formatBpsPercent(n.iBps)}</span>
                  <span
                    className={
                      n.vBps === null
                        ? "text-[#5A6478]"
                        : vPos
                          ? "text-[#23F7DD]"
                          : "text-[#F43F5E]"
                    }
                  >
                    {formatSignedBps(n.vBps, n.vFlag)}
                  </span>
                  <span className="text-[#1B202C]">/</span>
                </Link>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume ticker motion" : "Pause ticker motion"}
          className="shrink-0 cursor-pointer border-l border-[#1B202C] bg-[#0B0D12] px-3 py-2 text-[10px] uppercase tracking-wider text-[#8B94A7] transition-colors hover:text-[#F3F5F8]"
        >
          {paused ? "PLAY" : "PAUSE"}
        </button>
      </div>
    </div>
  );
}
