"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import {
  erc20Abi,
  getActiveChainId,
  getProtocolAddresses,
  stakingAbi,
} from "@/lib/contracts";
import { formatCompactNumber, formatEth, truncateHex } from "@/lib/format";
import { useSiweSession } from "./Providers";
import { NtiBrandMark } from "@/components/landing/NtiLogos";
import { EthMark } from "@/components/ui/Icons";
import type { BasketItem, MarketItem } from "@/lib/types";

export function PortfolioClient({
  baskets,
  markets,
}: {
  baskets: BasketItem[];
  markets: MarketItem[];
}) {
  const { address, isConnected } = useAccount();
  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);
  const { session } = useSiweSession();

  const { data: ethBal } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: ntiBal } = useReadContract({
    address: addresses.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(isConnected && address && addresses.ntiToken) },
  });

  const { data: stakedBal } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "stakeOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(isConnected && address && addresses.staking) },
  });

  const { data: earnedEth } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "pendingReward",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(isConnected && address && addresses.staking) },
  });

  const primaryBasket = baskets[0] ?? null;
  const { data: basketShares } = useReadContract({
    address: (primaryBasket?.basketAddress as Address | undefined) ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(isConnected && address && primaryBasket?.basketAddress) },
  });

  const ethNum = ethBal ? Number(formatEther(ethBal.value)) : 0;
  const ntiNum = typeof ntiBal === "bigint" ? Number(formatEther(ntiBal)) : 0;
  const stakedNum = typeof stakedBal === "bigint" ? Number(formatEther(stakedBal)) : 0;
  const rewardEth = typeof earnedEth === "bigint" ? Number(formatEther(earnedEth)) : 0;
  const sharesNum = typeof basketShares === "bigint" ? Number(formatEther(basketShares)) : 0;
  const sharesValueEth =
    primaryBasket && primaryBasket.sharePriceEth !== null
      ? sharesNum * primaryBasket.sharePriceEth
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-4">
        <div>
          <p className="kicker">Trade · Live on-chain wallet telemetry</p>
          <h1 className="mt-1.5">Portfolio</h1>
          <p className="mt-1 text-xs text-[#8A8A93]">
            {isConnected && address
              ? `Reading live balances & positions for ${truncateHex(address, 8, 6)} on Chain ${chainId}.`
              : "Connect your wallet in the top bar to inspect live $NTI stake, rewards, basket shares, and markets."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/stake"
            className="border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22"
          >
            Manage Stake →
          </Link>
          <Link
            href="/markets"
            className="border border-[#26262A] bg-[#161618] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#F5F5F7] transition-colors hover:border-[#3A3A40]"
          >
            Trade Markets →
          </Link>
        </div>
      </div>

      {/* Live Balances KPI Strip */}
      <div className="stat-strip stat-strip-compact">
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <EthMark className="h-3 w-3 text-[#8A92B2]" />
            <span>Native ETH</span>
          </div>
          <div className="stat-value tabular-nums">
            {isConnected ? formatEth(ethNum, 4) : "—"}
          </div>
          <div className="stat-caption">Gas &amp; parimutuel collateral</div>
        </div>
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <NtiBrandMark className="h-3.5 w-3.5" />
            <span>Wallet $NTI</span>
          </div>
          <div className="stat-value tabular-nums">
            {isConnected ? formatCompactNumber(Math.floor(ntiNum)) : "—"}
          </div>
          <div className="stat-caption">Liquid ERC-20 balance</div>
        </div>
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <NtiBrandMark className="h-3.5 w-3.5" />
            <span>Staked $NTI</span>
          </div>
          <div className="stat-value tabular-nums text-[#CCFF00]">
            {isConnected ? formatCompactNumber(Math.floor(stakedNum)) : "—"}
          </div>
          <div className="stat-caption">
            {session?.hasRadarAccess
              ? `Real-time Radar unlocked · ${(session.discountBps / 100).toFixed(0)}% fee off`
              : "Stake $NTI for fee discounts & Radar"}
          </div>
        </div>
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <EthMark className="h-3 w-3 text-[#4ADE80]" />
            <span>Claimable Rewards</span>
          </div>
          <div className="stat-value tabular-nums text-[#4ADE80]">
            {isConnected ? formatEth(rewardEth, 5) : "—"}
          </div>
          <div className="stat-caption">Protocol ETH fee share</div>
        </div>
      </div>

      {/* Vaults + Open Markets */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="border border-[#26262A] bg-[#161618] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#26262A] bg-[#0D0D0E] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="text-[#F5F5F7]">Basket Vault Positions ({baskets.length})</span>
            <Link href="/baskets" className="text-[#CCFF00] hover:underline">
              ALL VAULTS →
            </Link>
          </div>
          {baskets.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-[#71717A]">
              No active basket vaults found on Chain {chainId}.
            </div>
          ) : (
            <div className="divide-y divide-[#1F1F23]">
              {baskets.map((b, i) => (
                <Link
                  key={b.id}
                  href={`/baskets/${b.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#1E1E21]"
                >
                  <div>
                    <div className="font-mono text-xs font-semibold text-[#F5F5F7]">
                      {b.symbol} · {b.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#71717A] tabular-nums">
                      TVL {formatEth(b.tvlEth, 4)} · {b.holdings.length} holdings
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-semibold text-[#CCFF00]">
                      {isConnected && i === 0 ? `${sharesNum.toFixed(4)} sh` : "Inspect"}
                    </div>
                    <div className="text-[10px] text-[#8A8A93]">
                      {isConnected && i === 0 ? `≈ ${formatEth(sharesValueEth, 5)}` : "Open vault →"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="border border-[#26262A] bg-[#161618] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#26262A] bg-[#0D0D0E] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="text-[#F5F5F7]">Active Pair Markets ({markets.length})</span>
            <Link href="/markets" className="text-[#CCFF00] hover:underline">
              OPEN MARKETS →
            </Link>
          </div>
          {markets.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-[#71717A]">
              No on-chain pair markets indexed on Chain {chainId}.
            </div>
          ) : (
            <div className="divide-y divide-[#1F1F23]">
              {markets.slice(0, 6).map((m) => (
                <Link
                  key={m.marketId}
                  href={`/markets/${m.marketId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#1E1E21]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-[#F5F5F7]">
                      #{m.marketId} · {m.narrativeALabel} vs {m.narrativeBLabel}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase text-[#71717A]">
                      {m.horizonLabel} · Status: {m.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                    <span className="text-[#F5F5F7]">
                      {formatEth(m.poolAEth + m.poolBEth, 4)}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#71717A]" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
