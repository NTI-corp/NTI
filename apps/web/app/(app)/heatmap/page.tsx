import { Suspense } from "react";
import { getActiveChainId, ROBINHOOD_TESTNET_ID } from "@/lib/contracts";
import { fetchHeatmapData } from "@/lib/supabase";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function HeatmapContent() {
  const data = await fetchHeatmapData();
  const topOpportunity = data.points[0];

  return (
    <div className="tab-panel-enter space-y-4">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}
      {data.dataSource === "unavailable" && <AwaitingEpochBanner unavailable message="Heatmap data is temporarily unavailable." />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-3.5">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">
            Builder Heatmap · Attention vs. Supply Density
          </span>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
            Builder Heatmap
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-[#71717A]">
            Opportunity Score = Mindshare M_n (%) ÷ Active Projects. Active projects include indexed tokens with ≥1 ETH liquidity and ≥10 transactions in 7 days plus curated ecosystem builders.
          </p>
        </div>

        {topOpportunity && (
          <div className="border border-[#26262A] bg-[#161618] px-3.5 py-2 font-mono tabular-nums">
            <div className="text-[9.5px] uppercase tracking-[0.1em] text-[#71717A]">
              Highest Opportunity
            </div>
            <div className="mt-0.5 text-xs font-medium text-[#4ADE80]">
              {topOpportunity.label} · {topOpportunity.opportunityScore.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {getActiveChainId() === ROBINHOOD_TESTNET_ID && (
        <p className="text-xs text-[#A1A1AA]">Asset counts reflect Robinhood Testnet activity and may include test market fixtures.</p>
      )}
      {data.points.length > 0 && <HeatmapGrid points={data.points} />}
    </div>
  );
}

export default function HeatmapPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/heatmap" />}>
      <HeatmapContent />
    </Suspense>
  );
}
