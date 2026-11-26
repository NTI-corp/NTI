"use client";

import React from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { BetModal } from "./BetModal";
import { TxStatusBanner } from "./TxStatusBanner";
import {
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
} from "@/lib/contracts";
import { formatBpsPercent, formatCountdown, formatEth } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import type { MarketItem } from "@/lib/types";

export function MarketDetailClient({ market }: { market: MarketItem }) {
  const { address, isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const addresses = getProtocolAddresses(activeChainId);

  const { data: marketChainData, refetch: refetchMarket } = useReadContract({
    address: addresses.narrativeMarket ?? undefined,
    abi: narrativeMarketAbi,
    functionName: "markets",
    args: [BigInt(market.marketId)],
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.narrativeMarket) },
  });

  const { data: positionChainData, refetch: refetchPosition } = useReadContract({
    address: addresses.narrativeMarket ?? undefined,
    abi: narrativeMarketAbi,
    functionName: "positions",
    args: address ? [BigInt(market.marketId), address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address && addresses.narrativeMarket) },
  });

  const { txState, isBusy, explorerBase, execute, resetTx } = useChainAction(async () => {
    await Promise.all([refetchMarket(), refetchPosition()]);
  });

  // Merge live on-chain pool & settlement status when available
  const onChainTuple = marketChainData as
    | readonly [
        number,
        number,
        number,
        number,
        number,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        number,
        boolean,
      ]
    | undefined;

  const poolAEth = onChainTuple ? Number(formatEther(onChainTuple[7])) : market.poolAEth;
  const poolBEth = onChainTuple ? Number(formatEther(onChainTuple[8])) : market.poolBEth;
  const settledOnChain = onChainTuple ? Boolean(onChainTuple[11]) : market.status === "settled" || market.status === "refunded";

  const posTuple = positionChainData as
    | readonly [bigint, bigint, bigint, bigint, boolean]
    | undefined;
  const posGross0 = posTuple ? Number(formatEther(posTuple[0])) : 0;
  const posGross1 = posTuple ? Number(formatEther(posTuple[2])) : 0;
  const posClaimed = posTuple ? Boolean(posTuple[4]) : false;
  const hasPosition = posGross0 > 0 || posGross1 > 0;

  const liveMarket: MarketItem = {
    ...market,
    poolAEth,
    poolBEth,
    status: settledOnChain
      ? (onChainTuple ? onChainTuple[10] === 3 : market.status === "refunded")
        ? "refunded"
        : "settled"
      : market.status,
  };

  const totalPool = liveMarket.poolAEth + liveMarket.poolBEth;
  const pctA = totalPool > 0 ? Math.round((liveMarket.poolAEth / totalPool) * 100) : 50;
  const pctB = 100 - pctA;

  const relA = market.currentIA !== null && market.baseIA > 0 ? market.currentIA / market.baseIA : null;
  const relB = market.currentIB !== null && market.baseIB > 0 ? market.currentIB / market.baseIB : null;
  const delta = relA !== null && relB !== null ? relA - relB : null;

  const invoke = async (fn: "settle" | "claim") => {
    if (!addresses.narrativeMarket) return;
    await execute(
      fn === "settle"
        ? `Settle Market #${market.marketId}`
        : `Claim payout for Market #${market.marketId}`,
      {
        address: addresses.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: fn,
        args: [BigInt(market.marketId)],
      },
      fn === "settle"
        ? `Market #${market.marketId} settled.`
        : `Payout claimed for Market #${market.marketId}.`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26262A] pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#71717A]">
            <Link href="/markets" className="hover:text-[#F5F5F7]">
              MARKETS
            </Link>
            <span>/</span>
            <span className="text-[#71717A]">MARKET #{market.marketId}</span>
          </div>
          <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-[#F5F5F7]">
            {market.narrativeALabel} vs {market.narrativeBLabel}
          </h1>
          <p className="mt-1 font-mono text-xs text-[#71717A]">
            Base Epoch #{market.baseEpoch} → Settlement Epoch #{market.settleEpoch} · Series S
            {market.seriesId} · {market.horizonLabel}
          </p>
        </div>

        {market.refundBound && (
          <div className="w-full border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-3 py-2 font-mono text-[11px] text-[#F59E0B]">
            The oracle series changed after this market opened (base series S{market.seriesId}). The settlement epoch
            will be in a later series, so the contract refunds every stake in full. Pick a newer market to trade.
          </div>
        )}
        <span
          className={`border px-3 py-1 font-mono text-xs font-semibold uppercase ${
            liveMarket.status === "open"
              ? "border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]"
              : liveMarket.status === "locked"
                ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                : "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]"
          }`}
        >
          {liveMarket.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Pool State, Settlement Formula & Actions */}
        <div className="space-y-5 lg:col-span-7">
          <div className="border border-[#26262A] bg-[#161618] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Parimutuel Pool Breakdown
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3 font-mono tabular-nums">
              <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                <div className="text-[10px] text-[#4ADE80]">SIDE A POOL</div>
                <div className="mt-1 text-base font-semibold text-[#F5F5F7]">
                  {formatEth(liveMarket.poolAEth, 4)}
                </div>
                <div className="text-[10px] text-[#71717A]">{pctA}% of total</div>
              </div>
              <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                <div className="text-[10px] text-[#CCFF00]">SIDE B POOL</div>
                <div className="mt-1 text-base font-semibold text-[#F5F5F7]">
                  {formatEth(liveMarket.poolBEth, 4)}
                </div>
                <div className="text-[10px] text-[#71717A]">{pctB}% of total</div>
              </div>
              <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                <div className="text-[10px] text-[#71717A]">POOL CAP USAGE</div>
                <div className="mt-1 text-base font-semibold text-[#F5F5F7]">
                  {formatEth(totalPool, 4)}
                </div>
                <div className="text-[10px] text-[#71717A]">Max {market.maxPoolEth} ETH</div>
              </div>
            </div>

            <div className="mt-3 flex h-2.5 w-full overflow-hidden bg-[#232325]">
              <div className="bg-[#4ADE80]" style={{ width: `${pctA}%` }} />
              <div className="bg-[#CCFF00]" style={{ width: `${pctB}%` }} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#26262A] pt-3 font-mono text-xs tabular-nums">
              <div>
                <span className="text-[#71717A]">BETTING CUTOFF</span>
                <div className="mt-0.5 text-[#F5F5F7]">
                  {liveMarket.status === "open"
                    ? `In ${formatCountdown(market.cutoffAt)}`
                    : `Closed (${market.cutoffEpochs} epochs prior)`}
                </div>
              </div>
              <div>
                <span className="text-[#71717A]">SETTLEMENT WINDOW</span>
                <div className="mt-0.5 text-[#F5F5F7]">
                  {settledOnChain
                    ? `Settled (${liveMarket.outcome ?? "resolved"})`
                    : `Target E${market.settleEpoch} (${formatCountdown(market.settleAt)})`}
                </div>
              </div>
            </div>
          </div>

          {/* Your On-Chain Position */}
          <div className="border border-[#26262A] bg-[#161618] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">Your Position</h2>
            {!isConnected ? (
              <p className="mt-2 text-xs text-[#71717A]">
                Connect wallet to inspect your active position on Market #{market.marketId}.
              </p>
            ) : !hasPosition ? (
              <p className="mt-2 text-xs text-[#71717A]">
                No stake recorded for this wallet on Market #{market.marketId} yet.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-xs tabular-nums">
                <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                  <div className="text-[10px] text-[#71717A]">SIDE A STAKE</div>
                  <div className="mt-1 text-sm font-semibold text-[#4ADE80]">
                    {formatEth(posGross0, 4)}
                  </div>
                </div>
                <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                  <div className="text-[10px] text-[#71717A]">SIDE B STAKE</div>
                  <div className="mt-1 text-sm font-semibold text-[#CCFF00]">
                    {formatEth(posGross1, 4)}
                  </div>
                </div>
                <div className="border border-[#26262A] bg-[#0D0D0E] p-3">
                  <div className="text-[10px] text-[#71717A]">PAYOUT STATUS</div>
                  <div className="mt-1 text-sm font-semibold text-[#F5F5F7]">
                    {posClaimed ? "Claimed" : settledOnChain ? "Ready to Claim" : "Pending Settle"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Relative Index Spread Tracker */}
          <div className="border border-[#26262A] bg-[#161618] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">Settlement Spread Formula</h2>
            <p className="mt-1 font-mono text-xs text-[#71717A]">
              Δ = I_A(E{market.settleEpoch}) / I_A(E{market.baseEpoch}) − I_B(E
              {market.settleEpoch}) / I_B(E{market.baseEpoch})
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 border border-[#26262A] bg-[#0D0D0E] p-3 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[10px] text-[#71717A]">{market.narrativeALabel}</div>
                <div className="mt-0.5 text-[#F5F5F7]">
                  {formatBpsPercent(market.baseIA)} → {market.currentIA === null ? "\u2014" : formatBpsPercent(market.currentIA)}
                </div>
                <div className="text-[10px] text-[#4ADE80]">Ratio {relA?.toFixed(4) ?? "\u2014"}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#71717A]">{market.narrativeBLabel}</div>
                <div className="mt-0.5 text-[#F5F5F7]">
                  {formatBpsPercent(market.baseIB)} → {market.currentIB === null ? "\u2014" : formatBpsPercent(market.currentIB)}
                </div>
                <div className="text-[10px] text-[#CCFF00]">Ratio {relB?.toFixed(4) ?? "\u2014"}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#71717A]">INDICATIVE Δ</div>
                <div
                  className={`mt-0.5 text-base font-semibold ${
                    delta !== null && delta >= 0 ? "text-[#4ADE80]" : "text-[#CCFF00]"
                  }`}
                >
                  {delta !== null && delta >= 0 ? "+" : ""}
                  {delta === null ? "\u2014" : `${(delta * 100).toFixed(2)}%`}
                </div>
                <div className="text-[10px] text-[#71717A]">
                  {delta !== null && delta > 0 ? "Side A leading" : delta !== null && delta < 0 ? "Side B leading" : delta === null ? "Index comparison unavailable" : "Tie"}
                </div>
              </div>
            </div>
          </div>

          {/* Permissionless Settle & Pull Claim */}
          <div className="border border-[#26262A] bg-[#161618] p-4">
            <h2 className="text-sm font-semibold text-[#F5F5F7]">
              Permissionless Settlement &amp; Payout Claim
            </h2>
            <p className="mt-1 text-xs text-[#71717A]">
              Anyone can call <code className="font-mono text-[#F5F5F7]">settle({market.marketId})</code> once Epoch #{market.settleEpoch} reaches final status (if it becomes incomplete, or once the on-chain timeout allows a refund). Winners and refund recipients withdraw via pull <code className="font-mono text-[#F5F5F7]">claim({market.marketId})</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={isBusy || settledOnChain}
                onClick={() => void invoke("settle")}
                className="border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-4 py-2 font-mono text-xs font-semibold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {settledOnChain ? "ALREADY SETTLED" : `SETTLE MARKET #${market.marketId}`}
              </button>
              <button
                type="button"
                disabled={isBusy || !settledOnChain || !hasPosition || posClaimed}
                onClick={() => void invoke("claim")}
                className="border border-[#4ADE80]/50 bg-[#4ADE80]/15 px-4 py-2 font-mono text-xs font-semibold text-[#4ADE80] transition-colors hover:bg-[#4ADE80]/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {posClaimed ? "PAYOUT CLAIMED" : "CLAIM PAYOUT / REFUND"}
              </button>
            </div>
            <div className="mt-3">
              <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
            </div>
          </div>
        </div>

        {/* Right: Embedded BetModal */}
        <div className="lg:col-span-5">
          {market.refundBound ? (
            <div className="border border-[#26262A] bg-[#161618] p-4 font-mono text-xs text-[#A1A1AA]">
              Betting is closed on this market because it can only refund. Open the markets list to trade a current pair.
            </div>
          ) : (
            <BetModal
              market={liveMarket}
              embedded
              onConfirmed={async () => {
                await Promise.all([refetchMarket(), refetchPosition()]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
