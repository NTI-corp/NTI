"use client";

import React, { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, parseEther } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  estimateTxGas,
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
  type GasEstimateDisplay,
} from "@/lib/contracts";
import { formatCountdown, formatEth } from "@/lib/format";
import { useSiweSession } from "./Providers";
import type { MarketItem } from "@/lib/types";

interface BetModalProps {
  market: MarketItem;
  initialSide?: 0 | 1;
  onClose?: () => void;
  embedded?: boolean;
}

const BASE_FEE_BPS = 10; // 0.10% = 10 bps

export function BetModal({
  market,
  initialSide = 0,
  onClose,
  embedded = false,
}: BetModalProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const { session } = useSiweSession();

  const [side, setSide] = useState<0 | 1>(initialSide);
  const [amountInput, setAmountInput] = useState("0.05");
  const [gasEstimate, setGasEstimate] = useState<GasEstimateDisplay | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const cutoffPassed = Date.now() >= new Date(market.cutoffAt).getTime() || market.status !== "open";
  const grossEth = Math.max(0, Number.parseFloat(amountInput) || 0);
  const discountBps = session?.discountBps ?? 0;

  const math = useMemo(() => {
    const effectiveFeeBps = BASE_FEE_BPS * (1 - discountBps / 10_000);
    const feeEth = (grossEth * effectiveFeeBps) / 10_000;
    const netEth = Math.max(0, grossEth - feeEth);

    const sidePoolBefore = side === 0 ? market.poolAEth : market.poolBEth;
    const totalPoolAfter = market.poolAEth + market.poolBEth + netEth;
    const sidePoolAfter = sidePoolBefore + netEth;
    const estPayout =
      sidePoolAfter > 0 ? (netEth * totalPoolAfter) / sidePoolAfter : 0;
    const impliedMultiple = netEth > 0 ? estPayout / netEth : 0;
    const exceedsCap = totalPoolAfter > market.maxPoolEth;

    return {
      effectiveFeeBps,
      feeEth,
      netEth,
      estPayout,
      impliedMultiple,
      exceedsCap,
    };
  }, [grossEth, discountBps, side, market.poolAEth, market.poolBEth, market.maxPoolEth]);

  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);

  useEffect(() => {
    let active = true;
    const runEstimate = async () => {
      let data: `0x${string}` | undefined;
      let value = 0n;
      try {
        if (grossEth > 0) {
          value = parseEther(grossEth.toFixed(6));
          data = encodeFunctionData({
            abi: narrativeMarketAbi,
            functionName: "bet",
            args: [BigInt(market.marketId), side],
          });
        }
      } catch {
        // invalid decimal input
      }
      const est = await estimateTxGas(publicClient, {
        account: address,
        to: addresses.narrativeMarket,
        data,
        value,
        fallbackGasLimit: 165_000n,
      });
      if (active) setGasEstimate(est);
    };
    void runEstimate();
    return () => {
      active = false;
    };
  }, [publicClient, address, addresses.narrativeMarket, market.marketId, side, grossEth]);

  const handleSubmit = async () => {
    setTxError(null);
    setTxStatus(null);
    if (cutoffPassed) {
      setTxError("Betting cutoff (2 epochs / 8h before settlement) has passed.");
      return;
    }
    if (grossEth < 0.001) {
      setTxError("Minimum bet is 0.001 ETH.");
      return;
    }
    if (math.exceedsCap) {
      setTxError(`Pool cap exceeded (max ${market.maxPoolEth} ETH per market).`);
      return;
    }
    if (!isConnected) {
      setTxError("Connect your wallet in the top bar first.");
      return;
    }
    if (!addresses.narrativeMarket) {
      setTxError("NarrativeMarket contract address not yet deployed on this chain.");
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: addresses.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: "bet",
        args: [BigInt(market.marketId), side],
        value: parseEther(grossEth.toFixed(6)),
      });
      setTxStatus(`Bet transaction submitted: ${hash}`);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction rejected");
    }
  };

  const content = (
    <div className="panel-surface rounded-md p-4">
      <div className="mb-3 flex items-center justify-between border-b border-[#1B2028] pb-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#EDF1F7]">
            Place Parimutuel Bet · Market #{market.marketId}
          </h3>
          <p className="font-mono text-[11px] text-[#8A96A8]">
            {market.narrativeALabel} vs {market.narrativeBLabel} · {market.horizonLabel}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#1B2028] px-2 py-1 font-mono text-[11px] text-[#8A96A8] hover:text-[#EDF1F7]"
          >
            ESC
          </button>
        )}
      </div>

      {/* Cutoff status */}
      {cutoffPassed ? (
        <div className="mb-3 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 font-mono text-[11px] text-[#F59E0B]">
          BETTING LOCKED · 8-hour pre-settlement cutoff has passed. New bets are rejected by contract.
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-1.5 font-mono text-[11px]">
          <span className="text-[#8A96A8]">BETTING CUTOFF IN</span>
          <span className="text-[#10B981] tabular-nums">
            {formatCountdown(market.cutoffAt)}
          </span>
        </div>
      )}

      {/* Side Selection */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide(0)}
          className={`rounded border px-3 py-2.5 text-left transition-colors ${
            side === 0
              ? "border-[#10B981]/60 bg-[#10B981]/12 text-[#EDF1F7]"
              : "border-[#1B2028] bg-[#0B0E13] text-[#8A96A8] hover:border-[#2A3342]"
          }`}
        >
          <div className="font-mono text-[10px] text-[#10B981]">SIDE A OUTPERFORMS</div>
          <div className="mt-0.5 font-display text-xs font-semibold">
            {market.narrativeALabel}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#8A96A8] tabular-nums">
            Pool: {formatEth(market.poolAEth, 3)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSide(1)}
          className={`rounded border px-3 py-2.5 text-left transition-colors ${
            side === 1
              ? "border-[#38BDF8]/60 bg-[#38BDF8]/12 text-[#EDF1F7]"
              : "border-[#1B2028] bg-[#0B0E13] text-[#8A96A8] hover:border-[#2A3342]"
          }`}
        >
          <div className="font-mono text-[10px] text-[#38BDF8]">SIDE B OUTPERFORMS</div>
          <div className="mt-0.5 font-display text-xs font-semibold">
            {market.narrativeBLabel}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#8A96A8] tabular-nums">
            Pool: {formatEth(market.poolBEth, 3)}
          </div>
        </button>
      </div>

      {/* Amount Input */}
      <div className="mt-3">
        <div className="flex items-center justify-between font-mono text-[11px] text-[#8A96A8]">
          <label htmlFor={`bet-amt-${market.marketId}`}>GROSS STAKE (ETH)</label>
          <span>MIN 0.001 ETH · CAP {market.maxPoolEth} ETH</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id={`bet-amt-${market.marketId}`}
            type="number"
            min="0.001"
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={cutoffPassed}
            className="w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-sm text-[#EDF1F7] tabular-nums focus:border-[#38BDF8] focus:outline-none disabled:opacity-50"
          />
          {["0.05", "0.25", "0.5"].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={cutoffPassed}
              onClick={() => setAmountInput(preset)}
              className="rounded border border-[#1B2028] bg-[#131820] px-2.5 py-2 font-mono text-xs text-[#8A96A8] hover:text-[#EDF1F7] disabled:opacity-40"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Fee, Discount & Parimutuel Breakdown */}
      <div className="mt-3 space-y-1.5 rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-[11px] tabular-nums">
        <div className="flex justify-between">
          <span className="text-[#8A96A8]">Gross stake</span>
          <span className="text-[#EDF1F7]">{formatEth(grossEth, 4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#8A96A8]">
            Protocol fee (0.10% base · {(discountBps / 100).toFixed(0)}% staker discount)
          </span>
          <span className="text-[#EDF1F7]">
            {formatEth(math.feeEth, 5)} ({(math.effectiveFeeBps / 100).toFixed(3)}%)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#8A96A8]">Net pool stake</span>
          <span className="text-[#EDF1F7]">{formatEth(math.netEth, 4)}</span>
        </div>
        <div className="flex justify-between border-t border-[#1B2028] pt-1.5">
          <span className="text-[#8A96A8]">Est. parimutuel payout (if side wins)</span>
          <span className="font-semibold text-[#10B981]">
            {formatEth(math.estPayout, 4)} ({math.impliedMultiple.toFixed(2)}x)
          </span>
        </div>
        {gasEstimate && (
          <div className="flex justify-between border-t border-[#1B2028] pt-1.5">
            <span className="text-[#8A96A8]">
              Est. gas ({gasEstimate.gasPriceGwei} gwei · {gasEstimate.gasLimit} units)
            </span>
            <span
              className={
                gasEstimate.elevatedFeeWarning ? "text-[#F59E0B]" : "text-[#8A96A8]"
              }
            >
              ~{gasEstimate.estimatedCostEth} ETH
            </span>
          </div>
        )}
      </div>

      {gasEstimate?.elevatedFeeWarning && (
        <p className="mt-2 font-mono text-[10px] text-[#F59E0B]">
          Elevated Robinhood Chain gas detected ({gasEstimate.gasPriceGwei} gwei). Confirm total tx cost before signing.
        </p>
      )}

      {txError && (
        <div className="mt-2.5 rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 font-mono text-[11px] text-[#EF4444]">
          {txError}
        </div>
      )}

      {txStatus && (
        <div className="mt-2.5 rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-[11px] text-[#10B981]">
          {txStatus}
        </div>
      )}

      <button
        type="button"
        disabled={cutoffPassed || isPending || math.exceedsCap}
        onClick={() => void handleSubmit()}
        className="mt-3 w-full rounded border border-[#10B981]/50 bg-[#10B981]/15 py-2.5 font-mono text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {cutoffPassed
          ? "BETTING CLOSED"
          : isPending
            ? "AWAITING WALLET CONFIRMATION..."
            : `CONFIRM BET ON ${side === 0 ? market.narrativeALabel.toUpperCase() : market.narrativeBLabel.toUpperCase()}`}
      </button>

      <p className="mt-2 font-mono text-[10px] text-[#556173]">
        Full gross refund if opposing pool is empty, Δ = 0, seriesId re-baselines, or settlement epoch is incomplete/timed out (48h).
      </p>
    </div>
  );

  if (embedded) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md">{content}</div>
    </div>
  );
}
