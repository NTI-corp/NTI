"use client";

import React, { useMemo, useState } from "react";
import type { RecentLaunchItem } from "@/lib/types";
import { TokenLogo } from "@/components/ui/TokenLogo";

function age(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function formatLiquidity(eth: number, graduated: boolean): string {
  if (eth >= 100) return `${eth.toLocaleString("en-US", { maximumFractionDigits: 1 })} ETH`;
  if (eth >= 1) return `${eth.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH`;
  if (eth > 0) return `${eth.toFixed(4)} ETH`;
  return graduated ? "no pool data" : "no buys yet";
}

/** On-chain tokens tracked by discovery: liquid/labeled leaders first, plus newest Pons launches. */
export function RecentLaunches({ launches }: { launches: RecentLaunchItem[] }) {
  const active = useMemo(
    () =>
      launches
        .filter((t) => t.liquidityEth > 0 || t.graduated || t.narrativeLabel !== null)
        .sort((a, b) => b.liquidityEth - a.liquidityEth || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [launches],
  );
  const newest = useMemo(
    () =>
      [...launches]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 25),
    [launches],
  );

  const [tab, setTab] = useState<"active" | "newest">(active.length > 0 ? "active" : "newest");

  if (launches.length === 0) return null;
  const rows = tab === "active" ? active : newest;

  return (
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        <div className="flex items-center gap-3">
          <span className="text-[#F5F5F7]">On-Chain Token Discovery</span>
          <div className="inline-flex border border-[#26262A] bg-[#0D0D0E]">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={`px-2.5 py-0.5 transition-colors ${
                tab === "active"
                  ? "bg-[#CCFF00]/15 text-[#CCFF00]"
                  : "text-[#71717A] hover:text-[#F5F5F7]"
              }`}
            >
              Liquid &amp; Labeled ({active.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("newest")}
              className={`border-l border-[#26262A] px-2.5 py-0.5 transition-colors ${
                tab === "newest"
                  ? "bg-[#CCFF00]/15 text-[#CCFF00]"
                  : "text-[#71717A] hover:text-[#F5F5F7]"
              }`}
            >
              New Launches ({newest.length})
            </button>
          </div>
        </div>
        <span className="text-[#71717A]">Alert at 1 ETH liquidity</span>
      </div>
      <p className="border-b border-[#1F1F23] px-4 py-2 text-[11px] text-[#71717A]">
        {tab === "active"
          ? "Tokens with active DEX/curve liquidity or an AI/KOL narrative label on Robinhood Chain."
          : "Newest raw Pons V2 deploys start with an empty curve until someone buys or a tracked KOL mentions them."}
      </p>
      <div className="divide-y divide-[#1F1F23]">
        {rows.map((t) => (
          <div key={t.address} className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-[11px]">
            <div className="flex min-w-0 items-center gap-2.5">
              <TokenLogo symbol={t.symbol} imageUrl={t.imageUrl} size={22} />
              <div className="min-w-0">
                <span className="font-semibold text-[#F5F5F7]">${t.symbol}</span>{" "}
                <span className="truncate text-[#8A8A93]">{t.name}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 tabular-nums text-[#A1A1AA]">
              <span className={t.narrativeLabel ? "text-[#CCFF00]" : "text-[#71717A]"}>
                {t.narrativeLabel ?? "no KOL mention yet"}
              </span>
              <span className={t.graduated ? "text-[#4ADE80]" : "text-[#A1A1AA]"}>
                {t.graduated ? "graduated" : "bonding curve"}
              </span>
              <span className={t.liquidityEth > 0 ? "text-[#F5F5F7]" : "text-[#71717A]"}>
                {formatLiquidity(t.liquidityEth, t.graduated)}
              </span>
              <span className="text-[#71717A]">{age(t.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
