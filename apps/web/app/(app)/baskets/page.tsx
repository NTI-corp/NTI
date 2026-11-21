import Link from "next/link";
import { Layers } from "lucide-react";
import { Donut } from "@/components/ui/Donut";
import { EmptyState } from "@/components/ui/Visuals";
import { fetchBasketsData } from "@/lib/supabase";
import { formatBpsPercent, formatEth, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const HOLDING_COLORS = ["#CCFF00", "#F4F4F5", "#9AAA2E", "#A1A1AA", "#E6FF6B", "#71717A"] as const;

export default async function BasketsPage() {
  const { baskets, awaitingDeployment } = await fetchBasketsData();

  return (
    <div className="space-y-6">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW VAULTS</strong> · BasketFactory returned 0 deployed vaults. Showing governance-whitelisted Uniswap V3 vault architecture (≥20 ETH pool liquidity + 30m TWAP oracle).
        </div>
      )}

      <div className="border-b border-[#232325] pb-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
          Narrative Baskets · ERC-20 Spot Vaults
        </span>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
          Baskets
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
          Each basket holds governance-whitelisted tokens with Uniswap V3 pools (≥20 ETH depth, 30-minute TWAP cardinality verified). Max 40% single-token weight, 20% daily turnover cap, 0.50% annual management fee routed to FeeRouter, and emergency-open redeem even when paused.
        </p>
      </div>

      {baskets.length === 0 ? (
        <EmptyState
          icon={Layers}
          kicker="Narrative baskets"
          title="No baskets deployed"
          text="Baskets hold whitelisted tokens with deep Uniswap V3 pools and rebalance each epoch."
          steps={["Governance whitelists tokens", "Factory deploys the vault", "Deposit ETH, receive basket shares"]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {baskets.map((b) => {
            const capPct =
              b.tvlCapEth > 0 ? Math.min(100, (b.tvlEth / b.tvlCapEth) * 100) : 0;
            return (
              <Link
                key={b.id}
                href={`/baskets/${b.id}`}
                className="group flex flex-col justify-between rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 transition-colors hover:border-[#CCFF00]/50 hover:bg-[#131314]"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="rounded border border-[#CCFF00]/40 bg-[#CCFF00]/12 px-2 py-0.5 text-[#CCFF00]">
                      {b.symbol}
                    </span>
                    <span className="text-[#71717A]">{b.narrativeLabel}</span>
                  </div>

                  <h2 className="mt-2.5 text-base font-semibold text-[#F4F4F5] transition-colors group-hover:text-[#CCFF00]">
                    {b.name}
                  </h2>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[#232325] bg-[#090909] p-2.5 font-mono text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
                        TWAP NAV / TVL
                      </div>
                      <div className="mt-0.5 font-semibold text-[#F4F4F5]">
                        {formatEth(b.navEth, 4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
                        Share Price
                      </div>
                      <div className="mt-0.5 font-semibold text-[#22C55E]">
                        {b.sharePriceEth.toFixed(5)} ETH
                      </div>
                    </div>
                  </div>

                  {/* Composition: donut + legend */}
                  {b.holdings.length > 0 && (
                    <div className="mt-3 flex items-center gap-4 rounded-md border border-[#232325] bg-[#090909] p-3">
                      <Donut
                        size={104}
                        thickness={14}
                        centerLabel="Weights"
                        centerValue={`${b.holdings.length}`}
                        slices={b.holdings.map((h, i) => ({
                          id: h.address,
                          label: `$${h.symbol}`,
                          value: h.weightBps,
                          color: HOLDING_COLORS[i % HOLDING_COLORS.length]!,
                        }))}
                      />
                      <ul className="min-w-0 flex-1 space-y-1.5 font-mono text-[11px] tabular-nums">
                        {b.holdings.map((h, i) => (
                          <li key={h.address} className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-[#E4E4E7]">
                              <span
                                className="h-3 w-1 shrink-0 rounded-sm"
                                style={{ background: HOLDING_COLORS[i % HOLDING_COLORS.length] }}
                              />
                              <span className="truncate">${h.symbol}</span>
                            </span>
                            <span className="text-[#A1A1AA]">{formatBpsPercent(h.weightBps, 0)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 space-y-1.5">
                    {b.holdings.length === 0 ? (
                      <div className="rounded border border-[#232325] bg-[#090909] px-2.5 py-2 text-[11px] text-[#71717A]">
                        Constituent allocation pending governance setup
                      </div>
                    ) : (
                      null
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-[#232325] pt-3 font-mono text-[11px] text-[#A1A1AA] tabular-nums">
                  <div className="flex justify-between">
                    <span>
                      TVL CAP: {formatEth(b.tvlEth, 2)} / {b.tvlCapEth} ETH
                    </span>
                    <span>{capPct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#232325]">
                    <div
                      className="h-full bg-[#22C55E]"
                      style={{ width: `${capPct}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex justify-between text-[10px] text-[#71717A]">
                    <span>Rebalanced {formatRelativeTime(b.lastRebalancedAt)}</span>
                    <span className="text-[#CCFF00]">OPEN VAULT →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
