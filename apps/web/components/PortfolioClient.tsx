"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import {
  erc20Abi,
  getActiveChainId,
  getProtocolAddresses,
  narrativeMarketAbi,
  stakingAbi,
} from "@/lib/contracts";
import { formatCompactNumber, formatEth, truncateHex } from "@/lib/format";
import { useSiweSession } from "./Providers";
import { NtiBrandMark } from "@/components/landing/NtiLogos";
import { EthMark } from "@/components/ui/Icons";
import { TokenLogo } from "@/components/ui/TokenLogo";
import type { BasketItem, MarketItem } from "@/lib/types";

export function PortfolioClient({
  baskets,
  markets,
  basketsUnavailable,
  marketsUnavailable,
}: {
  baskets: BasketItem[];
  markets: MarketItem[];
  basketsUnavailable: boolean;
  marketsUnavailable: boolean;
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

  // Shares in every vault, not just the first one.
  const { data: basketShareReads } = useReadContracts({
    contracts: baskets.map((b) => ({
      address: b.basketAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address as Address] as const,
      chainId,
    })),
    query: { enabled: Boolean(isConnected && address && baskets.length > 0) },
  });
  const sharesByBasket = baskets.map((b, i) => {
    const raw = basketShareReads?.[i];
    const shares = raw?.status === "success" && typeof raw.result === "bigint" ? Number(formatEther(raw.result)) : null;
    return { shares, valueEth: shares !== null && b.sharePriceEth !== null ? shares * b.sharePriceEth : null };
  });

  // The wallet's stake in each listed pair market (gross ETH on both sides).
  const listedMarkets = markets;
  const { data: positionReads } = useReadContracts({
    contracts: listedMarkets.map((m) => ({
      address: addresses.narrativeMarket as Address,
      abi: narrativeMarketAbi,
      functionName: "positions" as const,
      args: [BigInt(m.marketId), address as Address] as const,
      chainId,
    })),
    query: { enabled: Boolean(isConnected && address && addresses.narrativeMarket && listedMarkets.length > 0) },
  });
  const stakeByMarket = new Map<number, number>();
  listedMarkets.forEach((m, i) => {
    const raw = positionReads?.[i];
    if (raw?.status === "success" && Array.isArray(raw.result)) {
      const [gross0, , gross1] = raw.result as readonly [bigint, bigint, bigint, bigint, boolean];
      stakeByMarket.set(m.marketId, Number(formatEther(gross0 + gross1)));
    }
  });

  const ethNum = ethBal ? Number(formatEther(ethBal.value)) : null;
  const ntiNum = typeof ntiBal === "bigint" ? Number(formatEther(ntiBal)) : null;
  const stakedNum = typeof stakedBal === "bigint" ? Number(formatEther(stakedBal)) : null;
  const rewardEth = typeof earnedEth === "bigint" ? Number(formatEther(earnedEth)) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="relative flex flex-wrap items-end justify-between gap-5 overflow-hidden border border-[#303327] bg-[#151712] px-5 py-6 sm:px-7">
        <div>
          <p className="kicker">Trade · Live on-chain wallet telemetry</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#F5F5F7] sm:text-4xl">Your portfolio<span className="text-[#CCFF00]">.</span></h1>
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
            {isConnected && ethNum !== null ? formatEth(ethNum, 4) : "—"}
          </div>
          <div className="stat-caption">Gas &amp; parimutuel collateral</div>
        </div>
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <NtiBrandMark className="h-3.5 w-3.5" />
            <span>Wallet token</span>
          </div>
          <div className="stat-value tabular-nums">
            {isConnected && ntiNum !== null ? formatCompactNumber(Math.floor(ntiNum)) : "—"}
          </div>
          <div className="stat-caption">Liquid ERC-20 balance</div>
        </div>
        <div>
          <div className="stat-label inline-flex items-center gap-1.5">
            <NtiBrandMark className="h-3.5 w-3.5" />
            <span>Staked token</span>
          </div>
          <div className="stat-value tabular-nums text-[#CCFF00]">
            {isConnected && stakedNum !== null ? formatCompactNumber(Math.floor(stakedNum)) : "—"}
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
            {isConnected && rewardEth !== null ? formatEth(rewardEth, 5) : "—"}
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
              {basketsUnavailable ? "Vault data is temporarily unavailable." : `No basket vaults found on Chain ${chainId}.`}
            </div>
          ) : (
            <div className="divide-y divide-[#1F1F23]">
              {baskets.map((b, i) => (
                <Link
                  key={b.id}
                  href={`/baskets/${b.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#1E1E21]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex shrink-0 -space-x-1.5">
                      {b.holdings.slice(0, 3).map((h) => (
                        <TokenLogo key={h.address} symbol={h.symbol} size={22} className="bg-[#0D0D0E]" />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-[#F5F5F7]">
                        {b.symbol} · {b.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-[#71717A] tabular-nums">
                        TVL {formatEth(b.tvlEth, 4)} · {b.holdings.length} holdings
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-semibold text-[#CCFF00]">
                      {isConnected ? (sharesByBasket[i]?.shares != null ? `${sharesByBasket[i]!.shares!.toFixed(4)} sh` : "Unavailable") : "Inspect"}
                    </div>
                    <div className="text-[10px] text-[#8A8A93]">
                      {isConnected ? (sharesByBasket[i]?.valueEth != null ? `≈ ${formatEth(sharesByBasket[i]!.valueEth!, 5)}` : "Value unavailable") : "Open vault →"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="border border-[#26262A] bg-[#161618] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#26262A] bg-[#0D0D0E] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="text-[#F5F5F7]">Recent Pair Markets ({markets.length}, up to 30)</span>
            <Link href="/markets" className="text-[#CCFF00] hover:underline">
              OPEN MARKETS →
            </Link>
          </div>
          {markets.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-[#71717A]">
              {marketsUnavailable ? "Market data is temporarily unavailable." : `No on-chain pair markets found on Chain ${chainId}.`}
            </div>
          ) : (
            <div className="divide-y divide-[#1F1F23]">
              {listedMarkets.map((m) => (
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
                    <span className="text-right">
                      <span className="block text-[#F5F5F7]">{formatEth(m.poolAEth + m.poolBEth, 4)} pool</span>
                      {isConnected && (
                        <span className="block text-[10px] text-[#8A8A93]">
                          your stake {stakeByMarket.has(m.marketId) ? formatEth(stakeByMarket.get(m.marketId)!, 4) : "unavailable"}
                        </span>
                      )}
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
