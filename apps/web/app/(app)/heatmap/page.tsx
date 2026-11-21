import { fetchHeatmapData } from "@/lib/supabase";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const revalidate = 60;

export default async function HeatmapPage() {
  const data = await fetchHeatmapData();
  const topOpportunity = data.points[0];

  return (
    <div className="space-y-6">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232325] pb-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
            Builder Heatmap · Attention vs. Supply Density
          </span>
          <h1 className="mt-1">Builder Heatmap</h1>
          <p>
            Opportunity Score = Mindshare M_n (%) ÷ Active Projects. Active projects include indexed tokens with ≥1 ETH liquidity and ≥10 transactions in 7 days plus curated ecosystem builders.
          </p>
        </div>

        {topOpportunity && (
          <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] px-3.5 py-2 font-mono tabular-nums">
            <div className="text-[10px] uppercase tracking-wider text-[#71717A]">
              Highest Opportunity
            </div>
            <div className="text-sm font-semibold text-[#22C55E]">
              {topOpportunity.label} · {topOpportunity.opportunityScore.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <HeatmapGrid points={data.points} />
    </div>
  );
}
