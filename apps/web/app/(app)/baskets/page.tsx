import Link from "next/link";
import { fetchBasketsData } from "@/lib/supabase";
import { formatBpsPercent, formatEth, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BasketsPage() {
  const { baskets, awaitingDeployment } = await fetchBasketsData();

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      {awaitingDeployment && (
        <div className="rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">
          <strong>PREVIEW VAULTS</strong> · BasketFactory returned 0 deployed vaults. Showing governance-whitelisted Uniswap V3 vault architecture (≥20 ETH pool liquidity + 30m TWAP oracle).
        </div>
      )}

      <div className="border-b border-[#24242C] pb-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#6366F1]">
          Narrative Baskets · ERC-20 Spot Vaults
        </span>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
          Whitelisted Narrative Token Baskets
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
          Each basket holds governance-whitelisted tokens with Uniswap V3 pools (≥20 ETH depth, 30-minute TWAP cardinality verified). Max 40% single-token weight, 20% daily turnover cap, 0.50% annual management fee routed to FeeRouter, and emergency-open redeem even when paused.
        </p>
      </div>

      {baskets.length === 0 ? (
        <div className="rounded-lg border border-[#24242C] bg-[#131317] p-8 text-center text-xs text-[#A1A1AA]">
          No narrative baskets deployed yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {baskets.map((b) => {
            const capPct =
              b.tvlCapEth > 0 ? Math.min(100, (b.tvlEth / b.tvlCapEth) * 100) : 0;
            return (
              <Link
                key={b.id}
                href={`/baskets/${b.id}`}
                className="group flex flex-col justify-between rounded-lg border border-[#24242C] bg-[#131317] p-4 transition-colors hover:border-[#6366F1]/50 hover:bg-[#19191F]"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="rounded border border-[#6366F1]/40 bg-[#6366F1]/15 px-2 py-0.5 text-[#A5B4FC]">
                      {b.symbol}
                    </span>
                    <span className="text-[#71717A]">{b.narrativeLabel}</span>
                  </div>

                  <h2 className="mt-2.5 text-base font-semibold text-[#F4F4F5] transition-colors group-hover:text-[#A5B4FC]">
                    {b.name}
                  </h2>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[#24242C] bg-[#0B0B0E] p-2.5 font-mono text-xs tabular-nums">
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

                  {/* Composition Bars */}
                  <div className="mt-3 space-y-1.5">
                    {b.holdings.length === 0 ? (
                      <div className="rounded border border-[#24242C] bg-[#0B0B0E] px-2.5 py-2 text-[11px] text-[#71717A]">
                        Constituent allocation pending governance setup
                      </div>
                    ) : (
                      b.holdings.map((h) => (
                        <div key={h.address} className="font-mono text-[11px] tabular-nums">
                          <div className="flex justify-between">
                            <span className="text-[#F4F4F5]">${h.symbol}</span>
                            <span className="text-[#A1A1AA]">
                              {formatBpsPercent(h.weightBps, 0)}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[#24242C]">
                            <div
                              className="h-full rounded-full bg-[#6366F1]"
                              style={{ width: `${Math.min(100, h.weightBps / 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-[#24242C] pt-3 font-mono text-[11px] text-[#A1A1AA] tabular-nums">
                  <div className="flex justify-between">
                    <span>
                      TVL CAP: {formatEth(b.tvlEth, 2)} / {b.tvlCapEth} ETH
                    </span>
                    <span>{capPct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#24242C]">
                    <div
                      className="h-full bg-[#22C55E]"
                      style={{ width: `${capPct}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex justify-between text-[10px] text-[#71717A]">
                    <span>Rebalanced {formatRelativeTime(b.lastRebalancedAt)}</span>
                    <span className="text-[#A5B4FC]">OPEN VAULT →</span>
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
