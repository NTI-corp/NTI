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
      <div className="border border-[#26262A] bg-[#161618] p-6 text-center text-xs text-[#71717A]">
        No Radar alerts triggered in the current window. Velocity alerts fire at V_n &gt; +5,000 bps on finalized epochs.
      </div>
    );
  }

  return (
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className="text-[#F5F5F7]">Signal Stream ({visible.length})</span>
        <span className="text-[#71717A]">LIVE POLL · 30S</span>
      </div>
      <div className="divide-y divide-[#1F1F23]">
        {visible.map((alert) => {
          const publicMs = new Date(alert.publicAt).getTime();
          const remainingMin = Math.max(1, Math.ceil((publicMs - nowMs) / 60_000));
          const isStillLocked = alert.locked && publicMs > nowMs && !realtimeUnlocked;

          return (
            <div
              key={alert.id}
              className={`transition-colors hover:bg-[#1E1E21] ${
                compact ? "px-3.5 py-2.5" : "px-4 py-3"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] ${
                      alert.kind === "velocity"
                        ? "border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]"
                        : "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]"
                    }`}
                  >
                    {alert.kind === "velocity" ? "VELOCITY" : "NEW TOKEN"}
                  </span>

                  <Link
                    href={`/narratives/${alert.narrativeId}`}
                    className="text-xs font-medium text-[#F5F5F7] transition-colors hover:text-[#CCFF00]"
                  >
                    {alert.narrativeLabel}
                  </Link>
                </div>

                <span className="font-mono text-[10px] text-[#71717A] tabular-nums">
                  {formatRelativeTime(alert.detectedAt, nowMs)}
                </span>
              </div>

              {isStillLocked ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-[#F59E0B]/35 bg-[#0D0D0E] px-3 py-1.5 font-mono text-[10.5px]">
                  <span className="text-[#F59E0B]">
                    LOCKED REAL-TIME SIGNAL · STAKE ≥100,000 $NTI
                  </span>
                  <span className="text-[#F5F5F7] tabular-nums">
                    Unlocks in {remainingMin}m
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs tabular-nums">
                  <div className="flex flex-wrap items-center gap-3">
                    {alert.vBps !== null && (
                      <span className="font-medium text-[#4ADE80]">
                        V_n {formatSignedBps(alert.vBps)}
                      </span>
                    )}

                    {alert.token && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#F5F5F7]">
                          ${alert.token.symbol ?? "TOKEN"}
                        </span>
                          {alert.token.source === "testnet_mock" && (
                            <span className="text-[#F59E0B]">TESTNET MARKET FIXTURE</span>
                          )}
                        <span className="text-[#71717A]">
                          {truncateHex(alert.token.address, 6, 4)}
                        </span>
                        {alert.token.liquidityEth !== null && (
                          <span className="border border-[#1F1F23] bg-[#0D0D0E] px-1.5 py-0.5 text-[10px] text-[#F5F5F7]">
                            {alert.token.liquidityEth.toFixed(1)} ETH LIQ
                          </span>
                        )}
                        <span
                          className={`border px-1.5 py-0.5 text-[9.5px] ${
                            alert.token.graduated
                              ? "border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]"
                              : "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                          }`}
                        >
                          {alert.token.graduated ? "GRADUATED" : "BONDING CURVE"}
                        </span>
                      </div>
                    )}
                  </div>

                  {realtimeUnlocked && publicMs > nowMs && (
                    <span className="border border-[#4ADE80]/35 bg-[#4ADE80]/10 px-1.5 py-0.5 text-[9.5px] text-[#4ADE80]">
                      STAKER REAL-TIME
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
