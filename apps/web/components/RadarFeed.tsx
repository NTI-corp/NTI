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
      <div className="panel-surface rounded-md p-6 text-center font-mono text-xs text-[#556173]">
        No Radar alerts triggered in the current window. Velocity alerts fire at V_n &gt; +5,000 bps on finalized epochs.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1B202C] overflow-hidden border border-[#1B202C] bg-[#0B0D12]">
      {visible.map((alert) => {
        const publicMs = new Date(alert.publicAt).getTime();
        const remainingMin = Math.max(1, Math.ceil((publicMs - nowMs) / 60_000));
        const isStillLocked = alert.locked && publicMs > nowMs && !realtimeUnlocked;

        return (
          <div
            key={alert.id}
            className={`transition-colors hover:bg-[#11141C] ${
              compact ? "px-3.5 py-3" : "px-4 py-3.5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    alert.kind === "velocity"
                      ? "border-[#B8FF2E]/40 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                      : "border-[#23F7DD]/40 bg-[#23F7DD]/10 text-[#23F7DD]"
                  }`}
                >
                  {alert.kind === "velocity" ? "VELOCITY SPIKE" : "NEW TOKEN"}
                </span>

                <Link
                  href={`/narratives/${alert.narrativeId}`}
                  className="font-display text-xs font-semibold text-[#F3F5F8] hover:text-[#B8FF2E]"
                >
                  {alert.narrativeLabel}
                </Link>
              </div>

              <span className="font-mono text-[10px] text-[#5A6478] tabular-nums">
                {formatRelativeTime(alert.detectedAt, nowMs)}
              </span>
            </div>

            {isStillLocked ? (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border border-[#F59E0B]/30 bg-[#F59E0B]/8 px-3 py-2 font-mono text-[11px]">
                <span className="text-[#F59E0B]">
                  LOCKED REAL-TIME SIGNAL · STAKE ≥100,000 $NTI TO UNLOCK IMMEDIATELY
                </span>
                <span className="font-semibold text-[#F3F5F8] tabular-nums">
                  Unlocks free in {remainingMin} min
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs tabular-nums">
                <div className="flex flex-wrap items-center gap-3">
                  {alert.vBps !== null && (
                    <span className="font-semibold text-[#B8FF2E]">
                      V_n {formatSignedBps(alert.vBps)}
                    </span>
                  )}

                  {alert.token && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#F3F5F8]">
                        ${alert.token.symbol ?? "TOKEN"}
                      </span>
                      <span className="text-[#8B94A7]">
                        {truncateHex(alert.token.address, 6, 4)}
                      </span>
                      {alert.token.liquidityEth !== null && (
                        <span className="border border-[#1B202C] bg-[#11141C] px-1.5 py-0.5 text-[10px] text-[#F3F5F8]">
                          {alert.token.liquidityEth.toFixed(1)} ETH LIQ
                        </span>
                      )}
                      <span
                        className={`border px-1.5 py-0.5 text-[10px] ${
                          alert.token.graduated
                            ? "border-[#B8FF2E]/35 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                            : "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                        }`}
                      >
                        {alert.token.graduated ? "GRADUATED (PHASE 2)" : "BONDING CURVE"}
                      </span>
                    </div>
                  )}
                </div>

                {realtimeUnlocked && publicMs > nowMs && (
                  <span className="border border-[#B8FF2E]/35 bg-[#B8FF2E]/10 px-1.5 py-0.5 text-[10px] text-[#B8FF2E]">
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
