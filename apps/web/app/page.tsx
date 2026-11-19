import Link from "next/link";
import { cookies } from "next/headers";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import { EpochBadge } from "@/components/EpochBadge";
import { IndexChart, NARRATIVE_CHART_COLORS } from "@/components/IndexChart";
import { RadarFeed } from "@/components/RadarFeed";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";

export const revalidate = 60;

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const siwe = await getSiweSessionState(cookieStore.get(SIWE_SESSION_COOKIE)?.value);

  const [snapshot, radar] = await Promise.all([
    fetchIndexesSnapshot(),
    fetchRadarAlerts({
      realtimeUnlocked: siwe.authenticated && siwe.hasRadarAccess,
      wallet: siwe.address,
      stakeFormatted: siwe.stakeFormatted,
      minStakeRequired: siwe.radarMinStakeFormatted,
    }),
  ]);

  const sortedNarratives = [...snapshot.narratives].sort((a, b) => b.iBps - a.iBps);
  const topFive = sortedNarratives.slice(0, 5);
  const combinedSeries = topFive.map((n, idx) => ({
    id: n.narrativeId,
    label: n.label,
    color: NARRATIVE_CHART_COLORS[idx % NARRATIVE_CHART_COLORS.length]!,
    points: snapshot.recentSeries[n.narrativeId] ?? [],
  }));

  const leader = sortedNarratives[0];
  const fastest = [...snapshot.narratives]
    .filter((n) => n.vBps !== null)
    .sort((a, b) => (b.vBps ?? -999999) - (a.vBps ?? -999999))[0];
  const activeEpoch = snapshot.latestObservedEpoch ?? snapshot.latestFinalEpoch;

  return (
    <div>
      {snapshot.awaitingFirstEpoch && <AwaitingEpochBanner />}

      {/* Top Instrument Header + Telemetry Strip */}
      <section className="mb-5 flex flex-col gap-4 border-b border-[#1B2028] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
              NARRATIVE TELEMETRY · 4H EPOCH CADENCE
            </span>
            {activeEpoch && (
              <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} />
            )}
            {snapshot.pendingFinalization && (
              <span className="rounded border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                NEW EPOCH COMMITTED · AWAITING 2H FINALIZATION
              </span>
            )}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#EDF1F7] sm:text-3xl">
            Crypto Narrative Mindshare Index
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Official values reflect finalized epochs only (Σ I_n = 10,000 bps via Hamilton rounding, 10% KOL truncation cap, α = 0.3 EMA).
            Measures X discussion share across 10 narratives; does not predict token prices.
          </p>
        </div>

        {/* Key Desk Counters */}
        <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
          <div className="panel-surface rounded px-3 py-2">
            <div className="text-[10px] text-[#556173]">TOP MINDSHARE</div>
            <div className="mt-0.5 text-xs font-semibold text-[#EDF1F7]">
              {leader?.label ?? "—"}
            </div>
            <div className="text-[11px] text-[#38BDF8]">
              {leader ? formatBpsPercent(leader.iBps) : "—"}
            </div>
          </div>

          <div className="panel-surface rounded px-3 py-2">
            <div className="text-[10px] text-[#556173]">HIGHEST VELOCITY</div>
            <div className="mt-0.5 text-xs font-semibold text-[#EDF1F7]">
              {fastest?.label ?? "—"}
            </div>
            <div className="text-[11px] text-[#10B981]">
              {fastest ? formatSignedBps(fastest.vBps, fastest.vFlag) : "—"}
            </div>
          </div>

          <div className="panel-surface rounded px-3 py-2">
            <div className="text-[10px] text-[#556173]">RADAR ALERTS</div>
            <div className="mt-0.5 text-xs font-semibold text-[#EDF1F7]">
              {radar.alerts.length} ACTIVE
            </div>
            <div className="text-[11px] text-[#F59E0B]">
              {radar.lockedCount > 0 ? `${radar.lockedCount} STAKER-ONLY` : "ALL PUBLIC"}
            </div>
          </div>
        </div>
      </section>

      {/* Main Split Workspace: Left 8 Cols (Chart + 10 Cards), Right 4 Cols (Radar Rail) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <IndexChart
            series={combinedSeries}
            title="Top 5 Narratives · Combined Mindshare Trajectory (I_n)"
            subtitle="Toggle narratives in the legend · Velocity bars track the primary selected series"
            showVelocityBars
          />

          {/* 10 Narrative Cards Grid */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
                All 10 Tracked Narratives
              </h2>
              <span className="font-mono text-[11px] text-[#556173] tabular-nums">
                SUM Σ I_n ={" "}
                {snapshot.narratives
                  .reduce((sum, n) => sum + n.iBps, 0)
                  .toLocaleString("en-US")}{" "}
                bps
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sortedNarratives.map((n, rank) => {
                const vPositive = (n.vBps ?? 0) >= 0;
                const barWidth = Math.min(100, (n.iBps / 2500) * 100);
                return (
                  <Link
                    key={n.narrativeId}
                    href={`/narratives/${n.narrativeId}`}
                    className="group panel-surface flex flex-col justify-between rounded-md p-3.5 transition-colors hover:border-[#2A3342] hover:bg-[#11161F]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-[#556173] tabular-nums">
                            #{String(rank + 1).padStart(2, "0")}
                          </span>
                          <h3 className="font-display text-sm font-semibold text-[#EDF1F7] group-hover:text-[#38BDF8]">
                            {n.label}
                          </h3>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-[#8A96A8]">
                          {n.description}
                        </p>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div className="text-base font-semibold text-[#EDF1F7]">
                          {formatBpsPercent(n.iBps)}
                        </div>
                        <div className="text-[10px] text-[#556173]">
                          {n.iBps.toLocaleString("en-US")} bps
                        </div>
                      </div>
                    </div>

                    {/* Proportional Mindshare Bar */}
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#1B2028]">
                      <div
                        className="h-full rounded-full bg-[#38BDF8] transition-all group-hover:bg-[#10B981]"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          n.vBps === null
                            ? "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                            : vPositive
                              ? "border-[#10B981]/35 bg-[#10B981]/10 text-[#10B981]"
                              : "border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]"
                        }`}
                      >
                        V_n {formatSignedBps(n.vBps, n.vFlag)}
                      </span>
                      <span className="text-[10px] text-[#556173]">
                        M_n {formatBpsPercent(n.mBps, 1)} · {Math.round(n.weightedPosts)} w-posts
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Rail: Latest 5 Radar Alerts + Quick Protocol Actions */}
        <aside className="space-y-5 xl:col-span-4">
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
                  Emerging Radar · Latest 5
                </h2>
                <p className="font-mono text-[10px] text-[#8A96A8]">
                  {radar.realtimeUnlocked
                    ? "STAKER REAL-TIME FEED UNLOCKED"
                    : "PUBLIC FEED · 60-MIN DELAY ON FRESH SIGNALS"}
                </p>
              </div>
              <Link
                href="/radar"
                className="font-mono text-[11px] text-[#38BDF8] hover:underline"
              >
                ALL ALERTS →
              </Link>
            </div>
            <RadarFeed
              alerts={radar.alerts}
              realtimeUnlocked={radar.realtimeUnlocked}
              maxItems={5}
              compact
            />
          </div>

          {/* Terminal Quick-Launch Modules */}
          <div className="panel-surface rounded-md p-4">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#556173]">
              PROTOCOL ACTION SURFACES
            </h3>
            <div className="mt-3 space-y-2">
              <Link
                href="/markets"
                className="flex items-center justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2.5 transition-colors hover:border-[#2A3342]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#EDF1F7]">
                    Narrative Pair Markets
                  </div>
                  <div className="font-mono text-[10px] text-[#8A96A8]">
                    24h &amp; 7d parimutuel pools · 0.1% fee
                  </div>
                </div>
                <span className="font-mono text-xs text-[#10B981]">→</span>
              </Link>
              <Link
                href="/heatmap"
                className="flex items-center justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2.5 transition-colors hover:border-[#2A3342]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#EDF1F7]">
                    Builder Opportunity Heatmap
                  </div>
                  <div className="font-mono text-[10px] text-[#8A96A8]">
                    High mindshare vs. thin builder density
                  </div>
                </div>
                <span className="font-mono text-xs text-[#38BDF8]">→</span>
              </Link>
              <Link
                href="/baskets"
                className="flex items-center justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2.5 transition-colors hover:border-[#2A3342]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#EDF1F7]">
                    Narrative Baskets
                  </div>
                  <div className="font-mono text-[10px] text-[#8A96A8]">
                    Whitelisted Uniswap V3 vaults · 30m TWAP NAV
                  </div>
                </div>
                <span className="font-mono text-xs text-[#F59E0B]">→</span>
              </Link>
              <Link
                href="/stake"
                className="flex items-center justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2.5 transition-colors hover:border-[#2A3342]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#EDF1F7]">
                    Stake $NTI · Earn 30% ETH Fees
                  </div>
                  <div className="font-mono text-[10px] text-[#8A96A8]">
                    Unlock real-time Radar &amp; up to 50% market fee discount
                  </div>
                </div>
                <span className="font-mono text-xs text-[#10B981]">→</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
