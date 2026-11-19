"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { basketAbi, estimateTxGas, type GasEstimateDisplay } from "@/lib/contracts";
import { formatBpsPercent, formatEth, truncateHex } from "@/lib/format";
import type { BasketItem } from "@/lib/types";

export function BasketVaultClient({ basket }: { basket: BasketItem }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [mode, setMode] = useState<"deposit" | "redeem">("deposit");
  const [amount, setAmount] = useState("0.25");
  const [slippageBps, setSlippageBps] = useState("150"); // 1.50%
  const [gasEst, setGasEst] = useState<GasEstimateDisplay | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const numericAmt = Math.max(0, Number.parseFloat(amount) || 0);
  const slip = Math.min(300, Math.max(10, Number.parseInt(slippageBps, 10) || 150));
  const estSharesOut = basket.sharePriceEth > 0 ? numericAmt / basket.sharePriceEth : 0;
  const minSharesOut = estSharesOut * (1 - slip / 10_000);
  const estEthOut = numericAmt * basket.sharePriceEth;
  const minEthOut = estEthOut * (1 - slip / 10_000);

  useEffect(() => {
    let active = true;
    void estimateTxGas(publicClient, {
      account: address,
      to:
        basket.basketAddress !== "0x0000000000000000000000000000000000000000"
          ? (basket.basketAddress as `0x${string}`)
          : undefined,
      fallbackGasLimit: 320_000n,
    }).then((g) => {
      if (active) setGasEst(g);
    });
    return () => {
      active = false;
    };
  }, [publicClient, address, basket.basketAddress, mode, amount]);

  const handleExecute = async () => {
    setErrMsg(null);
    setStatusMsg(null);
    if (!isConnected) {
      setErrMsg("Connect your wallet in the top bar first.");
      return;
    }
    if (basket.basketAddress === "0x0000000000000000000000000000000000000000") {
      setErrMsg("This basket vault has not been deployed on-chain yet.");
      return;
    }
    if (numericAmt <= 0) {
      setErrMsg("Enter an amount greater than 0.");
      return;
    }

    try {
      if (mode === "deposit") {
        const hash = await writeContractAsync({
          address: basket.basketAddress as `0x${string}`,
          abi: basketAbi,
          functionName: "deposit",
          args: [parseEther(minSharesOut.toFixed(6))],
          value: parseEther(numericAmt.toFixed(6)),
        });
        setStatusMsg(`Deposit submitted: ${hash}`);
      } else {
        const hash = await writeContractAsync({
          address: basket.basketAddress as `0x${string}`,
          abi: basketAbi,
          functionName: "redeem",
          args: [parseEther(numericAmt.toFixed(6)), parseEther(minEthOut.toFixed(6))],
        });
        setStatusMsg(`Redeem submitted: ${hash}`);
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1B2028] pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#556173]">
            <Link href="/baskets" className="hover:text-[#EDF1F7]">
              BASKETS
            </Link>
            <span>/</span>
            <span className="text-[#8A96A8]">{basket.symbol}</span>
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-[#EDF1F7]">
            {basket.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-[#8A96A8]">
            Vault {truncateHex(basket.basketAddress, 10, 6)} · {basket.narrativeLabel} · 0.50% annual management fee
          </p>
        </div>

        <Link
          href={`/narratives/${basket.narrativeId}`}
          className="rounded border border-[#2A3342] bg-[#131820] px-3 py-1.5 font-mono text-xs text-[#38BDF8] hover:border-[#38BDF8]/50"
        >
          VIEW {basket.narrativeLabel.toUpperCase()} INDEX →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Vault Composition & TWAP NAV */}
        <div className="space-y-5 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
            <div className="panel-surface rounded-md p-3.5">
              <div className="text-[10px] text-[#556173]">30M TWAP NAV</div>
              <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">
                {formatEth(basket.navEth, 3)}
              </div>
              <div className="text-[10px] text-[#8A96A8]">Cap {basket.tvlCapEth} ETH</div>
            </div>
            <div className="panel-surface rounded-md p-3.5">
              <div className="text-[10px] text-[#556173]">SHARE PRICE</div>
              <div className="mt-1 text-lg font-semibold text-[#10B981]">
                {basket.sharePriceEth.toFixed(5)}
              </div>
              <div className="text-[10px] text-[#8A96A8]">ETH / {basket.symbol}</div>
            </div>
            <div className="panel-surface rounded-md p-3.5">
              <div className="text-[10px] text-[#556173]">MAX SINGLE WEIGHT</div>
              <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">40.0%</div>
              <div className="text-[10px] text-[#8A96A8]">Max 20% daily turnover</div>
            </div>
          </div>

          <div className="panel-surface rounded-md">
            <div className="border-b border-[#1B2028] px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
                Whitelisted Constituents (Uniswap V3 TWAP Priced)
              </h2>
              <p className="font-mono text-[11px] text-[#8A96A8]">
                Every token requires governance whitelist approval, ≥20 ETH V3 liquidity, and observe([1800, 0]) support
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1B2028] bg-[#0B0E13] font-mono text-[10px] uppercase text-[#556173]">
                    <th className="px-4 py-2.5">Token</th>
                    <th className="px-4 py-2.5 text-right">Target Weight</th>
                    <th className="px-4 py-2.5 text-right">30m TWAP</th>
                    <th className="px-4 py-2.5 text-right">V3 Pool Depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B2028] font-mono tabular-nums">
                  {basket.holdings.map((h) => (
                    <tr key={h.address} className="hover:bg-[#131820]/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#EDF1F7]">${h.symbol}</div>
                        <div className="text-[10px] text-[#556173]">
                          {h.name} · {truncateHex(h.address, 6, 4)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[#38BDF8]">
                        {formatBpsPercent(h.weightBps, 1)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#EDF1F7]">
                        {h.twap30mEth.toFixed(5)} ETH
                      </td>
                      <td className="px-4 py-3 text-right text-[#10B981]">
                        {h.liquidityEth.toFixed(1)} ETH
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Deposit / Redeem Form */}
        <div className="panel-surface rounded-md p-4 lg:col-span-5">
          <div className="grid grid-cols-2 gap-1.5 rounded border border-[#1B2028] bg-[#0B0E13] p-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => setMode("deposit")}
              className={`rounded py-2 font-semibold transition-colors ${
                mode === "deposit"
                  ? "bg-[#10B981]/15 text-[#10B981]"
                  : "text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              DEPOSIT ETH
            </button>
            <button
              type="button"
              onClick={() => setMode("redeem")}
              className={`rounded py-2 font-semibold transition-colors ${
                mode === "redeem"
                  ? "bg-[#38BDF8]/15 text-[#38BDF8]"
                  : "text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              REDEEM {basket.symbol}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="font-mono text-[11px] text-[#8A96A8]">
                {mode === "deposit" ? "DEPOSIT AMOUNT (ETH)" : `SHARES TO REDEEM (${basket.symbol})`}
              </label>
              <input
                type="number"
                min="0"
                step="0.05"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-sm text-[#EDF1F7] tabular-nums focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between font-mono text-[11px] text-[#8A96A8]">
                <label>MAX SLIPPAGE TOLERANCE (BPS · MAX 300)</label>
                <span>{(slip / 100).toFixed(2)}%</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  className="w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-1.5 font-mono text-xs text-[#EDF1F7] tabular-nums focus:border-[#38BDF8] focus:outline-none"
                />
                {["50", "150", "300"].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSlippageBps(b)}
                    className="rounded border border-[#1B2028] bg-[#131820] px-2.5 py-1.5 font-mono text-[11px] text-[#8A96A8] hover:text-[#EDF1F7]"
                  >
                    {(Number(b) / 100).toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-[11px] tabular-nums">
              {mode === "deposit" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#8A96A8]">Est. shares minted</span>
                    <span className="text-[#EDF1F7]">
                      {estSharesOut.toFixed(3)} {basket.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8A96A8]">Min shares out (slippage floor)</span>
                    <span className="text-[#10B981]">
                      {minSharesOut.toFixed(3)} {basket.symbol}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#8A96A8]">Est. ETH returned</span>
                    <span className="text-[#EDF1F7]">{formatEth(estEthOut, 4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8A96A8]">Min ETH out (slippage floor)</span>
                    <span className="text-[#38BDF8]">{formatEth(minEthOut, 4)}</span>
                  </div>
                </>
              )}
              {gasEst && (
                <div className="flex justify-between border-t border-[#1B2028] pt-1.5">
                  <span className="text-[#8A96A8]">
                    Est. gas ({gasEst.gasPriceGwei} gwei)
                  </span>
                  <span className="text-[#8A96A8]">~{gasEst.estimatedCostEth} ETH</span>
                </div>
              )}
            </div>

            {errMsg && (
              <div className="rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 font-mono text-[11px] text-[#EF4444]">
                {errMsg}
              </div>
            )}
            {statusMsg && (
              <div className="rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-[11px] text-[#10B981]">
                {statusMsg}
              </div>
            )}

            <button
              type="button"
              disabled={isPending}
              onClick={() => void handleExecute()}
              className="w-full rounded border border-[#10B981]/50 bg-[#10B981]/15 py-2.5 font-mono text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/25 disabled:opacity-50"
            >
              {isPending
                ? "CONFIRM IN WALLET..."
                : mode === "deposit"
                  ? `DEPOSIT ${numericAmt.toFixed(3)} ETH`
                  : `REDEEM ${numericAmt.toFixed(3)} ${basket.symbol}`}
            </button>

            <p className="font-mono text-[10px] text-[#556173]">
              Depositors absorb swap slippage via (navAfter − navBefore) / navBefore share minting with dead-shares inflation protection. Redeem stays open even if vault deposits are paused.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
