import { Suspense } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Donut } from "@/components/ui/Donut";
import { EmptyState } from "@/components/ui/Visuals";
import { EthMark } from "@/components/ui/Icons";
import { TokenLogo, UniswapMark } from "@/components/ui/TokenLogo";
import { fetchBasketsData } from "@/lib/supabase";
import { formatBpsPercent, formatEth, formatRelativeTime } from "@/lib/format";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

const HOLDING_COLORS = ["#CCFF00", "#38BDF8", "#F59E0B", "#EF4444", "#A78BFA", "#4ADE80"] as const;

async function BasketsContent() {
  const { baskets, awaitingDeployment } = await fetchBasketsData();

  return (
    <div className="tab-panel-enter space-y-4">
      {awaitingDeployment && (
        <div className="border border-[#F59E0B]/35 bg-[#161618] px-4 py-2.5 font-mono text-[11px] text-[#F59E0B]">
          <strong>VAULT DATA UNAVAILABLE</strong>
          <span className="ml-2 font-sans text-xs text-[#A1A1AA]">
              BasketFactory did not return current vault data.
          </span>
        </div>
      )}

      <div className="border-b border-[#26262A] pb-3.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">
          Narrative Baskets · ERC-20 Spot Vaults
        </span>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
          Baskets
        </h1>
        <p className="mt-0.5 max-w-2xl text-xs text-[#71717A]">
          Each basket holds admin-whitelisted tokens with{" "}
          <span className="inline-flex items-center gap-1 align-middle text-[#A1A1AA]">
            <UniswapMark className="h-3.5 w-3.5" />
            <span>Uniswap V3</span>
          </span>{" "}
          pools against WETH (30-minute TWAP history verified, pool depth shown per token). Max 40% single-token weight, 20% daily turnover cap, 0.50% annual fee routed to FeeRouter.
        </p>
      </div>

      {baskets.length === 0 ? (
        <EmptyState
          icon={Layers}
          kicker="Narrative baskets"
          title={awaitingDeployment ? "Vault data unavailable" : "No baskets deployed"}
          text="Baskets hold whitelisted tokens with deep Uniswap V3 pools and rebalance on the keeper schedule."
          steps={["Admin whitelists tokens", "Factory deploys the vault", "Deposit ETH, receive basket shares"]}
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
                className="group flex flex-col justify-between border border-[#26262A] bg-[#161618] transition-colors hover:border-[#3A3A40] hover:bg-[#1E1E21]"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10.5px]">
                    <span className="border border-[#CCFF00]/40 bg-[#CCFF00]/10 px-1.5 py-0.5 text-[#CCFF00]">
                      {b.symbol}
                    </span>
                    <span className="text-[#71717A]">{b.narrativeLabel}</span>
                  </div>

                  <div className="p-4">
                    <h2 className="text-sm font-semibold text-[#F5F5F7] transition-colors group-hover:text-[#CCFF00]">
                      {b.name}
                    </h2>

                    <div className="mt-3 grid grid-cols-2 border border-[#1F1F23] bg-[#0D0D0E] font-mono text-xs tabular-nums">
                      <div className="border-r border-[#1F1F23] p-2.5">
                        <div className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.1em] text-[#71717A]">
                          <EthMark className="h-2.5 w-2.5 text-[#8A92B2]" />
                          <span>TWAP NAV / TVL</span>
                        </div>
                        <div className="mt-0.5 font-medium text-[#F5F5F7]">
                          {formatEth(b.navEth, 4)}
                        </div>
                      </div>
                      <div className="p-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1 text-[9.5px] uppercase tracking-[0.1em] text-[#71717A]">
                          <EthMark className="h-2.5 w-2.5 text-[#4ADE80]" />
                          <span>Share Price</span>
                        </div>
                        <div className="mt-0.5 font-medium text-[#4ADE80]">
                          {b.sharePriceEth === null ? "Unavailable" : `${b.sharePriceEth.toFixed(5)} ETH`}
                        </div>
                      </div>
                    </div>

                    {/* Composition: donut + legend */}
                    {b.holdings.length > 0 ? (
                      <div className="mt-3 flex items-center gap-4 border border-[#1F1F23] bg-[#0D0D0E] p-3">
                        <Donut
                          size={96}
                          thickness={12}
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
                              <span className="flex min-w-0 items-center gap-1.5 text-[#F5F5F7]">
                                <span
                                  className="h-2.5 w-1 shrink-0"
                                  style={{ background: HOLDING_COLORS[i % HOLDING_COLORS.length] }}
                                />
                                <TokenLogo symbol={h.symbol} size={18} />
                                <span className="truncate">${h.symbol}</span>
                              </span>
                              <span className="text-[#71717A]">{formatBpsPercent(h.weightBps, 1)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-3 border border-[#1F1F23] bg-[#0D0D0E] px-3 py-2 text-[11px] text-[#71717A]">
                        Constituent allocation pending admin setup
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[#1F1F23] bg-[#111113] px-4 py-3 font-mono text-[10.5px] text-[#71717A] tabular-nums">
                  <div className="flex justify-between">
                    <span>
                      TVL CAP: {formatEth(b.tvlEth, 2)} / {b.tvlCapEth} ETH
                    </span>
                    <span className="text-[#F5F5F7]">{capPct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full bg-[#1F1F23]">
                    <div
                      className="h-full bg-[#4ADE80]"
                      style={{ width: `${capPct}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex justify-between text-[10px] text-[#52525B]">
                    <span>{b.lastRebalancedAt ? `Rebalanced ${formatRelativeTime(b.lastRebalancedAt)}` : "No rebalance recorded"}</span>
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

export default function BasketsPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/baskets" />}>
      <BasketsContent />
    </Suspense>
  );
}
