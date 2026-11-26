import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { NARRATIVES, NARRATIVE_BY_ID, NARRATIVE_BY_SLUG } from "@nti/sdk";
import { fetchBasketsData, fetchNarrativeHistory } from "@/lib/supabase";
import { formatBpsPercent, formatRelativeTime, formatSignedBps } from "@/lib/format";
import { sectorColor } from "@/lib/sectors";
import { IndexChart } from "@/components/IndexChart";
import { ContributorsTable } from "@/components/ContributorsTable";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const dynamic = "force-dynamic";

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
    <div className="space-y-4">
      {data.awaitingFirstEpoch && <AwaitingEpochBanner />}
      {data.dataSource === "unavailable" && <AwaitingEpochBanner unavailable message="Narrative history is temporarily unavailable." />}

      {/* Breadcrumb & Narrative Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26262A] pb-4">
        <div>
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-[#71717A]">
            <Link
              href="/terminal"
              className="inline-flex items-center gap-1 border border-[#26262A] bg-[#161618] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#F5F5F7] transition-colors hover:border-[#CCFF00] hover:text-[#CCFF00]"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>BACK TO TERMINAL</span>
            </Link>
            <span>/</span>
            <span className="text-[#71717A]">NARRATIVE #{meta.id}</span>
          </div>
          <h1 className="mt-1.5 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-7 w-2 rounded-sm"
              style={{ background: sectorColor(meta.id), boxShadow: `0 0 24px ${sectorColor(meta.id)}88` }}
            />
            {meta.label}
          </h1>
          <p className="mt-1 text-xs text-[#8A8A93]">{meta.description}</p>
        </div>

        {/* Quick Links to Market & Basket */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/markets?narrative=${meta.id}`}
            className="border border-[#4ADE80]/40 bg-[#4ADE80]/10 px-3 py-2 font-mono text-xs font-medium text-[#4ADE80] transition-colors hover:bg-[#4ADE80]/20"
          >
            TRADE PAIR MARKETS →
          </Link>
          <Link
            href={matchingBasket ? `/baskets/${matchingBasket.id}` : "/baskets"}
            className="border border-[#CCFF00]/40 bg-[#CCFF00]/12 px-3 py-2 font-mono text-xs font-medium text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22"
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
            className={`border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              n.id === meta.id
                ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
                : "border-[#26262A] bg-[#161618] text-[#8A8A93] hover:border-[#3A3A40] hover:text-[#F5F5F7]"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 font-mono tabular-nums sm:grid-cols-4">
        <div className="panel-surface p-3.5">
          <div className="text-[10px] text-[#71717A]">OFFICIAL INDEX I_n</div>
          <div className="mt-1 text-xl font-semibold text-[#F5F5F7]">
            {latest ? formatBpsPercent(latest.iBps) : "—"}
          </div>
          <div className="text-[11px] text-[#8A8A93]">
            {latest ? `${latest.iBps.toLocaleString("en-US")} bps` : "No finalized epoch"}
          </div>
        </div>

        <div className="panel-surface p-3.5">
          <div className="text-[10px] text-[#71717A]">24H VELOCITY V_n</div>
          <div
            className={`mt-1 text-xl font-semibold ${
              latest?.vBps === null || latest?.vBps === undefined
                ? "text-[#E2A856]"
                : latest.vBps >= 0
                  ? "text-[#4ADE80]"
                  : "text-[#EF4444]"
            }`}
          >
            {latest ? formatSignedBps(latest.vBps, latest.vFlag) : "—"}
          </div>
          <div className="text-[11px] text-[#8A8A93]">6-epoch lag (24h)</div>
        </div>

        <div className="panel-surface p-3.5">
          <div className="text-[10px] text-[#71717A]">RAW MINDSHARE M_n</div>
          <div className="mt-1 text-xl font-semibold text-[#CCFF00]">
            {latest ? formatBpsPercent(latest.mBps) : "—"}
          </div>
          <div className="text-[11px] text-[#8A8A93]">Before α = 0.3 EMA</div>
        </div>

        <div className="panel-surface p-3.5">
          <div className="text-[10px] text-[#71717A]">24H WEIGHTED POSTS</div>
          <div className="mt-1 text-xl font-semibold text-[#F5F5F7]">
            {latest ? Math.round(latest.weightedPosts).toLocaleString("en-US") : "—"}
          </div>
          <div className="text-[11px] text-[#8A8A93]">Threshold ≥ 30 for V_n</div>
        </div>
      </div>

      {/* Single-Narrative Dual-Pane IndexChart */}
      <IndexChart
        series={[
          {
            id: meta.id,
            label: meta.label,
            color: "#CCFF00",
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
            accent={sectorColor(meta.id)}
          />
        </div>

        <div className="panel-surface lg:col-span-5">
          <div className="border-b border-[#26262A] px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-[#F5F5F7]">
              Related Tokens · KOL Mentions
            </h3>
            <p className="font-mono text-[11px] text-[#8A8A93]">
              Auto-extracted from top KOL posts in {meta.label} · Live market data via DexScreener
            </p>
          </div>
          {!data.mentionedTokens || data.mentionedTokens.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-[#71717A]">
              No $TOKEN tickers mentioned by top KOLs in {meta.label} yet.
            </div>
          ) : (
            <div className="divide-y divide-[#26262A]">
              {data.mentionedTokens.map((tok) => {
                const priceLabel =
                  tok.priceUsd === null
                    ? "—"
                    : tok.priceUsd >= 1
                      ? `$${tok.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : `$${tok.priceUsd.toPrecision(3)}`;
                const volLabel =
                  tok.volume24hUsd === null
                    ? null
                    : tok.volume24hUsd >= 1_000_000
                      ? `$${(tok.volume24hUsd / 1_000_000).toFixed(1)}M vol`
                      : tok.volume24hUsd >= 1_000
                        ? `$${(tok.volume24hUsd / 1_000).toFixed(0)}K vol`
                        : `$${Math.round(tok.volume24hUsd)} vol`;
                const chg = tok.change24hPct;
                return (
                  <div
                    key={tok.symbol}
                    className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs tabular-nums"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TokenLogo symbol={tok.symbol} imageUrl={tok.imageUrl} size={26} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#F5F5F7]">${tok.symbol}</span>
                          {tok.name && (
                            <span className="truncate font-sans text-xs text-[#8A8A93]">
                              {tok.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#71717A]">
                          <span className="text-[#CCFF00]">
                            {tok.mentions} {tok.mentions === 1 ? "mention" : "mentions"}
                          </span>
                          <span>{tok.kolCount} KOL{tok.kolCount === 1 ? "" : "s"}</span>
                          {tok.chainId && <span className="uppercase">{tok.chainId}</span>}
                          {tok.dexUrl && (
                            <a
                              href={tok.dexUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[#A1A1AA] transition-colors hover:text-[#CCFF00]"
                            >
                              <span>DEX</span>
                              <ArrowUpRight className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[#F5F5F7]">{priceLabel}</div>
                      <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px]">
                        {chg !== null && (
                          <span className={chg >= 0 ? "text-[#4ADE80]" : "text-[#EF4444]"}>
                            {chg >= 0 ? "+" : ""}
                            {chg.toFixed(1)}%
                          </span>
                        )}
                        {volLabel && <span className="text-[#8A8A93]">{volLabel}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Influential Posts (Structured X Telemetry Only, Zero Raw Bodies) */}
      <section className="border border-[#26262A] bg-[#161618]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262A] bg-[#0D0D0E] px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#F5F5F7]">
              Top Influential Posts ({data.topPosts?.length ?? 0})
            </h3>
            <p className="font-mono text-[11px] text-[#8A8A93]">
              Ranked by AI relevance q × log engagement · Structured telemetry only (raw post text purged)
            </p>
          </div>
          <span className="border border-[#26262A] bg-[#161618] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
            PRIVACY-SAFE X LINKS
          </span>
        </div>

        {!data.topPosts || data.topPosts.length === 0 ? (
          <div className="p-6 text-center font-mono text-xs text-[#71717A]">
            No classified posts scored ≥ 25% relevance for {meta.label} in the latest window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#26262A] bg-[#111113] font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A]">
                <tr>
                  <th className="py-2.5 pl-4 font-medium">KOL</th>
                  <th className="py-2.5 text-right font-medium">Relevance q</th>
                  <th className="py-2.5 text-right font-medium">Likes</th>
                  <th className="hidden py-2.5 text-right font-medium sm:table-cell">Reposts</th>
                  <th className="hidden py-2.5 text-right font-medium md:table-cell">Quotes</th>
                  <th className="hidden py-2.5 text-right font-medium md:table-cell">Replies</th>
                  <th className="py-2.5 text-right font-medium">Posted</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Post</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F1F23] font-mono tabular-nums">
                {data.topPosts.map((post) => (
                  <tr key={post.tweetId} className="transition-colors hover:bg-[#1E1E21]">
                    <td className="py-2.5 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#F5F5F7]">@{post.handle}</span>
                        {post.followers > 0 && (
                          <span className="text-[10px] text-[#71717A]">
                            {post.followers >= 1000
                              ? `${(post.followers / 1000).toFixed(1)}K`
                              : post.followers}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-[#CCFF00]">
                        {Math.round(post.relevanceQ * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#F5F5F7]">
                      {post.likes.toLocaleString("en-US")}
                    </td>
                    <td className="hidden py-2.5 text-right text-[#A1A1AA] sm:table-cell">
                      {post.reposts.toLocaleString("en-US")}
                    </td>
                    <td className="hidden py-2.5 text-right text-[#A1A1AA] md:table-cell">
                      {post.quotes.toLocaleString("en-US")}
                    </td>
                    <td className="hidden py-2.5 text-right text-[#A1A1AA] md:table-cell">
                      {post.replies.toLocaleString("en-US")}
                    </td>
                    <td className="py-2.5 text-right text-[11px] text-[#71717A]">
                      {formatRelativeTime(post.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <a
                        href={`https://x.com/${post.handle}/status/${post.tweetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 border border-[#26262A] px-2 py-1 text-[10px] uppercase tracking-wider text-[#A1A1AA] transition-colors hover:border-[#CCFF00] hover:text-[#F5F5F7]"
                      >
                        <span>VIEW X</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
