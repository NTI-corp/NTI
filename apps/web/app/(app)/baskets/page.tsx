import Link from "next/link";
import { fetchBasketsData } from "@/lib/supabase";
import { formatBpsPercent, formatEth, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BasketsPage() {
  const { baskets, awaitingDeployment } = await fetchBasketsData();

  return (
    <div className="space-y-5">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/8 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW VAULTS</strong> · BasketFactory mirror has 0 deployed vaults yet. Showing governance-whitelisted Uniswap V3 vault architecture (≥20 ETH pool liquidity + 30m TWAP oracle).
        </div>
      )}

      <div className="border-b border-[#1B2028] pb-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
          NARRATIVE BASKETS · ERC-20 SPOT VAULTS
        </span>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#EDF1F7]">
          Whitelisted Narrative Token Baskets
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
          Each basket holds governance-whitelisted tokens with Uniswap V3 pools (≥20 ETH depth, 30-minute TWAP cardinality verified). Max 40% single-token weight, 20% daily turnover cap, 0.50% annual management fee routed to FeeRouter, and emergency-open redeem even when paused.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {baskets.map((b) => {
          const capPct = Math.min(100, (b.tvlEth / b.tvlCapEth) * 100);
          return (
            <Link
              key={b.id}
              href={`/baskets/${b.id}`}
              className="group panel-surface flex flex-col justify-between rounded-md p-4 transition-colors hover:border-[#2A3342] hover:bg-[#11161F]"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="rounded border border-[#38BDF8]/35 bg-[#38BDF8]/10 px-2 py-0.5 text-[#38BDF8]">
                    {b.symbol}
                  </span>
                  <span className="text-[#556173]">{b.narrativeLabel}</span>
                </div>

                <h2 className="mt-2.5 font-display text-base font-semibold text-[#EDF1F7] group-hover:text-[#38BDF8]">
                  {b.name}
                </h2>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-[#1B2028] bg-[#0B0E13] p-2.5 font-mono text-xs tabular-nums">
                  <div>
                    <div className="text-[9px] text-[#556173]">TWAP NAV / TVL</div>
                    <div className="font-semibold text-[#EDF1F7]">
                      {formatEth(b.navEth, 2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[#556173]">SHARE PRICE</div>
                    <div className="text-[#10B981]">{b.sharePriceEth.toFixed(5)} ETH</div>
                  </div>
                </div>

                {/* Composition Bars */}
                <div className="mt-3 space-y-1.5">
                  {b.holdings.map((h) => (
                    <div key={h.symbol} className="font-mono text-[11px] tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-[#EDF1F7]">${h.symbol}</span>
                        <span className="text-[#8A96A8]">
                          {formatBpsPercent(h.weightBps, 0)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[#1B2028]">
                        <div
                          className="h-full rounded-full bg-[#38BDF8]"
                          style={{ width: `${h.weightBps / 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-[#1B2028] pt-3 font-mono text-[10px] text-[#8A96A8] tabular-nums">
                <div className="flex justify-between">
                  <span>TVL CAP: {formatEth(b.tvlEth, 2)} / {b.tvlCapEth} ETH</span>
                  <span>{capPct.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#1B2028]">
                  <div
                    className="h-full bg-[#10B981]"
                    style={{ width: `${capPct}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[#556173]">
                  <span>Rebalanced {formatRelativeTime(b.lastRebalancedAt)}</span>
                  <span className="text-[#38BDF8]">OPEN VAULT →</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
