import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/Visuals";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { fetchBasketsData } from "@/lib/supabase";
import { formatBpsPercent, formatEth, formatRelativeTime } from "@/lib/format";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

const COLORS = ["#CCFF00", "#5EDDB1", "#E7B967", "#A99CFC", "#7FB3E8", "#E98A78", "#B2D689", "#D7A8CD"] as const;

async function BasketsContent() {
  const { baskets, awaitingDeployment } = await fetchBasketsData();
  const totalValue = baskets.reduce((sum, basket) => sum + basket.tvlEth, 0);

  return (
    <div className="tab-panel-enter space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-3.5">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">Narrative Baskets · On-chain vaults</span>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">Baskets</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-[#71717A]">Explore tokens grouped by narrative. Deposit ETH to receive basket shares and redeem them to exit.</p>
        </div>
        <div className="flex gap-6 font-mono text-[10px] text-[#71717A]">
          <span>VAULTS <span className="text-[#F5F5F7]">{awaitingDeployment ? "—" : baskets.length}</span></span>
          <span>TOTAL VALUE <span className="text-[#F5F5F7]">{awaitingDeployment ? "—" : formatEth(totalValue, 4)}</span></span>
        </div>
      </header>

      <section aria-labelledby="vault-list-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#858c7e]">Choose your exposure</div><h2 id="vault-list-title" className="mt-1 text-lg font-semibold text-[#f5f5f7]">Available baskets</h2></div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#858c7e]">Values read from vault contracts</div>
        </div>
        {baskets.length === 0 ? (
          <EmptyState icon={Layers} kicker="Narrative baskets" title={awaitingDeployment ? "Vault data unavailable" : "No baskets deployed"} text={awaitingDeployment ? "Vault data could not be loaded. Try again shortly." : "Available vaults will appear here."} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {baskets.map((basket) => {
              const usage = basket.tvlCapEth > 0 ? Math.min(100, (basket.tvlEth / basket.tvlCapEth) * 100) : 0;
              const available = Math.max(0, basket.tvlCapEth - basket.tvlEth);
              return (
                <Link key={basket.id} href={`/baskets/${basket.id}`} className="group flex h-full flex-col border border-[#30342c] bg-[#171a16] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b6e53b]/60 hover:bg-[#1b2018] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00]">
                  <div className="flex items-start justify-between gap-4 border-b border-[#30342c] px-5 py-5 sm:px-6">
                    <div className="min-w-0"><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a4b58a]">{basket.narrativeLabel} · {basket.symbol}</div><h3 className="mt-2 text-xl font-semibold tracking-tight text-[#f5f5f7] sm:text-2xl">{basket.name}</h3><div className="mt-2 text-xs text-[#90998a]">{basket.holdings.length} assets · {(basket.managementFeeBps / 100).toFixed(2)}% annual management fee</div></div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#53623b] text-[#ccff00] transition-colors group-hover:bg-[#ccff00] group-hover:text-[#10130c]"><ArrowUpRight className="h-5 w-5" /></span>
                  </div>
                  <div className="flex flex-1 flex-col gap-5 px-5 py-5 sm:px-6">
                    <div className="grid grid-cols-2 gap-3 font-mono tabular-nums"><div><div className="text-[10px] uppercase tracking-wider text-[#858c7e]">Vault value</div><div className="mt-1 text-xl text-[#f5f5f7]">{formatEth(basket.tvlEth, 4)}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[#858c7e]">Share price</div><div className="mt-1 text-xl text-[#f5f5f7]">{basket.sharePriceEth === null ? "Unavailable" : `${basket.sharePriceEth.toFixed(5)} ETH`}</div></div></div>
                    <div><div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[#858c7e]"><span>Target allocation</span><span>{basket.holdings.length} assets</span></div>
                      {basket.holdings.length ? <><div className="flex h-2 overflow-hidden bg-[#282d24]">{basket.holdings.map((holding, i) => <span key={holding.address} title={`${holding.symbol}: ${formatBpsPercent(holding.weightBps, 1)}`} style={{ width: `${holding.weightBps / 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />)}</div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{basket.holdings.map((holding, i) => <div key={holding.address} className="flex min-w-0 items-center gap-2"><TokenLogo symbol={holding.symbol} size={22} /><span className="min-w-0"><span className="block truncate font-mono text-[10px] text-[#e5e8df]">{holding.symbol}</span><span className="block font-mono text-[10px]" style={{color: COLORS[i % COLORS.length]}}>{formatBpsPercent(holding.weightBps, 1)}</span></span></div>)}</div></> : <p className="text-xs text-[#858c7e]">No target allocation configured.</p>}
                    </div>
                    <div className="mt-auto border-t border-[#30342c] pt-4"><div className="flex justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-[#858c7e]"><span>Vault capacity · {usage.toFixed(0)}% used</span><span>{formatEth(available, 4)} available</span></div><div className="mt-2 h-1 bg-[#30382a]"><div className="h-full bg-[#ccff00]" style={{width: `${usage}%`}} /></div><div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-[#858c7e]"><span>{formatEth(basket.tvlEth, 4)} / {formatEth(basket.tvlCapEth, 2)} cap</span><span>{basket.lastRebalancedAt ? `Rebalanced ${formatRelativeTime(basket.lastRebalancedAt)}` : "No rebalance recorded"}</span></div></div>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#30342c] px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.12em] sm:px-6"><span className="text-[#858c7e]">View allocation &amp; vault details</span><span className="text-[#ccff00]">Open vault →</span></div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[#262a22] pt-4 font-mono text-[10px] uppercase tracking-wider text-[#858c7e]"><span>ETH deposits</span><span>Basket shares</span><span>Uniswap V3 pools</span><span>30-min TWAP</span></div>
    </div>
  );
}

export default function BasketsPage() {
  return <Suspense fallback={<InstantRouteShell path="/baskets" />}><BasketsContent /></Suspense>;
}
