"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract } from "wagmi";
import { TxStatusBanner } from "@/components/TxStatusBanner";
import {
  basketAbi,
  estimateTxGas,
  getActiveChainId,
  type GasEstimateDisplay,
} from "@/lib/contracts";
import { formatBpsPercent, formatEth, formatRelativeTime, truncateHex } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import type { BasketItem } from "@/lib/types";

interface BasketVaultClientProps {
  basket: BasketItem;
}

const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1_000_000n;

function safeParseEther(val: string): bigint | null {
  const clean = val.trim();
  if (!clean || !/^\d+(\.\d+)?$/.test(clean)) return null;
  try {
    return parseEther(clean);
  } catch {
    return null;
  }
}

export function BasketVaultClient({ basket }: BasketVaultClientProps) {
  const [mode, setMode] = useState<"deposit" | "redeem">("deposit");
  const [amount, setAmount] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState("150");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [gasEst, setGasEst] = useState<GasEstimateDisplay | null>(null);

  const { address, isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const publicClient = usePublicClient({ chainId: activeChainId });
  const vaultAddress = basket.basketAddress as Address;
  const hasVaultAddress = /^0x[0-9a-fA-F]{40}$/.test(basket.basketAddress);

  const { data: ethBalanceData, refetch: refetchEth } = useBalance({
    address,
    chainId: activeChainId,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: navOnChain, refetch: refetchNav } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "totalNavWeth",
    chainId: activeChainId,
    query: { enabled: hasVaultAddress },
  });

  const { data: totalSupplyOnChain, refetch: refetchSupply } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "totalSupply",
    chainId: activeChainId,
    query: { enabled: hasVaultAddress },
  });

  const { data: userSharesOnChain, refetch: refetchUserShares } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(hasVaultAddress && isConnected && address) },
  });

  const { data: pausedOnChain, refetch: refetchPaused } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "paused",
    chainId: activeChainId,
    query: { enabled: hasVaultAddress },
  });

  const { data: maxTvlOnChain } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "maxTVL",
    chainId: activeChainId,
    query: { enabled: hasVaultAddress },
  });

  const { data: constituentsOnChain, refetch: refetchConstituents } = useReadContract({
    address: vaultAddress,
    abi: basketAbi,
    functionName: "constituents",
    chainId: activeChainId,
    query: { enabled: hasVaultAddress },
  });

  const { txState, isBusy, wrongChain, targetChainId, explorerBase, execute, resetTx } =
    useChainAction(async () => {
      await Promise.all([
        refetchEth(),
        refetchNav(),
        refetchSupply(),
        refetchUserShares(),
        refetchPaused(),
        refetchConstituents(),
      ]);
    });

  useEffect(() => {
    let mounted = true;
    void estimateTxGas(publicClient, { fallbackGasLimit: 240_000n }).then((est) => {
      if (mounted) setGasEst(est);
    });
    return () => {
      mounted = false;
    };
  }, [publicClient]);

  // Live chain values with fallback to SSR snapshot while loading
  const navWei =
    (navOnChain as bigint | undefined) ?? safeParseEther(String(basket.navEth)) ?? 0n;
  const supplyWei = (totalSupplyOnChain as bigint | undefined) ?? 0n;
  const userSharesWei = (userSharesOnChain as bigint | undefined) ?? 0n;
  const ethBalanceWei = ethBalanceData?.value ?? 0n;
  const isPaused = Boolean(pausedOnChain);
  const maxTvlWei =
    (maxTvlOnChain as bigint | undefined) ?? safeParseEther(String(basket.tvlCapEth)) ?? 0n;

  const constituentCount = constituentsOnChain
    ? ((constituentsOnChain as readonly [readonly Address[], readonly number[]])[0]?.length ?? 0)
    : basket.holdings.length;
  const allocationConfigured = constituentCount > 0;

  const rawSlip = Number(slippageBps);
  const clampedSlip = Number.isFinite(rawSlip)
    ? Math.min(300, Math.max(10, Math.round(rawSlip)))
    : 150;

  const amtWei = safeParseEther(amount) ?? 0n;

  // Exact Solidity virtual-offset share math (Basket.sol):
  // deposit: shares = (addedNav * (totalSupply + VIRTUAL_SHARES)) / (navBefore + VIRTUAL_ASSETS)
  // redeem:  ethOut = (shares * (navBefore + VIRTUAL_ASSETS)) / (totalSupply + VIRTUAL_SHARES)
  const estSharesOutWei =
    amtWei > 0n ? (amtWei * (supplyWei + VIRTUAL_SHARES)) / (navWei + VIRTUAL_ASSETS) : 0n;
  const minSharesOutWei = (estSharesOutWei * BigInt(10_000 - clampedSlip)) / 10_000n;

  const estEthOutWei =
    amtWei > 0n && supplyWei + VIRTUAL_SHARES > 0n
      ? (amtWei * (navWei + VIRTUAL_ASSETS)) / (supplyWei + VIRTUAL_SHARES)
      : 0n;
  const minEthOutWei = (estEthOutWei * BigInt(10_000 - clampedSlip)) / 10_000n;

  const navEthLive = Number(formatEther(navWei));
  const tvlCapEthLive = Number(formatEther(maxTvlWei));
  const capPct = tvlCapEthLive > 0 ? Math.min(100, (navEthLive / tvlCapEthLive) * 100) : 0;
  const exceedsTvlCap = maxTvlWei > 0n && navWei + amtWei > maxTvlWei;
  const insufficientEth = mode === "deposit" && isConnected && amtWei > ethBalanceWei;
  const insufficientShares = mode === "redeem" && isConnected && amtWei > userSharesWei;

  async function handleExecute() {
    setValidationError(null);
    if (!hasVaultAddress) {
      setValidationError("Vault contract address is invalid or not configured.");
      return;
    }
    if (!isConnected || !address) {
      setValidationError("Connect an EVM wallet first.");
      return;
    }
    if (amtWei <= 0n) {
      setValidationError("Enter an amount greater than 0.");
      return;
    }
    if (rawSlip < 10 || rawSlip > 300 || !Number.isFinite(rawSlip)) {
      setValidationError("Max slippage tolerance must be between 10 bps (0.1%) and 300 bps (3.0%).");
      return;
    }

    if (mode === "deposit") {
      if (isPaused) {
        setValidationError("Deposits are currently paused on this vault. Redeem stays open.");
        return;
      }
      if (!allocationConfigured) {
        setValidationError("Allocation pending on-chain setup: vault has 0 whitelisted constituents.");
        return;
      }
      if (exceedsTvlCap) {
        setValidationError(
          `Deposit would exceed vault max TVL (${tvlCapEthLive.toFixed(2)} ETH).`,
        );
        return;
      }
      if (insufficientEth) {
        setValidationError("Insufficient ETH wallet balance.");
        return;
      }

      await execute(
        `Deposit ${Number(formatEther(amtWei)).toFixed(4)} ETH into ${basket.symbol}`,
        {
          address: vaultAddress,
          abi: basketAbi,
          functionName: "deposit",
          args: [minSharesOutWei],
          value: amtWei,
        },
        `Deposited into ${basket.symbol} vault.`,
      );
      return;
    }

    if (insufficientShares) {
      setValidationError(
        `Insufficient ${basket.symbol} balance (${Number(formatEther(userSharesWei)).toFixed(4)} available).`,
      );
      return;
    }

    await execute(
      `Redeem ${Number(formatEther(amtWei)).toFixed(4)} ${basket.symbol}`,
      {
        address: vaultAddress,
        abi: basketAbi,
        functionName: "redeem",
        args: [amtWei, minEthOutWei],
      },
      `Redeemed ${basket.symbol} for ETH.`,
    );
  }

  const depositBlocked =
    mode === "deposit" &&
    (isPaused || !allocationConfigured || exceedsTvlCap || insufficientEth || amtWei <= 0n);
  const redeemBlocked = mode === "redeem" && (insufficientShares || amtWei <= 0n);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link href="/baskets" className="font-mono text-[#A1A1AA] hover:text-[#F4F4F5]">
          ← All Narrative Baskets
        </Link>
        {wrongChain && (
          <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
            AUTO-SWITCHES TO CHAIN {targetChainId} ON TX
          </span>
        )}
      </div>

      {/* Vault Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#24242C] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="rounded border border-[#6366F1]/40 bg-[#6366F1]/15 px-2 py-0.5 text-[#A5B4FC]">
              {basket.symbol}
            </span>
            <span className="text-[#71717A]">{basket.narrativeLabel}</span>
            <span className="text-[#52525B]">·</span>
            <span className="text-[#A1A1AA]">{truncateHex(basket.basketAddress, 6, 4)}</span>
            {isPaused && (
              <span className="rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-2 py-0.5 text-[10px] text-[#F87171]">
                DEPOSITS PAUSED
              </span>
            )}
            {!allocationConfigured && (
              <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] text-[#F59E0B]">
                ALLOCATION PENDING
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            {basket.name}
          </h1>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Rebalanced {formatRelativeTime(basket.lastRebalancedAt)} · Mgmt Fee{" "}
            {formatBpsPercent(basket.managementFeeBps, 2)}/yr · Slippage absorbed by depositor
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 text-right font-mono tabular-nums">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Live Vault NAV
            </div>
            <div className="mt-0.5 text-base font-semibold text-[#F4F4F5]">
              {formatEth(navEthLive, 4)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Your Shares
            </div>
            <div className="mt-0.5 text-base font-semibold text-[#A5B4FC]">
              {isConnected ? `${Number(formatEther(userSharesWei)).toFixed(4)}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              TVL Cap Used
            </div>
            <div className="mt-0.5 text-base font-semibold text-[#22C55E]">
              {capPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Whitelisted Holdings */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-lg border border-[#24242C] bg-[#131317]">
            <div className="border-b border-[#24242C] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#F4F4F5]">
                Whitelisted Constituents (Uniswap V3 TWAP Priced)
              </h2>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                Every token requires governance whitelist approval, ≥20 ETH V3 liquidity, and 30-minute TWAP cardinality.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24242C] bg-[#19191F] font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                    <th className="px-4 py-2.5">Token</th>
                    <th className="px-4 py-2.5 text-right">Target Weight</th>
                    <th className="px-4 py-2.5 text-right">30m TWAP</th>
                    <th className="px-4 py-2.5 text-right">V3 Pool Depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#24242C] font-mono tabular-nums">
                  {basket.holdings.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center font-sans text-xs text-[#A1A1AA]"
                      >
                        Allocation pending on-chain setup. Governance must configure whitelisted V3 tokens via{" "}
                        <span className="font-mono text-[#F4F4F5]">setAllocation()</span> before deposits open.
                      </td>
                    </tr>
                  ) : (
                    basket.holdings.map((h) => (
                      <tr key={h.address} className="transition-colors hover:bg-[#19191F]/60">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#F4F4F5]">${h.symbol}</div>
                          <div className="text-[10px] text-[#71717A]">
                            {h.name} · {truncateHex(h.address, 6, 4)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-[#A5B4FC]">
                          {formatBpsPercent(h.weightBps, 1)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#F4F4F5]">
                          {h.twap30mEth.toFixed(5)} ETH
                        </td>
                        <td className="px-4 py-3 text-right text-[#22C55E]">
                          {h.liquidityEth.toFixed(1)} ETH
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Deposit / Redeem Form */}
        <div className="h-fit rounded-lg border border-[#24242C] bg-[#131317] p-4 lg:col-span-5">
          <div className="grid grid-cols-2 gap-1 rounded-md border border-[#24242C] bg-[#0B0B0E] p-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => {
                setMode("deposit");
                setValidationError(null);
              }}
              className={`rounded py-2 font-semibold transition-colors ${
                mode === "deposit"
                  ? "bg-[#22C55E]/15 text-[#22C55E]"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5]"
              }`}
            >
              DEPOSIT ETH
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("redeem");
                setValidationError(null);
              }}
              className={`rounded py-2 font-semibold transition-colors ${
                mode === "redeem"
                  ? "bg-[#6366F1]/20 text-[#A5B4FC]"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5]"
              }`}
            >
              REDEEM {basket.symbol}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between font-mono text-[11px] text-[#A1A1AA]">
                <label>
                  {mode === "deposit" ? "DEPOSIT AMOUNT (ETH)" : `SHARES TO REDEEM (${basket.symbol})`}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "deposit") {
                      const safeEth = Math.max(0, Number(formatEther(ethBalanceWei)) - 0.005);
                      setAmount(safeEth > 0 ? safeEth.toFixed(4) : "0");
                    } else {
                      setAmount(formatEther(userSharesWei));
                    }
                  }}
                  className="text-[10px] text-[#A5B4FC] hover:underline tabular-nums"
                >
                  MAX:{" "}
                  {mode === "deposit"
                    ? `${Number(formatEther(ethBalanceWei)).toFixed(4)} ETH`
                    : `${Number(formatEther(userSharesWei)).toFixed(4)} ${basket.symbol}`}
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#24242C] bg-[#0B0B0E] px-3 py-2 font-mono text-sm text-[#F4F4F5] tabular-nums focus:border-[#6366F1] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between font-mono text-[11px] text-[#A1A1AA]">
                <label>MAX SLIPPAGE TOLERANCE (10..300 BPS)</label>
                <span className="tabular-nums">{(clampedSlip / 100).toFixed(2)}%</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  className="w-full rounded-md border border-[#24242C] bg-[#0B0B0E] px-3 py-1.5 font-mono text-xs text-[#F4F4F5] tabular-nums focus:border-[#6366F1] focus:outline-none"
                />
                {["50", "150", "300"].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSlippageBps(b)}
                    className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                      slippageBps === b
                        ? "border-[#6366F1]/60 bg-[#6366F1]/15 text-[#F4F4F5]"
                        : "border-[#24242C] bg-[#19191F] text-[#A1A1AA] hover:text-[#F4F4F5]"
                    }`}
                  >
                    {(Number(b) / 100).toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 rounded-md border border-[#24242C] bg-[#0B0B0E] p-3 font-mono text-[11px] tabular-nums">
              {mode === "deposit" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Est. shares minted</span>
                    <span className="text-[#F4F4F5]">
                      {Number(formatEther(estSharesOutWei)).toFixed(4)} {basket.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Min shares out (slippage floor)</span>
                    <span className="text-[#22C55E]">
                      {Number(formatEther(minSharesOutWei)).toFixed(4)} {basket.symbol}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Est. ETH returned</span>
                    <span className="text-[#F4F4F5]">
                      {formatEth(Number(formatEther(estEthOutWei)), 5)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Min ETH out (slippage floor)</span>
                    <span className="text-[#A5B4FC]">
                      {formatEth(Number(formatEther(minEthOutWei)), 5)}
                    </span>
                  </div>
                </>
              )}
              {gasEst && (
                <div className="flex justify-between border-t border-[#24242C] pt-1.5">
                  <span className="text-[#71717A]">Est. gas ({gasEst.gasPriceGwei} gwei)</span>
                  <span className="text-[#A1A1AA]">~{gasEst.estimatedCostEth} ETH</span>
                </div>
              )}
            </div>

            {validationError && (
              <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
                {validationError}
              </div>
            )}

            <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />

            <button
              type="button"
              disabled={isBusy || !isConnected || depositBlocked || redeemBlocked}
              onClick={() => void handleExecute()}
              className={`w-full rounded-md py-2.5 font-mono text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                mode === "deposit"
                  ? "bg-[#22C55E] text-[#0B0B0E] hover:bg-[#16A34A]"
                  : "bg-[#6366F1] text-white hover:bg-[#5558E6]"
              }`}
            >
              {!isConnected
                ? "CONNECT WALLET"
                : mode === "deposit" && !allocationConfigured
                  ? "ALLOCATION PENDING ON-CHAIN SETUP"
                  : mode === "deposit" && isPaused
                    ? "DEPOSITS PAUSED"
                    : mode === "deposit" && exceedsTvlCap
                      ? "EXCEEDS VAULT TVL CAP"
                      : insufficientEth
                        ? "INSUFFICIENT ETH BALANCE"
                        : insufficientShares
                          ? `INSUFFICIENT ${basket.symbol} BALANCE`
                          : mode === "deposit"
                            ? `DEPOSIT ${Number(formatEther(amtWei)).toFixed(4)} ETH`
                            : `REDEEM ${Number(formatEther(amtWei)).toFixed(4)} ${basket.symbol}`}
            </button>

            <p className="text-[11px] leading-relaxed text-[#71717A]">
              Depositors absorb swap slippage via (navAfter − navBefore) / navBefore share minting with dead-shares inflation protection. Redeem stays open even if vault deposits are paused.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
