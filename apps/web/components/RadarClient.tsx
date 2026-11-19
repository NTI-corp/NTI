"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { RadarFeed } from "./RadarFeed";
import { useSiweSession } from "./Providers";
import { AwaitingEpochBanner } from "./AwaitingEpochBanner";
import type { RadarResponse } from "@/lib/types";

export function RadarClient({ initialData }: { initialData: RadarResponse }) {
  const { isConnected } = useAccount();
  const { session, signingIn, signIn, error } = useSiweSession();
  const [data, setData] = useState<RadarResponse>(initialData);
  const [filter, setFilter] = useState<"all" | "velocity" | "new_token">("all");

  // Refresh radar feed whenever SIWE session changes (unlocking real-time signals immediately!)
  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const res = await fetch("/api/radar", { cache: "no-store" });
        if (!res.ok || !active) return;
        const fresh = (await res.json()) as RadarResponse;
        if (active) setData(fresh);
      } catch {
        // ignore
      }
    };
    void reload();
    const t = setInterval(reload, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [session?.authenticated, session?.hasRadarAccess]);

  const filteredAlerts = data.alerts.filter((a) =>
    filter === "all" ? true : a.kind === filter,
  );

  return (
    <div className="space-y-5">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
            EMERGING RADAR · VELOCITY &amp; ON-CHAIN TOKEN DISCOVERY
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#EDF1F7]">
            Real-Time Narrative Signal Feed
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Velocity spikes trigger when finalized V_n exceeds +5,000 bps (excluding too_small / series_break / incomplete_gap).
            New-token signals trigger on Pons V1/V2 &amp; Uniswap launches with ≥1 ETH liquidity inside rising narratives.
          </p>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          {(["all", "velocity", "new_token"] as const).map((tab) => (
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
              {tab === "all" ? `ALL (${data.alerts.length})` : tab === "velocity" ? "VELOCITY" : "NEW TOKENS"}
            </button>
          ))}
        </div>
      </div>

      {/* SIWE Staker Gating Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-md border p-4 ${
          data.realtimeUnlocked
            ? "border-[#10B981]/40 bg-[#10B981]/10"
            : "border-[#F59E0B]/35 bg-[#0E1117]"
        }`}
      >
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${
                data.realtimeUnlocked ? "bg-[#10B981]" : "bg-[#F59E0B]"
              }`}
            />
            <span className={data.realtimeUnlocked ? "text-[#10B981]" : "text-[#F59E0B]"}>
              {data.realtimeUnlocked
                ? "REAL-TIME STAKER FEED UNLOCKED"
                : `PUBLIC DELAYED FEED · ${data.lockedCount} FRESH SIGNAL(S) LOCKED FOR 60 MIN`}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-[#8A96A8]">
            {data.realtimeUnlocked
              ? `Verified via SIWE (${data.stakeFormatted} $NTI staked ≥ ${data.minStakeRequired} $NTI minimum). Zero delay on all alerts.`
              : `Stake at least ${data.minStakeRequired} $NTI and verify ownership via SIWE to remove the 1-hour public delay. Server caches on-chain stakeOf() for 60s.`}
          </p>
          {error && <p className="mt-1 font-mono text-[11px] text-[#EF4444]">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!data.realtimeUnlocked && isConnected && !session?.authenticated && (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signIn()}
              className="rounded border border-[#38BDF8]/50 bg-[#38BDF8]/15 px-3.5 py-2 font-mono text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 disabled:opacity-50"
            >
              {signingIn ? "VERIFYING SIWE..." : "SIGN IN WITH ETHEREUM"}
            </button>
          )}
          {!data.realtimeUnlocked && (
            <Link
              href="/stake"
              className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-3.5 py-2 font-mono text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/25"
            >
              STAKE $NTI →
            </Link>
          )}
        </div>
      </div>

      <RadarFeed alerts={filteredAlerts} realtimeUnlocked={data.realtimeUnlocked} />
    </div>
  );
}
