"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { RadarFeed } from "./RadarFeed";
import { RecentLaunches } from "./RecentLaunches";
import type { RecentLaunchItem } from "@/lib/types";
import { useSiweSession } from "./Providers";
import { AwaitingEpochBanner } from "./AwaitingEpochBanner";
import { VelocityBars } from "./VelocityBars";
import { SegmentedTabs } from "./ui/SegmentedTabs";
import { TokenLogo, UniswapMark } from "./ui/TokenLogo";
import type { NarrativeIndexItem, RadarResponse } from "@/lib/types";

export function RadarClient({
  initialData,
  sectors = [],
  launches = [],
}: {
  initialData: RadarResponse;
  sectors?: NarrativeIndexItem[];
  launches?: RecentLaunchItem[];
}) {
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
    <div className="space-y-4">
      {data.dataSource === "unavailable" && <AwaitingEpochBanner unavailable message="Radar data is temporarily unavailable." />}

      {/* Bloomberg-Style Terminal Header Strip */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-3.5">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">
            Emerging Radar · Velocity &amp; On-Chain Token Discovery
          </span>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
            Emerging Radar
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-[#71717A]">
            Velocity spikes trigger when finalized V_n exceeds +5,000 bps. New-token signals fire on{" "}
            <span className="inline-flex items-center gap-1 align-middle text-[#A1A1AA]">
              <TokenLogo symbol="PONS" size={14} />
              <span>Pons V2</span>
            </span>{" "}
            &amp;{" "}
            <span className="inline-flex items-center gap-1 align-middle text-[#A1A1AA]">
              <UniswapMark className="h-3.5 w-3.5" />
              <span>Uniswap</span>
            </span>{" "}
            launches with ≥1 ETH liquidity inside rising narratives.
          </p>
        </div>

        <SegmentedTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `ALL (${data.alerts.length})` },
            { value: "velocity", label: "VELOCITY", tone: "lime" },
            { value: "new_token", label: "NEW TOKENS", tone: "green" },
          ]}
          className="font-mono text-[10.5px]"
          buttonClassName="px-3 py-1 uppercase"
        />
      </div>

      {/* Compact SIWE Staker Gating Strip */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 border px-4 py-3 ${
          data.realtimeUnlocked
            ? "border-[#4ADE80]/35 bg-[#161618]"
            : "border-[#26262A] bg-[#161618]"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
            <span
              className={`h-1.5 w-1.5 shrink-0 ${
                data.realtimeUnlocked ? "bg-[#4ADE80]" : "bg-[#F59E0B]"
              }`}
            />
            <span className={data.realtimeUnlocked ? "text-[#4ADE80]" : "text-[#F59E0B]"}>
              {data.realtimeUnlocked
                ? "REAL-TIME STAKER FEED UNLOCKED"
                : `PUBLIC DELAYED FEED · ${data.lockedCount} FRESH SIGNAL(S) LOCKED 60M`}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#71717A]">
            {data.realtimeUnlocked
              ? `Verified via SIWE (${data.stakeFormatted} $NTI staked ≥ ${data.minStakeRequired} $NTI minimum). Zero delay on all alerts.`
              : !isConnected
                ? `Connect wallet, stake ≥${data.minStakeRequired} $NTI, and sign in via SIWE to remove the 1-hour public delay.`
                : `Stake at least ${data.minStakeRequired} $NTI and verify ownership via SIWE to remove the 1-hour public delay.`}
          </p>
          {error && <p className="mt-1 font-mono text-[11px] text-[#EF4444]">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!data.realtimeUnlocked && isConnected && !session?.authenticated && (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signIn()}
              className="cursor-pointer bg-[#CCFF00] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0D0D0E] transition-colors hover:bg-[#B8E600] disabled:opacity-50"
            >
              {signingIn ? "VERIFYING SIWE..." : "SIGN IN WITH ETHEREUM"}
            </button>
          )}
          {!data.realtimeUnlocked && (
            <Link
              href="/stake"
              className="border border-[#4ADE80]/45 bg-[#0D0D0E] px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#4ADE80] transition-colors hover:bg-[#4ADE80]/15"
            >
              STAKE $NTI →
            </Link>
          )}
        </div>
      </div>

      {pollError && (
        <div className="flex items-center justify-between border border-[#EF4444]/40 bg-[#EF4444]/10 px-3.5 py-2 text-xs text-[#EF4444]">
          <span>{pollError}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="cursor-pointer font-mono text-[10.5px] uppercase underline hover:text-[#F5F5F7]"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div key={filter} className="tab-panel-enter xl:col-span-7">
          <RadarFeed alerts={filteredAlerts} realtimeUnlocked={data.realtimeUnlocked} />
          <div className="mt-4">
            <RecentLaunches launches={launches} />
          </div>
        </div>
        {sectors.length > 0 && (
          <div className="xl:col-span-5">
            <VelocityBars narratives={sectors} />
          </div>
        )}
      </div>
    </div>
  );
}
