"use client";

import React, { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract } from "wagmi";
import { TxStatusBanner } from "@/components/TxStatusBanner";
import { ModalShell } from "@/components/ui/ModalShell";
import {
  estimateTxGas,
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
  type GasEstimateDisplay,
} from "@/lib/contracts";
import { formatCountdown, formatEth } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import { useSiweSession } from "./Providers";
import type { MarketItem } from "@/lib/types";

interface BetModalProps {
  market: MarketItem;
  initialSide?: 0 | 1;
  onClose?: () => void;
  onConfirmed?: () => Promise<void> | void;
  embedded?: boolean;
}

const DEFAULT_MIN_BET_WEI = 1_000_000_000_000_000n; // 0.001 ETH

function safeParseEther(raw: string): bigint | null {
  const clean = raw.trim();
  if (!clean || !/^\d+(\.\d{1,18})?$/.test(clean)) return null;
  try {
    return parseEther(clean);
  } catch {
    return null;
  }
}

export function BetModal({
  market,
  initialSide = 0,
  onClose,
  onConfirmed,
  embedded = false,
}: BetModalProps) {
  const { address, isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const addresses = getProtocolAddresses(activeChainId);
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { session } = useSiweSession();

  const [side, setSide] = useState<0 | 1>(initialSide);
  const [amountInput, setAmountInput] = useState("0.01");
  const [gasEstimate, setGasEstimate] = useState<GasEstimateDisplay | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setSide(initialSide);
    setValidationError(null);
  }, [market.marketId, initialSide]);

  const { data: ethBalanceData, refetch: refetchBalance } = useBalance({
    address,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: minBetOnChain } = useReadContract({
    address: addresses.narrativeMarket ?? undefined,
    abi: narrativeMarketAbi,
    functionName: "minBet",
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.narrativeMarket) },
  });

  const { txState, isBusy, wrongChain, targetChainId, explorerBase, execute, resetTx } =
    useChainAction(async () => {
      await refetchBalance();
      if (onConfirmed) await onConfirmed();
    });

  const minBetWei = (minBetOnChain as bigint | undefined) ?? DEFAULT_MIN_BET_WEI;
  const minBetEth = Number(formatEther(minBetWei));
  const ethBalanceWei = ethBalanceData?.value ?? 0n;

  const cutoffPassed =
    Date.now() >= new Date(market.cutoffAt).getTime() || market.status !== "open";
  const stakeWei = safeParseEther(amountInput);
  const grossEth =
    stakeWei !== null && Number.isFinite(Number(formatEther(stakeWei)))
      ? Number(formatEther(stakeWei))
      : 0;
  const discountBps = session?.discountBps ?? 0;

  const math = useMemo(() => {
    const effectiveFeeBps = market.feeBps * (1 - discountBps / 10_000);
    const feeEth = (grossEth * effectiveFeeBps) / 10_000;
    const netEth = Math.max(0, grossEth - feeEth);

    const sidePoolBefore = side === 0 ? market.poolANetEth : market.poolBNetEth;
    const otherPoolBefore = side === 0 ? market.poolBNetEth : market.poolANetEth;
    const totalNetAfter = market.poolANetEth + market.poolBNetEth + netEth;
    const sidePoolAfter = sidePoolBefore + netEth;
    const estPayout = otherPoolBefore === 0
      ? grossEth
      : sidePoolAfter > 0 ? (netEth * totalNetAfter) / sidePoolAfter : 0;
    const impliedMultiple = grossEth > 0 ? estPayout / grossEth : 0;
    const grossPoolAfter = market.poolAEth + market.poolBEth + grossEth;
    const exceedsCap = grossPoolAfter > market.maxPoolEth;

    return {
      effectiveFeeBps,
      feeEth,
      netEth,
      estPayout,
      impliedMultiple,
      exceedsCap,
    };
  }, [grossEth, discountBps, side, market, market.maxPoolEth]);

  useEffect(() => {
    let active = true;
    const runEstimate = async () => {
      let data: `0x${string}` | undefined;
      let value = 0n;
      if (stakeWei && stakeWei > 0n) {
        value = stakeWei;
        data = encodeFunctionData({
          abi: narrativeMarketAbi,
          functionName: "bet",
          args: [BigInt(market.marketId), side],
        });
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
  }, [publicClient, address, addresses.narrativeMarket, market.marketId, side, stakeWei]);

  const insufficientBalance =
    isConnected && stakeWei !== null && stakeWei > 0n && stakeWei > ethBalanceWei;

  const handleSubmit = async () => {
    setValidationError(null);
    if (cutoffPassed) {
      setValidationError(
        `Betting cutoff (${market.cutoffEpochs} epochs before settlement) has passed.`,
      );
      return;
    }
    if (!stakeWei || stakeWei <= 0n) {
      setValidationError("Enter a valid ETH amount.");
      return;
    }
    if (stakeWei < minBetWei) {
      setValidationError(`Minimum bet is ${minBetEth} ETH.`);
      return;
    }
    if (math.exceedsCap) {
      setValidationError(`Pool cap exceeded (max ${market.maxPoolEth} ETH per market).`);
      return;
    }
    if (!isConnected || !address) {
      setValidationError("Connect your wallet in the top bar first.");
      return;
    }
    if (insufficientBalance) {
      setValidationError("Insufficient ETH wallet balance.");
      return;
    }
    if (!addresses.narrativeMarket) {
      setValidationError("NarrativeMarket contract address not configured on this chain.");
      return;
    }

    await execute(
      `Bet ${grossEth.toFixed(4)} ETH on ${side === 0 ? market.narrativeALabel : market.narrativeBLabel}`,
      {
        address: addresses.narrativeMarket,
        abi: narrativeMarketAbi,
        functionName: "bet",
        args: [BigInt(market.marketId), side],
        value: stakeWei,
      },
      `Bet placed on Market #${market.marketId}.`,
    );
  };

  const content = (
    <div className={embedded ? "border border-[#26262A] bg-[#161618] p-4" : "p-5"}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#26262A] pb-3">
        <div className="min-w-0">
          <h3 id={`bet-modal-title-${market.marketId}`} className="text-sm font-semibold text-[#F5F5F7]">
            Place Parimutuel Bet · Market #{market.marketId}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] text-[#71717A]">
            {market.narrativeALabel} vs {market.narrativeBLabel} · {market.horizonLabel}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            aria-label="Close bet modal"
            className="shrink-0 cursor-pointer border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA] transition-colors hover:border-[#3A3A40] hover:text-[#F5F5F7] disabled:opacity-40"
          >
            ESC
          </button>
        )}
      </div>

      {wrongChain && (
        <div className="mb-3 border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 font-mono text-[11px] text-[#F59E0B]">
          Wallet will auto-switch to Chain {targetChainId} when submitting bet.
        </div>
      )}

      {/* Cutoff status */}
      {cutoffPassed ? (
        <div className="mb-3 border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 font-mono text-[11px] text-[#F59E0B]">
          BETTING LOCKED · Pre-settlement cutoff has passed. New bets are rejected by contract.
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-[11px]">
          <span className="text-[#71717A]">BETTING CUTOFF IN</span>
          <span className="font-semibold text-[#4ADE80] tabular-nums">
            {formatCountdown(market.cutoffAt)}
          </span>
        </div>
      )}

      {/* Side Selection */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide(0)}
          className={`border px-3 py-2.5 text-left transition-colors ${
            side === 0
              ? "border-[#4ADE80]/60 bg-[#4ADE80]/12 text-[#F5F5F7]"
              : "border-[#26262A] bg-[#0D0D0E] text-[#71717A] hover:border-[#3A3A40]"
          }`}
        >
          <div className="font-mono text-[10px] font-medium text-[#4ADE80]">
            SIDE A OUTPERFORMS
          </div>
          <div className="mt-0.5 text-xs font-semibold text-[#F5F5F7]">
            {market.narrativeALabel}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#71717A] tabular-nums">
            Pool: {formatEth(market.poolAEth, 4)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSide(1)}
          className={`border px-3 py-2.5 text-left transition-colors ${
            side === 1
              ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
              : "border-[#26262A] bg-[#0D0D0E] text-[#71717A] hover:border-[#3A3A40]"
          }`}
        >
          <div className="font-mono text-[10px] font-medium text-[#CCFF00]">
            SIDE B OUTPERFORMS
          </div>
          <div className="mt-0.5 text-xs font-semibold text-[#F5F5F7]">
            {market.narrativeBLabel}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#71717A] tabular-nums">
            Pool: {formatEth(market.poolBEth, 4)}
          </div>
        </button>
      </div>

      {/* Amount Input */}
      <div className="mt-3">
        <div className="flex items-center justify-between font-mono text-[11px] text-[#71717A]">
          <label htmlFor={`bet-amt-${market.marketId}`}>GROSS STAKE (ETH)</label>
          <span className="tabular-nums">
            {isConnected
              ? `BAL: ${Number(formatEther(ethBalanceWei)).toFixed(4)} ETH`
              : `MIN ${minBetEth} ETH · CAP ${market.maxPoolEth} ETH`}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id={`bet-amt-${market.marketId}`}
            type="number"
            min={minBetEth}
            step="0.005"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={cutoffPassed}
            className="w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-sm text-[#F5F5F7] tabular-nums focus:border-[#CCFF00] focus:outline-none disabled:opacity-50"
          />
          {["0.005", "0.02", "0.1"].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={cutoffPassed}
              onClick={() => setAmountInput(preset)}
              className="border border-[#26262A] bg-[#111113] px-2.5 py-2 font-mono text-xs text-[#71717A] hover:text-[#F5F5F7] disabled:opacity-40"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Fee, Discount & Parimutuel Breakdown */}
      <div className="mt-3 space-y-1.5 border border-[#26262A] bg-[#0D0D0E] p-3 font-mono text-[11px] tabular-nums">
        <div className="flex justify-between">
          <span className="text-[#71717A]">Gross stake</span>
          <span className="text-[#F5F5F7]">{formatEth(grossEth, 4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#71717A]">
            Protocol fee ({(market.feeBps / 100).toFixed(3)}% base · {(discountBps / 100).toFixed(0)}% staker discount)
          </span>
          <span className="text-[#F5F5F7]">
            {formatEth(math.feeEth, 5)} ({(math.effectiveFeeBps / 100).toFixed(3)}%)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#71717A]">Net pool stake</span>
          <span className="text-[#F5F5F7]">{formatEth(math.netEth, 4)}</span>
        </div>
        <div className="flex justify-between border-t border-[#26262A] pt-1.5">
          <span className="text-[#71717A]">Est. parimutuel payout (if side wins)</span>
          <span className="font-semibold text-[#4ADE80]">
            {formatEth(math.estPayout, 4)} ({math.impliedMultiple.toFixed(2)}x)
          </span>
        </div>
        {gasEstimate && (
          <div className="flex justify-between border-t border-[#26262A] pt-1.5">
            <span className="text-[#71717A]">
              Est. gas ({gasEstimate.gasPriceGwei} gwei · {gasEstimate.gasLimit} units)
            </span>
            <span
              className={
                gasEstimate.elevatedFeeWarning ? "text-[#F59E0B]" : "text-[#71717A]"
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

      {validationError && (
        <div className="mt-2.5 border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
          {validationError}
        </div>
      )}

      <div className="mt-2.5">
        <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
      </div>

      <button
        type="button"
        disabled={cutoffPassed || isBusy || math.exceedsCap || insufficientBalance}
        onClick={() => void handleSubmit()}
        className="mt-3 w-full bg-[#4ADE80] py-2.5 font-mono text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {cutoffPassed
          ? "BETTING CLOSED"
          : insufficientBalance
            ? "INSUFFICIENT ETH BALANCE"
            : isBusy
              ? "PROCESSING TRANSACTION..."
              : `CONFIRM BET ON ${side === 0 ? market.narrativeALabel.toUpperCase() : market.narrativeBLabel.toUpperCase()}`}
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-[#71717A]">
        Full gross refund if either pool is empty, Δ = 0, seriesId re-baselines, or settlement epoch is incomplete/timed out ({market.settleTimeoutHours}h).
      </p>
    </div>
  );

  if (embedded) return content;

  return (
    <ModalShell
      open
      onClose={() => onClose?.()}
      canClose={!isBusy}
      labelledBy={`bet-modal-title-${market.marketId}`}
    >
      {content}
    </ModalShell>
  );
}
