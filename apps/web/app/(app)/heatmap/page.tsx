import { fetchHeatmapData } from "@/lib/supabase";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const revalidate = 60;

export default async function HeatmapPage() {
  const data = await fetchHeatmapData();
  const topOpportunity = data.points[0];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 lg:px-6">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#24242C] pb-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#6366F1]">
            Builder Heatmap · Attention vs. Supply Density
          </span>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            High Mindshare / Low Competition Matrix
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
            Opportunity Score = Mindshare M_n (%) ÷ Active Projects. Active projects include indexed tokens with ≥1 ETH liquidity and ≥10 transactions in 7 days plus curated ecosystem builders.
          </p>
        </div>

        {topOpportunity && (
          <div className="rounded-lg border border-[#24242C] bg-[#131317] px-3.5 py-2 font-mono tabular-nums">
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
