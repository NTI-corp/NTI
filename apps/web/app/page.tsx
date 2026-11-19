import Link from "next/link";
import { cookies } from "next/headers";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { getActiveChainId, getProtocolAddresses } from "@/lib/contracts";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { EpochBadge } from "@/components/EpochBadge";
import { IndexChart, NARRATIVE_CHART_COLORS } from "@/components/IndexChart";
import { RadarFeed } from "@/components/RadarFeed";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";
import { HalftoneHorizonCanvas } from "@/components/HalftoneHorizonCanvas";
import { CopyContractPill, TacticalFrame } from "@/components/TacticalFrame";
import { LiveTickerBar } from "@/components/LiveTickerBar";

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

  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);
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
  const totalBps = snapshot.narratives.reduce((sum, n) => sum + n.iBps, 0);

  return (
    <div className="space-y-6">
      {snapshot.awaitingFirstEpoch && <AwaitingEpochBanner />}

      {/* Swiss Telemetry Bar + Dithered Horizon Hero (chainsightoracle + squeez + runecurve + zkblast) */}
      <section className="relative overflow-hidden border border-[#1B202C] bg-[#06070A]">
        {/* Top 4-Cell Protocol Strip */}
        <div className="grid grid-cols-2 border-b border-[#1B202C] bg-[#0B0D12]/90 font-mono text-[10px] uppercase tracking-[0.16em] lg:grid-cols-4">
          <div className="border-r border-b border-[#1B202C] px-4 py-2.5 lg:border-b-0">
            <span className="block text-[#5A6478]">PROTOCOL</span>
            <span className="mt-0.5 block text-[#F3F5F8]">NTI ORACLE · v1.0</span>
          </div>
          <div className="border-b border-[#1B202C] px-4 py-2.5 lg:border-r lg:border-b-0">
            <span className="block text-[#5A6478]">SETTLEMENT</span>
            <span className="mt-0.5 block text-[#B8FF2E]">ROBINHOOD CHAIN · {chainId}</span>
          </div>
          <div className="border-r border-[#1B202C] px-4 py-2.5">
            <span className="block text-[#5A6478]">COMPUTE ENGINE</span>
            <span className="mt-0.5 block text-[#23F7DD]">DECIMAL(40) · 10% CAP · α=0.3</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <div>
              <span className="block text-[#5A6478]">ACTIVE EPOCH</span>
              <span className="mt-0.5 block text-[#F3F5F8] tabular-nums">
                {activeEpoch ? `#${activeEpoch.epochId} · ${activeEpoch.status.toUpperCase()}` : "STANDBY"}
              </span>
            </div>
            {activeEpoch && (
              <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} compact />
            )}
          </div>
        </div>

        {/* Hero Canvas Field + Content */}
        <div className="terminal-grid-bg relative">
          <div className="absolute inset-0 opacity-85">
            <HalftoneHorizonCanvas />
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-8 px-5 py-9 sm:px-8 lg:grid-cols-12 lg:items-center lg:py-12">
            {/* Left Thesis + Contract Pill */}
            <div className="space-y-5 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 border border-[#2B3345] bg-[#0B0D12]/90 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#B8FF2E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
                  VERIFIED ON-CHAIN MINDSHARE
                </span>
                {snapshot.pendingFinalization && (
                  <span className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#F59E0B]">
                    NEW EPOCH COMMITTED · 2H DISPUTE WINDOW
                  </span>
                )}
              </div>

              <h1 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-[#F3F5F8] sm:text-5xl lg:text-6xl">
                Measure Crypto Attention{" "}
                <span className="text-[#B8FF2E]">On-Chain.</span>
              </h1>

              <p className="max-w-xl text-sm leading-relaxed text-[#8B94A7] sm:text-base">
                Deterministic 4-hour narrative mindshare across 10 crypto sectors, attested by
                independent EIP-712 validators and settled directly on Robinhood Chain.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {addresses.oracleCommit && (
                  <CopyContractPill label="ORACLE CA" address={addresses.oracleCommit} />
                )}
                <span className="font-mono text-[11px] text-[#5A6478] tabular-nums">
                  Σ I_n = {totalBps.toLocaleString("en-US")} BPS · DATA:{" "}
                  {snapshot.dataSource.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Right Tactical Reticle Terminal Card */}
            <div className="lg:col-span-5">
              <TacticalFrame
                eyebrow="LIVE TERMINAL SNAPSHOT"
                rightLabel={activeEpoch ? `EP-${activeEpoch.epochId}` : "SYNCED"}
              >
                <div className="grid grid-cols-2 divide-x divide-y divide-[#1B202C] font-mono tabular-nums">
                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      TOP MINDSHARE
                    </div>
                    <div className="mt-1 font-display text-base font-semibold text-[#F3F5F8]">
                      {leader?.label ?? "—"}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[#B8FF2E]">
                      {leader ? formatBpsPercent(leader.iBps) : "—"}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      FASTEST VELOCITY
                    </div>
                    <div className="mt-1 font-display text-base font-semibold text-[#F3F5F8]">
                      {fastest?.label ?? "—"}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[#23F7DD]">
                      {fastest ? formatSignedBps(fastest.vBps, fastest.vFlag) : "—"}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      RADAR FEED
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#F3F5F8]">
                      {radar.alerts.length} SIGNALS
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#F59E0B]">
                      {radar.lockedCount > 0 ? `${radar.lockedCount} STAKER-GATED` : "ALL PUBLIC"}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      DATASET HASH
                    </div>
                    <div className="mt-1 text-xs text-[#F3F5F8]">
                      {activeEpoch?.datasetHash
                        ? truncateHex(activeEpoch.datasetHash, 8, 6)
                        : "PENDING"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#23F7DD]">HAMILTON EXACT</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[#1B202C] p-3">
                  <Link
                    href="/markets"
                    className="flex min-h-[42px] items-center justify-center bg-[#B8FF2E] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
                  >
                    Trade Markets ↗
                  </Link>
                  <Link
                    href="/stake"
                    className="flex min-h-[42px] items-center justify-center border border-[#2B3345] bg-[#11141C] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#F3F5F8] transition-colors hover:border-[#23F7DD]/60 hover:text-[#23F7DD]"
                  >
                    Stake $NTI →
                  </Link>
                </div>
              </TacticalFrame>
            </div>
          </div>
        </div>

        {/* Continuous Scrollable Narrative Ticker */}
        <LiveTickerBar
          narratives={snapshot.narratives}
          epochId={activeEpoch?.epochId ?? null}
        />
      </section>

      {/* Main 12-Col Bento Terminal: Left 8 Cols (Chart + Matrix), Right 4 Cols (Radar + Action Modules) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <IndexChart
            series={combinedSeries}
            title="Top 5 Narratives · Mindshare Trajectory (I_n)"
            subtitle="Toggle series in legend · Velocity bars track the primary selected sector"
            showVelocityBars
          />

          {/* 10 Tracked Narratives Matrix */}
          <section>
            <div className="mb-3 flex items-center justify-between border-b border-[#1B202C] pb-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#F3F5F8]">
                Narrative Index Matrix · 10 Tracked Sectors
              </h2>
              <span className="font-mono text-[11px] text-[#5A6478] tabular-nums">
                SUM Σ I_n = {totalBps.toLocaleString("en-US")} BPS
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
                    className="group panel-surface flex flex-col justify-between p-4 transition-colors hover:border-[#B8FF2E]/45 hover:bg-[#11141C]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="border border-[#1B202C] bg-[#06070A] px-1.5 py-0.5 font-mono text-[10px] text-[#8B94A7] tabular-nums">
                            #{String(rank + 1).padStart(2, "0")}
                          </span>
                          <h3 className="font-display text-sm font-semibold text-[#F3F5F8] transition-colors group-hover:text-[#B8FF2E]">
                            {n.label}
                          </h3>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[11px] text-[#8B94A7]">
                          {n.description}
                        </p>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div className="text-base font-semibold text-[#F3F5F8]">
                          {formatBpsPercent(n.iBps)}
                        </div>
                        <div className="text-[10px] text-[#5A6478]">
                          {n.iBps.toLocaleString("en-US")} bps
                        </div>
                      </div>
                    </div>

                    {/* Proportional Mindshare Bar */}
                    <div className="mt-3 h-1 w-full overflow-hidden bg-[#1B202C]">
                      <div
                        className="h-full bg-[#23F7DD] transition-all group-hover:bg-[#B8FF2E]"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span
                        className={`border px-1.5 py-0.5 text-[10px] font-semibold ${
                          n.vBps === null
                            ? "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                            : vPositive
                              ? "border-[#B8FF2E]/35 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                              : "border-[#F43F5E]/35 bg-[#F43F5E]/10 text-[#F43F5E]"
                        }`}
                      >
                        V_n {formatSignedBps(n.vBps, n.vFlag)}
                      </span>
                      <span className="text-[10px] text-[#5A6478]">
                        M_n {formatBpsPercent(n.mBps, 1)} · {Math.round(n.weightedPosts)} w-posts
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Rail */}
        <aside className="space-y-5 xl:col-span-4">
          <div>
            <div className="mb-2.5 flex items-center justify-between border-b border-[#1B202C] pb-2">
              <div>
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-[#F3F5F8]">
                  Emerging Radar · Latest 5
                </h2>
                <p className="font-mono text-[10px] text-[#8B94A7]">
                  {radar.realtimeUnlocked
                    ? "STAKER REAL-TIME STREAM UNLOCKED"
                    : "PUBLIC FEED · 60-MIN DELAY ON FRESH SIGNALS"}
                </p>
              </div>
              <Link
                href="/radar"
                className="font-mono text-[11px] text-[#B8FF2E] hover:underline"
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

          <TacticalFrame eyebrow="PROTOCOL ACTION SURFACES" rightLabel="ON-CHAIN">
            <div className="divide-y divide-[#1B202C]">
              <Link
                href="/markets"
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#11141C]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#F3F5F8]">
                    Narrative Pair Markets
                  </div>
                  <div className="font-mono text-[10px] text-[#8B94A7]">
                    24h &amp; 7d parimutuel pools · 0.1% fee
                  </div>
                </div>
                <span className="font-mono text-xs text-[#B8FF2E]">→</span>
              </Link>
              <Link
                href="/heatmap"
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#11141C]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#F3F5F8]">
                    Builder Opportunity Heatmap
                  </div>
                  <div className="font-mono text-[10px] text-[#8B94A7]">
                    High mindshare vs. thin builder density
                  </div>
                </div>
                <span className="font-mono text-xs text-[#23F7DD]">→</span>
              </Link>
              <Link
                href="/baskets"
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#11141C]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#F3F5F8]">
                    Narrative Baskets
                  </div>
                  <div className="font-mono text-[10px] text-[#8B94A7]">
                    Whitelisted Uniswap V3 vaults · 30m TWAP NAV
                  </div>
                </div>
                <span className="font-mono text-xs text-[#F59E0B]">→</span>
              </Link>
              <Link
                href="/stake"
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#11141C]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#F3F5F8]">
                    Stake $NTI · Earn 30% ETH Fees
                  </div>
                  <div className="font-mono text-[10px] text-[#8B94A7]">
                    Unlock real-time Radar &amp; up to 50% fee discount
                  </div>
                </div>
                <span className="font-mono text-xs text-[#B8FF2E]">→</span>
              </Link>
              <Link
                href="/oracle"
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#11141C]"
              >
                <div>
                  <div className="font-display text-xs font-semibold text-[#F3F5F8]">
                    Oracle Consensus &amp; Disputes
                  </div>
                  <div className="font-mono text-[10px] text-[#8B94A7]">
                    EIP-712 validator signatures &amp; delta chain proofs
                  </div>
                </div>
                <span className="font-mono text-xs text-[#23F7DD]">→</span>
              </Link>
            </div>
          </TacticalFrame>
        </aside>
      </div>
    </div>
  );
}
