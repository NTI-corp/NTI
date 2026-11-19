import { fetchHeatmapData } from "@/lib/supabase";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const revalidate = 60;

export default async function HeatmapPage() {
  const data = await fetchHeatmapData();
  const topOpportunity = data.points[0];

  return (
    <div className="space-y-5">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
            BUILDER HEATMAP · ATTENTION VS. SUPPLY DENSITY
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#EDF1F7]">
            High Mindshare / Low Competition Matrix
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Opportunity Score = Mindshare M_n (%) ÷ Active Projects. Active projects include indexed tokens with ≥1 ETH liquidity and ≥10 transactions in 7 days plus curated ecosystem builders.
          </p>
        </div>

        {topOpportunity && (
          <div className="panel-surface rounded px-3.5 py-2 font-mono tabular-nums">
            <div className="text-[10px] text-[#556173]">HIGHEST OPPORTUNITY</div>
            <div className="text-sm font-semibold text-[#10B981]">
              {topOpportunity.label} · {topOpportunity.opportunityScore.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <HeatmapGrid points={data.points} />
    </div>
  );
}
