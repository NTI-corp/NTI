"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatRelativeTime, formatSignedBps, truncateHex } from "@/lib/format";
import type { RadarAlertItem } from "@/lib/types";

interface RadarFeedProps {
  alerts: RadarAlertItem[];
  realtimeUnlocked: boolean;
  maxItems?: number;
  compact?: boolean;
}

export function RadarFeed({
  alerts,
  realtimeUnlocked,
  maxItems,
  compact = false,
}: RadarFeedProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const visible = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-6 text-center text-xs text-[#71717A]">
        No Radar alerts triggered in the current window. Velocity alerts fire at V_n &gt; +5,000 bps on finalized epochs.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#232325] overflow-hidden rounded-lg border border-[#232325] bg-[#0E0E0F]">
      {visible.map((alert) => {
        const publicMs = new Date(alert.publicAt).getTime();
        const remainingMin = Math.max(1, Math.ceil((publicMs - nowMs) / 60_000));
        const isStillLocked = alert.locked && publicMs > nowMs && !realtimeUnlocked;

        return (
          <div
            key={alert.id}
            className={`transition-colors hover:bg-[#131314] ${
              compact ? "px-3.5 py-3" : "px-4 py-3.5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    alert.kind === "velocity"
                      ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
                      : "border-[#CCFF00]/40 bg-[#CCFF00]/12 text-[#CCFF00]"
                  }`}
                >
                  {alert.kind === "velocity" ? "VELOCITY SPIKE" : "NEW TOKEN"}
                </span>

                <Link
                  href={`/narratives/${alert.narrativeId}`}
                  className="text-xs font-semibold text-[#F4F4F5] transition-colors hover:text-[#CCFF00]"
                >
                  {alert.narrativeLabel}
                </Link>
              </div>

              <span className="font-mono text-[10px] text-[#71717A] tabular-nums">
                {formatRelativeTime(alert.detectedAt, nowMs)}
              </span>
            </div>

            {isStillLocked ? (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 font-mono text-[11px]">
                <span className="text-[#F59E0B]">
                  LOCKED REAL-TIME SIGNAL · STAKE ≥100,000 $NTI TO UNLOCK IMMEDIATELY
                </span>
                <span className="font-semibold text-[#F4F4F5] tabular-nums">
                  Unlocks free in {remainingMin} min
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs tabular-nums">
                <div className="flex flex-wrap items-center gap-3">
                  {alert.vBps !== null && (
                    <span className="font-semibold text-[#22C55E]">
                      V_n {formatSignedBps(alert.vBps)}
                    </span>
                  )}

                  {alert.token && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#F4F4F5]">
                        ${alert.token.symbol ?? "TOKEN"}
                      </span>
                      <span className="text-[#A1A1AA]">
                        {truncateHex(alert.token.address, 6, 4)}
                      </span>
                      {alert.token.liquidityEth !== null && (
                        <span className="rounded border border-[#232325] bg-[#090909] px-1.5 py-0.5 text-[10px] text-[#F4F4F5]">
                          {alert.token.liquidityEth.toFixed(1)} ETH LIQ
                        </span>
                      )}
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          alert.token.graduated
                            ? "border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]"
                            : "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                        }`}
                      >
                        {alert.token.graduated ? "GRADUATED (PHASE 2)" : "BONDING CURVE"}
                      </span>
                    </div>
                  )}
                </div>

                {realtimeUnlocked && publicMs > nowMs && (
                  <span className="rounded border border-[#22C55E]/35 bg-[#22C55E]/10 px-1.5 py-0.5 text-[10px] text-[#22C55E]">
                    STAKER REAL-TIME
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
