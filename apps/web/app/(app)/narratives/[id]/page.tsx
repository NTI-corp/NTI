import Link from "next/link";
import { notFound } from "next/navigation";
import { NARRATIVES, NARRATIVE_BY_ID, NARRATIVE_BY_SLUG } from "@nti/sdk";
import { fetchBasketsData, fetchNarrativeHistory } from "@/lib/supabase";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { IndexChart } from "@/components/IndexChart";
import { ContributorsTable } from "@/components/ContributorsTable";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const revalidate = 60;

export default async function NarrativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  const meta = Number.isInteger(numId)
    ? NARRATIVE_BY_ID.get(numId)
    : NARRATIVE_BY_SLUG.get(id.toLowerCase());

  if (!meta) notFound();

  const [data, basketsData] = await Promise.all([
    fetchNarrativeHistory(meta.id),
    fetchBasketsData(),
  ]);
  const latest = [...data.series].reverse().find((p) => !p.incomplete) ?? null;
  const matchingBasket = basketsData.baskets.find((b) => b.narrativeId === meta.id) ?? null;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}

      {/* Breadcrumb & Narrative Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24242C] pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#71717A]">
            <Link href="/terminal" className="hover:text-[#F4F4F5]">
              TERMINAL
            </Link>
            <span>/</span>
            <span className="text-[#A1A1AA]">NARRATIVE #{meta.id}</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#F4F4F5]">
            {meta.label}
          </h1>
          <p className="mt-1 text-xs text-[#8A96A8]">{meta.description}</p>
        </div>

        {/* Quick Links to Market & Basket */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/markets?narrative=${meta.id}`}
            className="rounded-md border border-[#22C55E]/40 bg-[#22C55E]/10 px-3 py-2 font-mono text-xs font-medium text-[#22C55E] transition-colors hover:bg-[#22C55E]/20"
          >
            TRADE PAIR MARKETS →
          </Link>
          <Link
            href={matchingBasket ? `/baskets/${matchingBasket.id}` : "/baskets"}
            className="rounded-md border border-[#6366F1]/40 bg-[#6366F1]/15 px-3 py-2 font-mono text-xs font-medium text-[#A5B4FC] transition-colors hover:bg-[#6366F1]/25"
          >
            {matchingBasket ? `OPEN ${matchingBasket.symbol} VAULT →` : "EXPLORE BASKETS →"}
          </Link>
        </div>
      </div>

      {/* Narrative Pill Switcher */}
      <div className="flex flex-wrap gap-1.5">
        {NARRATIVES.map((n) => (
          <Link
            key={n.id}
            href={`/narratives/${n.id}`}
            className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              n.id === meta.id
                ? "border-[#38BDF8]/60 bg-[#38BDF8]/12 text-[#EDF1F7]"
                : "border-[#1B2028] bg-[#0E1117] text-[#8A96A8] hover:border-[#2A3342] hover:text-[#EDF1F7]"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 font-mono tabular-nums sm:grid-cols-4">
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">OFFICIAL INDEX I_n</div>
          <div className="mt-1 text-xl font-semibold text-[#EDF1F7]">
            {latest ? formatBpsPercent(latest.iBps) : "—"}
          </div>
          <div className="text-[11px] text-[#8A96A8]">
            {latest ? `${latest.iBps.toLocaleString("en-US")} bps` : "No finalized epoch"}
          </div>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">24H VELOCITY V_n</div>
          <div
            className={`mt-1 text-xl font-semibold ${
              latest?.vBps === null || latest?.vBps === undefined
                ? "text-[#F59E0B]"
                : latest.vBps >= 0
                  ? "text-[#10B981]"
                  : "text-[#EF4444]"
            }`}
          >
            {latest ? formatSignedBps(latest.vBps, latest.vFlag) : "—"}
          </div>
          <div className="text-[11px] text-[#8A96A8]">6-epoch lag (24h)</div>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">RAW MINDSHARE M_n</div>
          <div className="mt-1 text-xl font-semibold text-[#38BDF8]">
            {latest ? formatBpsPercent(latest.mBps) : "—"}
          </div>
          <div className="text-[11px] text-[#8A96A8]">Before α = 0.3 EMA</div>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">24H WEIGHTED POSTS</div>
          <div className="mt-1 text-xl font-semibold text-[#EDF1F7]">
            {latest ? Math.round(latest.weightedPosts).toLocaleString("en-US") : "—"}
          </div>
          <div className="text-[11px] text-[#8A96A8]">Threshold ≥ 30 for V_n</div>
        </div>
      </div>

      {/* Single-Narrative Dual-Pane IndexChart */}
      <IndexChart
        series={[
          {
            id: meta.id,
            label: meta.label,
            color: "#38BDF8",
            points: data.series,
          },
        ]}
        title={`${meta.label} · Historical I_n & Signed Velocity V_n`}
        subtitle="Vertical dashed lines mark governance/model re-baselines (NEW SERIES); hatched bands mark incomplete epochs"
        showVelocityBars
        height={320}
      />

      {/* Contributors + Related Tokens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ContributorsTable
            contributors={data.contributors}
            narrativeLabel={meta.label}
          />
        </div>

        <div className="panel-surface rounded-md lg:col-span-5">
          <div className="border-b border-[#1B2028] px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Related On-Chain Tokens
            </h3>
            <p className="font-mono text-[11px] text-[#8A96A8]">
              Indexed from Pons V1/V2 &amp; Uniswap pools on Robinhood Chain
            </p>
          </div>
          {data.tokens.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-[#556173]">
              No tokens matched to {meta.label} yet.
            </div>
          ) : (
            <div className="divide-y divide-[#1B2028]">
              {data.tokens.map((tok) => (
                <div
                  key={tok.address}
                  className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs tabular-nums"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#EDF1F7]">${tok.symbol}</span>
                      <span className="font-sans text-xs text-[#8A96A8]">{tok.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[#556173]">
                      <span>{truncateHex(tok.address, 8, 6)}</span>
                      <span className="uppercase">{tok.source ?? "dex"}</span>
                      <span
                        className={
                          tok.graduated ? "text-[#10B981]" : "text-[#F59E0B]"
                        }
                      >
                        {tok.graduated ? "GRADUATED" : "BONDING"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#EDF1F7]">{tok.liquidityEth.toFixed(1)} ETH</div>
                    <div className="text-[10px] text-[#8A96A8]">{tok.txs7d} txs / 7d</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
