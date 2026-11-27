"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { NarrativeIndexItem } from "@/lib/types";

/** BELL-style flat carbon status tape with clean tabular quotes. */
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
    <div className="border-b border-[#26262A] bg-[#0D0D0E] font-mono text-[10px] tabular-nums">
      <div className="flex h-9 items-stretch px-4 sm:px-7">
        <div className="flex shrink-0 items-center border-r border-[#26262A] pr-4 text-[#71717A] uppercase tracking-[0.1em]">
          {epochId ? `EPOCH #${epochId}` : "INDEX TAPE"}
        </div>

        <div
          className="relative flex flex-1 items-center overflow-hidden"
          style={{ maskImage: "linear-gradient(90deg, transparent, black 2%, black 98%, transparent)" }}
        >
          <div
            className="animate-ticker flex w-max items-center divide-x divide-[#26262A]"
            style={paused ? { animationPlayState: "paused" } : undefined}
          >
            {items.map((n, idx) => {
              const velocity = n.vBps !== null ? { epochId, vBps: n.vBps } : n.lastFinalVelocity;
              const up = (velocity?.vBps ?? 0) >= 0;
              return (
                <Link
                  key={`${n.narrativeId}-${idx}`}
                  href={`/narratives/${n.narrativeId}`}
                  className="inline-flex items-center gap-2 whitespace-nowrap px-4 text-[#A1A1AA] transition-colors hover:text-[#F5F5F7]"
                >
                  <span className="uppercase tracking-[0.06em] text-[#F5F5F7]">{n.label}</span>
                  <span className="text-[#A1A1AA]">{formatBpsPercent(n.iBps, 1)}</span>
                  <span className={!velocity ? "text-[#52525B]" : up ? "text-[#4ADE80]" : "text-[#EF4444]"}>
                    {velocity ? `${formatSignedBps(velocity.vBps)}${n.vBps === null ? ` · FINAL #${velocity.epochId}` : ""}` : formatSignedBps(null, n.vFlag)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume ticker" : "Pause ticker"}
          className="shrink-0 cursor-pointer border-l border-[#26262A] pl-4 uppercase tracking-[0.1em] text-[#71717A] transition-colors hover:text-[#F5F5F7]"
        >
          {paused ? "PLAY" : "PAUSE"}
        </button>
      </div>
    </div>
  );
}
