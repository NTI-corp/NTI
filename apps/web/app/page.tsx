import Link from "next/link";
import { DM_Sans, IBM_Plex_Mono, Syne } from "next/font/google";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Coins,
  Layers,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getActiveChainId, getChain, getProtocolAddresses } from "@/lib/contracts";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { CopyAddrButton } from "@/components/landing/CopyAddrButton";
import { MindshareRing } from "@/components/landing/MindshareRing";
import { NtiBrandMark, RobinhoodChainBadge } from "@/components/landing/NtiLogos";
import { PinnedNarrativeDeck } from "@/components/landing/PinnedNarrativeDeck";
import { PinnedOracleAnatomy } from "@/components/landing/PinnedOracleAnatomy";
import { ScrollShowcaseEffects } from "@/components/landing/ScrollShowcaseEffects";

export const revalidate = 60;

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export default async function LandingPage() {
  const [snapshot, radar] = await Promise.all([
    fetchIndexesSnapshot(),
    fetchRadarAlerts({
      realtimeUnlocked: false,
      wallet: null,
      stakeFormatted: "0",
      minStakeRequired: "100,000",
    }),
  ]);

  const chainId = getActiveChainId();
  const chain = getChain(chainId);
  const explorerBase =
    chain.blockExplorers?.default.url ?? "https://explorer.testnet.chain.robinhood.com";
  const addresses = getProtocolAddresses(chainId);

  const sortedNarratives = [...snapshot.narratives].sort((a, b) => b.iBps - a.iBps);
  const leader = sortedNarratives[0];
  const fastest = [...snapshot.narratives]
    .filter((n) => n.vBps !== null)
    .sort((a, b) => (b.vBps ?? -999999) - (a.vBps ?? -999999))[0];
  const activeEpoch = snapshot.latestObservedEpoch ?? snapshot.latestFinalEpoch;
  const totalBps = snapshot.narratives.reduce((sum, n) => sum + n.iBps, 0);

  const coreContracts = [
    { name: "OracleCommit", role: "Four-hour sector commits and finalization", address: addresses.oracleCommit },
    { name: "NTIRegistry", role: "Canonical protocol address directory", address: addresses.registry },
    { name: "Staking", role: "Tiered $NTI locks and native ETH yield", address: addresses.staking },
    { name: "NarrativeMarket", role: "Parimutuel pair markets across 24h and 7d", address: addresses.narrativeMarket },
    { name: "BasketFactory", role: "Uniswap V3 TWAP narrative vaults", address: addresses.basketFactory },
    { name: "Dispute", role: "Permissionless omission and math challenges", address: addresses.dispute },
  ].filter((c): c is { name: string; role: string; address: `0x${string}` } => Boolean(c.address));

  return (
    <div
      className={`${syne.variable} ${dmSans.variable} ${ibmMono.variable} min-h-screen bg-[#08090D] text-[#F4F6FA] antialiased`}
      style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <ScrollShowcaseEffects />

      {/* Clean Single-Row Sticky Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#1D2230] bg-[#08090D]/88 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <NtiBrandMark className="h-8 w-8" />
              <span
                className="text-base font-bold tracking-tight text-[#F4F6FA]"
                style={{ fontFamily: "var(--font-syne), sans-serif" }}
              >
                NTI
              </span>
            </Link>
            <div className="hidden sm:block">
              <RobinhoodChainBadge chainId={chainId} />
            </div>
          </div>

          <nav
            aria-label="Landing navigation"
            className="hidden items-center gap-7 text-xs font-medium text-[#94A0B8] md:flex"
          >
            <a href="#narratives" className="transition-colors hover:text-[#F4F6FA]">
              Narratives
            </a>
            <a href="#engine" className="transition-colors hover:text-[#F4F6FA]">
              Engine
            </a>
            <a href="#ecosystem" className="transition-colors hover:text-[#F4F6FA]">
              Ecosystem
            </a>
            <a href="#contracts" className="transition-colors hover:text-[#F4F6FA]">
              Contracts
            </a>
          </nav>

          <Link
            href="/terminal"
            className="inline-flex items-center gap-2 rounded-xl bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#08090D] transition-colors hover:bg-[#7DD3FC]"
          >
            <span>Launch Terminal</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main>
        {/* Asymmetric Hero with Pure-CSS Atmosphere & Concentric Mindshare Ring */}
        <section
          className="relative overflow-hidden border-b border-[#1D2230]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 76% 24%, rgba(56, 189, 248, 0.12), transparent 46%), radial-gradient(circle at 18% 82%, rgba(245, 158, 11, 0.08), transparent 42%)",
          }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#242B3D] bg-[#10131C] px-3 py-1 text-xs font-medium text-[#38BDF8]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                <span>
                  {activeEpoch
                    ? `Epoch #${activeEpoch.epochId} · ${activeEpoch.status}`
                    : "Attention Oracle"}
                </span>
              </div>

              <h1
                className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-[#F4F6FA] sm:text-5xl lg:text-[56px]"
                style={{ fontFamily: "var(--font-syne), sans-serif" }}
              >
                The Signal Beneath{" "}
                <span className="bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#F59E0B] bg-clip-text text-transparent">
                  Crypto Attention.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#94A0B8] sm:text-lg">
                NTI converts real-time crypto X conversations across 25+ curated accounts into
                ten dispute-guarded sector weights summing to 10,000 basis points — settling pair
                markets, TWAP vaults, and native ETH staker yields.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#38BDF8] px-5 py-3 text-sm font-semibold text-[#08090D] transition-colors hover:bg-[#7DD3FC]"
                >
                  <span>Open Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#283044] bg-[#10131C] px-5 py-3 text-sm font-semibold text-[#F4F6FA] transition-colors hover:border-[#38BDF8]/60"
                >
                  <span>Pair Markets</span>
                </Link>
                <Link
                  href="/methodology"
                  className="inline-flex items-center gap-1 px-3 py-3 text-sm font-medium text-[#94A0B8] transition-colors hover:text-[#F4F6FA]"
                >
                  <span>Methodology</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              {addresses.oracleCommit && (
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <CopyAddrButton label="OracleCommit" address={addresses.oracleCommit} />
                  <span
                    className="text-xs text-[#64748B]"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    Sum {totalBps.toLocaleString("en-US")} bps
                  </span>
                </div>
              )}
            </div>

            {/* Right: Concentric Mindshare Donut Ring + Live Stats */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-[#222836] bg-[#10131C]/95 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-7">
                <div className="mb-6 flex items-center justify-between border-b border-[#1D2230] pb-4">
                  <div>
                    <span className="text-xs font-medium text-[#64748B]">
                      Live Distribution Vector
                    </span>
                    <div
                      className="mt-0.5 text-sm font-semibold text-[#F4F6FA]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch ? `Epoch #${activeEpoch.epochId}` : "Current Epoch"} ·{" "}
                      <span className="text-[#10B981]">
                        {activeEpoch?.status.toUpperCase() ?? "LIVE"}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F59E0B]/10 px-2.5 py-1 text-xs font-medium text-[#F59E0B]">
                    <Radar className="h-3.5 w-3.5" />
                    <span>{radar.alerts.length} Signals</span>
                  </span>
                </div>

                <MindshareRing
                  narratives={snapshot.narratives}
                  epochId={activeEpoch?.epochId ?? null}
                />

                <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-[#1D2230] pt-5">
                  <div className="rounded-xl bg-[#0B0D13] p-3">
                    <div className="text-[11px] text-[#64748B]">Leader</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-[#F4F6FA]">
                      {leader?.label ?? "—"}
                    </div>
                    <div
                      className="text-xs font-semibold text-[#38BDF8]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {leader ? formatBpsPercent(leader.iBps) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#0B0D13] p-3">
                    <div className="text-[11px] text-[#64748B]">Velocity</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-[#F4F6FA]">
                      {fastest?.label ?? "Warming"}
                    </div>
                    <div
                      className="text-xs font-semibold text-[#10B981]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {fastest?.vBps !== null && fastest?.vBps !== undefined
                        ? formatSignedBps(fastest.vBps)
                        : "EMA 3"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#0B0D13] p-3">
                    <div className="text-[11px] text-[#64748B]">Manifest</div>
                    <div
                      className="mt-0.5 truncate text-xs font-semibold text-[#F4F6FA]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch ? truncateHex(activeEpoch.datasetHash, 5, 4) : "Pending"}
                    </div>
                    <div className="text-[11px] text-[#64748B]">SHA-256</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pinned Scroll 1: Horizontal 10-Sector Narrative Deck */}
        <PinnedNarrativeDeck
          narratives={snapshot.narratives}
          epochId={activeEpoch?.epochId ?? null}
        />

        {/* Pinned Scroll 2: 4-Stage Scroll-Driven Oracle Anatomy */}
        <PinnedOracleAnatomy />

        {/* Scroll-Driven Asymmetric Ecosystem Bento + Live Radar */}
        <section
          id="ecosystem"
          className="border-t border-[#1D2230] bg-[#0B0D13] py-20 lg:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
                  On-Chain Applications
                </span>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight text-[#F4F6FA] sm:text-4xl"
                  style={{ fontFamily: "var(--font-syne), sans-serif" }}
                >
                  Four Ways to Trade &amp; Govern Attention
                </h2>
              </div>
              <Link
                href="/terminal"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#38BDF8] hover:underline"
              >
                <span>Open Full Terminal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              {/* Feature Bento Cards (Left 8 cols) */}
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
                <Link
                  href="/markets"
                  data-scroll-card
                  className="group flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 transition-colors hover:border-[#38BDF8]/60"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242B3D] bg-[#08090D] text-[#38BDF8]">
                        <Activity className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-[#38BDF8]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#38BDF8]">
                        24h &amp; 7d Pools
                      </span>
                    </div>
                    <h3
                      className="mt-5 text-xl font-bold text-[#F4F6FA] group-hover:text-[#38BDF8]"
                      style={{ fontFamily: "var(--font-syne), sans-serif" }}
                    >
                      Narrative Pair Markets
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A0B8]">
                      Bet on which crypto narrative leads the next epoch cycle in pure parimutuel
                      ETH pools with zero external price oracles.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#1D2230] pt-4 text-xs text-[#CBD5E1]">
                    <span style={{ fontFamily: "var(--font-ibm-mono), monospace" }}>
                      0.1% Pool Fee
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:text-[#38BDF8]">
                      <span>Explore</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>

                <Link
                  href="/baskets"
                  data-scroll-card
                  className="group flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 transition-colors hover:border-[#10B981]/60"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242B3D] bg-[#08090D] text-[#10B981]">
                        <Layers className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#10B981]">
                        Uniswap V3 TWAP
                      </span>
                    </div>
                    <h3
                      className="mt-5 text-xl font-bold text-[#F4F6FA] group-hover:text-[#10B981]"
                      style={{ fontFamily: "var(--font-syne), sans-serif" }}
                    >
                      TWAP Narrative Baskets
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A0B8]">
                      Deposit ETH into curated token baskets protected by 30-minute Uniswap V3
                      TWAP pricing and permissionless redemptions.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#1D2230] pt-4 text-xs text-[#CBD5E1]">
                    <span style={{ fontFamily: "var(--font-ibm-mono), monospace" }}>
                      30m TWAP Bound
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:text-[#10B981]">
                      <span>Open Vaults</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>

                <Link
                  href="/stake"
                  data-scroll-card
                  className="group flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 transition-colors hover:border-[#F59E0B]/60"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242B3D] bg-[#08090D] text-[#F59E0B]">
                        <Coins className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-[#F59E0B]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#F59E0B]">
                        30% ETH Fees
                      </span>
                    </div>
                    <h3
                      className="mt-5 text-xl font-bold text-[#F4F6FA] group-hover:text-[#F59E0B]"
                      style={{ fontFamily: "var(--font-syne), sans-serif" }}
                    >
                      Stake $NTI &amp; Tiers
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A0B8]">
                      Lock 100k, 1M, or 5M $NTI to unlock zero-delay Radar signals, up to 50% fee
                      discounts, and 30% of protocol ETH revenue.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#1D2230] pt-4 text-xs text-[#CBD5E1]">
                    <span style={{ fontFamily: "var(--font-ibm-mono), monospace" }}>
                      Up to 50% Off
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:text-[#F59E0B]">
                      <span>Stake</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>

                <Link
                  href="/grants"
                  data-scroll-card
                  className="group flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 transition-colors hover:border-[#818CF8]/60"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242B3D] bg-[#08090D] text-[#818CF8]">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-[#818CF8]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#818CF8]">
                        Quadratic Rounds
                      </span>
                    </div>
                    <h3
                      className="mt-5 text-xl font-bold text-[#F4F6FA] group-hover:text-[#818CF8]"
                      style={{ fontFamily: "var(--font-syne), sans-serif" }}
                    >
                      Grants &amp; Disputes
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A0B8]">
                      Direct 30% of fee revenue into quadratic ecosystem rounds or verify SHA-256
                      dataset proofs via Oracle &amp; Disputes.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#1D2230] pt-4 text-xs text-[#CBD5E1]">
                    <span style={{ fontFamily: "var(--font-ibm-mono), monospace" }}>
                      30% Ecosystem Pool
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:text-[#818CF8]">
                      <span>Govern</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              </div>

              {/* Live Radar Signals Panel (Right 4 cols) */}
              <div
                data-scroll-card
                className="flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 lg:col-span-4"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[#1D2230] pb-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[#F4F6FA]">
                      <Radar className="h-4 w-4 text-[#F59E0B]" />
                      <span>Emerging Radar</span>
                    </span>
                    <span
                      className="text-[11px] text-[#F59E0B]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      60m Staker Edge
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {radar.alerts.slice(0, 4).map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-[#1E2434] bg-[#0B0D13] p-3.5"
                      >
                        <div
                          className="flex items-center justify-between text-[10px] uppercase text-[#64748B]"
                          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                        >
                          <span className="text-[#38BDF8]">
                            {alert.kind === "new_token" ? "Token Signal" : "Velocity Spike"}
                          </span>
                          <span>Sector #{alert.narrativeId}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-[#F4F6FA]">
                            {alert.narrativeLabel}
                          </span>
                          {alert.vBps !== null && (
                            <span
                              className="text-xs font-semibold tabular-nums text-[#10B981]"
                              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                            >
                              {formatSignedBps(alert.vBps)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {radar.alerts.length === 0 && (
                      <div className="rounded-xl border border-[#1E2434] bg-[#0B0D13] p-4 text-xs text-[#64748B]">
                        Radar scanner armed — awaiting next velocity breakout.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-2 border-t border-[#1D2230] pt-4">
                  <Link
                    href="/radar"
                    className="flex items-center justify-between rounded-xl border border-[#242B3D] bg-[#0B0D13] px-4 py-2.5 text-xs font-medium text-[#F4F6FA] transition-colors hover:border-[#38BDF8]"
                  >
                    <span>Open Radar Feed</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#38BDF8]" />
                  </Link>
                  <Link
                    href="/heatmap"
                    className="flex items-center justify-between rounded-xl border border-[#242B3D] bg-[#0B0D13] px-4 py-2.5 text-xs font-medium text-[#94A0B8] transition-colors hover:border-[#10B981] hover:text-[#F4F6FA]"
                  >
                    <span>Builder Heatmap</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#10B981]" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contracts Ledger & Closing Banner */}
        <section id="contracts" className="border-t border-[#1D2230] bg-[#08090D] py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#10B981]">
                  Verified Infrastructure
                </span>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight text-[#F4F6FA] sm:text-4xl"
                  style={{ fontFamily: "var(--font-syne), sans-serif" }}
                >
                  Deployed Contracts on Robinhood Chain
                </h2>
              </div>
              <a
                href={explorerBase}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#38BDF8] hover:underline"
              >
                <span>Open Explorer</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {coreContracts.map((c) => (
                <div
                  key={c.name}
                  data-scroll-card
                  className="flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold text-[#F4F6FA]">
                        <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                        <span>{c.name}</span>
                      </span>
                      <a
                        href={`${explorerBase}/address/${c.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-[#38BDF8] hover:underline"
                      >
                        <span>Explorer</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="mt-1.5 text-xs text-[#94A0B8]">{c.role}</p>
                  </div>
                  <div className="mt-4">
                    <CopyAddrButton address={c.address} />
                  </div>
                </div>
              ))}
            </div>

            {/* Clean Dark CTA Card */}
            <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-3xl border border-[#262E42] bg-gradient-to-br from-[#131826] via-[#10131C] to-[#0B0D13] p-8 sm:p-10 lg:flex-row lg:items-center">
              <div>
                <h3
                  className="text-2xl font-bold tracking-tight text-[#F4F6FA] sm:text-3xl"
                  style={{ fontFamily: "var(--font-syne), sans-serif" }}
                >
                  Ready to trade live narrative momentum?
                </h3>
                <p className="mt-2 max-w-xl text-sm text-[#94A0B8]">
                  Enter the full workspace to inspect real-time sector trajectories, stake $NTI,
                  allocate into TWAP baskets, or participate in pair pools.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#38BDF8] px-6 py-3 text-sm font-semibold text-[#08090D] transition-colors hover:bg-[#7DD3FC]"
                >
                  <span>Enter Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/oracle"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#2B3345] px-6 py-3 text-sm font-semibold text-[#F4F6FA] transition-colors hover:border-[#38BDF8]"
                >
                  <span>Audit Oracle</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Footer with Brand Logo */}
      <footer className="border-t border-[#1D2230] bg-[#08090D]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-[#64748B] sm:px-6">
          <div className="flex items-center gap-3">
            <NtiBrandMark className="h-6 w-6" />
            <span>NTI Protocol · Measures crypto narrative attention, not token prices.</span>
          </div>
          <nav className="flex flex-wrap items-center gap-5 font-medium text-[#94A0B8]">
            <Link href="/terminal" className="hover:text-[#F4F6FA]">
              Terminal
            </Link>
            <Link href="/markets" className="hover:text-[#F4F6FA]">
              Markets
            </Link>
            <Link href="/baskets" className="hover:text-[#F4F6FA]">
              Baskets
            </Link>
            <Link href="/oracle" className="hover:text-[#F4F6FA]">
              Oracle
            </Link>
            <Link href="/methodology" className="hover:text-[#F4F6FA]">
              Methodology
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
