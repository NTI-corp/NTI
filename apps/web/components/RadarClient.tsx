"use client";

import React, { useCallback, useEffect, useState } from "react";
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
  const [pollError, setPollError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/radar", { cache: "no-store" });
      if (!res.ok) {
        setPollError(`Live radar refresh failed (HTTP ${res.status}).`);
        return;
      }
      const fresh = (await res.json()) as RadarResponse;
      setData(fresh);
      setPollError(null);
    } catch {
      setPollError("Network error while polling /api/radar.");
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload, session?.authenticated, session?.hasRadarAccess]);

  const filteredAlerts = data.alerts.filter((a) =>
    filter === "all" ? true : a.kind === filter,
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232325] pb-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
            Emerging Radar · Velocity &amp; On-Chain Token Discovery
          </span>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            Emerging Radar
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
            Velocity spikes trigger when finalized V_n exceeds +5,000 bps (excluding too_small / series_break / incomplete_gap). New-token signals trigger on Pons V1/V2 &amp; Uniswap launches with ≥1 ETH liquidity inside rising narratives.
          </p>
        </div>

        <div className="flex items-center rounded-md border border-[#232325] bg-[#0E0E0F] p-0.5 font-mono text-[11px]">
          {(["all", "velocity", "new_token"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded px-3 py-1 uppercase transition-colors ${
                filter === tab
                  ? "bg-[#232325] text-[#F4F4F5]"
                  : "text-[#71717A] hover:text-[#A1A1AA]"
              }`}
            >
              {tab === "all" ? `ALL (${data.alerts.length})` : tab === "velocity" ? "VELOCITY" : "NEW TOKENS"}
            </button>
          ))}
        </div>
      </div>

      {/* SIWE Staker Gating Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${
          data.realtimeUnlocked
            ? "border-[#22C55E]/40 bg-[#22C55E]/10"
            : "border-[#F59E0B]/35 bg-[#0E0E0F]"
        }`}
      >
        <div>
          <div className="font-mono text-xs font-semibold">
            <span className={data.realtimeUnlocked ? "text-[#22C55E]" : "text-[#F59E0B]"}>
              {data.realtimeUnlocked
                ? "REAL-TIME STAKER FEED UNLOCKED"
                : `PUBLIC DELAYED FEED · ${data.lockedCount} FRESH SIGNAL(S) LOCKED FOR 60 MIN`}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            {data.realtimeUnlocked
              ? `Verified via SIWE (${data.stakeFormatted} $NTI staked ≥ ${data.minStakeRequired} $NTI minimum). Zero delay on all alerts.`
              : !isConnected
                ? `Connect your wallet in the top navigation bar, stake ≥${data.minStakeRequired} $NTI, and sign in via SIWE to remove the 1-hour public delay.`
                : `Stake at least ${data.minStakeRequired} $NTI and verify ownership via SIWE to remove the 1-hour public delay. Server caches on-chain stakeOf() for 60s.`}
          </p>
          {error && <p className="mt-1 font-mono text-[11px] text-[#F87171]">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!data.realtimeUnlocked && isConnected && !session?.authenticated && (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signIn()}
              className="rounded-md bg-[#CCFF00] px-3.5 py-2 font-mono text-xs font-semibold text-black transition-colors hover:bg-[#B8E600] disabled:opacity-50"
            >
              {signingIn ? "VERIFYING SIWE..." : "SIGN IN WITH ETHEREUM"}
            </button>
          )}
          {!data.realtimeUnlocked && (
            <Link
              href="/stake"
              className="rounded-md border border-[#22C55E]/50 bg-[#22C55E]/15 px-3.5 py-2 font-mono text-xs font-semibold text-[#22C55E] transition-colors hover:bg-[#22C55E]/25"
            >
              STAKE $NTI →
            </Link>
          )}
        </div>
      </div>

      {pollError && (
        <div className="flex items-center justify-between rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
          <span>{pollError}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="font-mono text-[11px] underline hover:text-white"
          >
            RETRY
          </button>
        </div>
      )}

      <RadarFeed alerts={filteredAlerts} realtimeUnlocked={data.realtimeUnlocked} />
    </div>
  );
}
