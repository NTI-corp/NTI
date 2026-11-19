"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract } from "wagmi";
import { BetModal } from "./BetModal";
import {
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
} from "@/lib/contracts";
import { formatBpsPercent, formatCountdown, formatEth } from "@/lib/format";
import type { MarketItem } from "@/lib/types";

export function MarketDetailClient({ market }: { market: MarketItem }) {
  const { isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const addresses = getProtocolAddresses(getActiveChainId());
  const totalPool = market.poolAEth + market.poolBEth;
  const pctA = totalPool > 0 ? Math.round((market.poolAEth / totalPool) * 100) : 50;
  const pctB = 100 - pctA;

  const relA = market.baseIA > 0 ? market.currentIA / market.baseIA : 1;
  const relB = market.baseIB > 0 ? market.currentIB / market.baseIB : 1;
  const delta = relA - relB;

  const invoke = async (fn: "settle" | "claim") => {
    setActionErr(null);
    setActionMsg(null);
    if (!isConnected) {
      setActionErr("Connect your wallet in the top bar first.");
      return;
    }
    if (!addresses.narrativeMarket) {
      setActionErr("NarrativeMarket contract address not configured on this chain.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: addresses.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: fn,
        args: [BigInt(market.marketId)],
      });
      setActionMsg(`${fn}() submitted: ${hash}`);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Transaction rejected");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1B2028] pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#556173]">
            <Link href="/markets" className="hover:text-[#EDF1F7]">
              MARKETS
            </Link>
            <span>/</span>
            <span className="text-[#8A96A8]">MARKET #{market.marketId}</span>
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-[#EDF1F7]">
            {market.narrativeALabel} vs {market.narrativeBLabel}
          </h1>
          <p className="mt-1 font-mono text-xs text-[#8A96A8]">
            Base Epoch #{market.baseEpoch} → Settlement Epoch #{market.settleEpoch} · Series S{market.seriesId} · {market.horizonLabel}
          </p>
        </div>

        <span
          className={`rounded border px-3 py-1 font-mono text-xs font-semibold uppercase ${
            market.status === "open"
              ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]"
              : market.status === "locked"
                ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                : "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]"
          }`}
        >
          {market.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Pool State, Settlement Formula & Actions */}
        <div className="space-y-5 lg:col-span-7">
          <div className="panel-surface rounded-md p-4">
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Parimutuel Pool Breakdown
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3 font-mono tabular-nums">
              <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
                <div className="text-[10px] text-[#10B981]">SIDE A POOL</div>
                <div className="mt-1 text-base font-semibold text-[#EDF1F7]">
                  {formatEth(market.poolAEth, 3)}
                </div>
                <div className="text-[10px] text-[#8A96A8]">{pctA}% of total</div>
              </div>
              <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
                <div className="text-[10px] text-[#38BDF8]">SIDE B POOL</div>
                <div className="mt-1 text-base font-semibold text-[#EDF1F7]">
                  {formatEth(market.poolBEth, 3)}
                </div>
                <div className="text-[10px] text-[#8A96A8]">{pctB}% of total</div>
              </div>
              <div className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
                <div className="text-[10px] text-[#556173]">POOL CAP USAGE</div>
                <div className="mt-1 text-base font-semibold text-[#EDF1F7]">
                  {formatEth(totalPool, 2)}
                </div>
                <div className="text-[10px] text-[#8A96A8]">Max {market.maxPoolEth} ETH</div>
              </div>
            </div>

            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-[#1B2028]">
              <div className="bg-[#10B981]" style={{ width: `${pctA}%` }} />
              <div className="bg-[#38BDF8]" style={{ width: `${pctB}%` }} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#1B2028] pt-3 font-mono text-xs tabular-nums">
              <div>
                <span className="text-[#556173]">BETTING CUTOFF</span>
                <div className="mt-0.5 text-[#EDF1F7]">
                  {market.status === "open"
                    ? `In ${formatCountdown(market.cutoffAt)}`
                    : "Closed (2 epochs prior)"}
                </div>
              </div>
              <div>
                <span className="text-[#556173]">SETTLEMENT WINDOW</span>
                <div className="mt-0.5 text-[#EDF1F7]">
                  {market.status === "settled"
                    ? `Settled (${market.outcome})`
                    : `Target E${market.settleEpoch} (${formatCountdown(market.settleAt)})`}
                </div>
              </div>
            </div>
          </div>

          {/* Relative Index Spread Tracker */}
          <div className="panel-surface rounded-md p-4">
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Settlement Spread Formula
            </h2>
            <p className="mt-1 font-mono text-xs text-[#8A96A8]">
              Δ = I_A(E{market.settleEpoch}) / I_A(E{market.baseEpoch}) − I_B(E{market.settleEpoch}) / I_B(E{market.baseEpoch})
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[10px] text-[#556173]">{market.narrativeALabel}</div>
                <div className="mt-0.5 text-[#EDF1F7]">
                  {formatBpsPercent(market.baseIA)} → {formatBpsPercent(market.currentIA)}
                </div>
                <div className="text-[10px] text-[#10B981]">Ratio {relA.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#556173]">{market.narrativeBLabel}</div>
                <div className="mt-0.5 text-[#EDF1F7]">
                  {formatBpsPercent(market.baseIB)} → {formatBpsPercent(market.currentIB)}
                </div>
                <div className="text-[10px] text-[#38BDF8]">Ratio {relB.toFixed(4)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#556173]">INDICATIVE Δ</div>
                <div
                  className={`mt-0.5 text-base font-semibold ${
                    delta >= 0 ? "text-[#10B981]" : "text-[#38BDF8]"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {(delta * 100).toFixed(2)}%
                </div>
                <div className="text-[10px] text-[#8A96A8]">
                  {delta > 0 ? "Side A leading" : delta < 0 ? "Side B leading" : "Tie (refund)"}
                </div>
              </div>
            </div>
          </div>

          {/* Permissionless Settle & Pull Claim */}
          <div className="panel-surface rounded-md p-4">
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Permissionless Settlement &amp; Payout Claim
            </h2>
            <p className="mt-1 text-xs text-[#8A96A8]">
              Anyone can call <code className="font-mono text-[#EDF1F7]">settle({market.marketId})</code> once Epoch #{market.settleEpoch} reaches final status (or after the 48-hour timeout for automatic gross refund). Winners and refund recipients withdraw via pull <code className="font-mono text-[#EDF1F7]">claim({market.marketId})</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => void invoke("settle")}
                className="rounded border border-[#38BDF8]/50 bg-[#38BDF8]/15 px-4 py-2 font-mono text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 disabled:opacity-50"
              >
                SETTLE MARKET #{market.marketId}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void invoke("claim")}
                className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-4 py-2 font-mono text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/25 disabled:opacity-50"
              >
                CLAIM PAYOUT / REFUND
              </button>
            </div>
            {actionErr && (
              <p className="mt-2 font-mono text-[11px] text-[#EF4444]">{actionErr}</p>
            )}
            {actionMsg && (
              <p className="mt-2 font-mono text-[11px] text-[#10B981]">{actionMsg}</p>
            )}
          </div>
        </div>

        {/* Right: Embedded BetModal */}
        <div className="lg:col-span-5">
          <BetModal market={market} embedded />
        </div>
      </div>
    </div>
  );
}
