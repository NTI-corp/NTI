import Link from "next/link";
import { DM_Sans, IBM_Plex_Mono, Outfit } from "next/font/google";
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

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["500", "600", "700"],
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
      className={`${outfit.variable} ${dmSans.variable} ${ibmMono.variable} min-h-screen w-full bg-[#07080A] text-[#F5F6F8] antialiased`}
      style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <ScrollShowcaseEffects />

      {/* Full-Width Single-Row Sticky Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-[#1A1E26] bg-[#07080A]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1680px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-14">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <NtiBrandMark className="h-8 w-8" />
              <span
                className="text-base font-bold tracking-tight text-[#F5F6F8]"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
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
            className="hidden items-center gap-8 text-xs font-medium text-[#9CA3AF] md:flex"
          >
            <a href="#narratives" className="transition-colors hover:text-[#F5F6F8]">
              Narratives
            </a>
            <a href="#engine" className="transition-colors hover:text-[#F5F6F8]">
              Engine
            </a>
            <a href="#ecosystem" className="transition-colors hover:text-[#F5F6F8]">
              Ecosystem
            </a>
            <a href="#contracts" className="transition-colors hover:text-[#F5F6F8]">
              Contracts
            </a>
          </nav>

          <Link
            href="/terminal"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F5F6F8] px-4 py-2 text-xs font-semibold text-[#07080A] transition-colors hover:bg-[#34D399]"
          >
            <span>Launch Terminal</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main className="w-full">
        {/* Full-Width Asymmetric Hero with Restrained Monochrome + Emerald Atmosphere */}
        <section
          className="relative w-full overflow-hidden border-b border-[#1A1E26]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 82% 20%, rgba(52, 211, 153, 0.08), transparent 45%)",
          }}
        >
          <div className="mx-auto grid w-full max-w-[1680px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:px-14 lg:py-24">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22262F] bg-[#0E1015] px-3 py-1 text-xs font-medium text-[#D1D5DB]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                <span>
                  {activeEpoch
                    ? `Epoch #${activeEpoch.epochId} · ${activeEpoch.status}`
                    : "Attention Oracle"}
                </span>
              </div>

              <h1
                className="mt-6 text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-[#F5F6F8] sm:text-6xl xl:text-[68px]"
                style={{ fontFamily: "var(--font-outfit), sans-serif" }}
              >
                The Signal Beneath{" "}
                <span className="text-[#8E96A4]">Crypto Attention.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
                NTI converts real-time crypto X conversations across 25+ curated accounts into
                ten dispute-guarded sector weights summing to 10,000 basis points — settling pair
                markets, TWAP vaults, and native ETH staker yields.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F5F6F8] px-6 py-3.5 text-sm font-semibold text-[#07080A] transition-colors hover:bg-[#34D399]"
                >
                  <span>Open Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#242933] bg-[#0E1015] px-6 py-3.5 text-sm font-semibold text-[#F5F6F8] transition-colors hover:border-[#34D399]/60"
                >
                  <span>Pair Markets</span>
                </Link>
                <Link
                  href="/methodology"
                  className="inline-flex items-center gap-1 px-4 py-3.5 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F5F6F8]"
                >
                  <span>Methodology</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              {addresses.oracleCommit && (
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <CopyAddrButton label="OracleCommit" address={addresses.oracleCommit} />
                  <span
                    className="text-xs text-[#6B7280]"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    Sum {totalBps.toLocaleString("en-US")} bps
                  </span>
                </div>
              )}
            </div>

            {/* Right: Monochromatic Concentric Mindshare Ring + Live Stats */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-[#1E222B] bg-[#0D0F13] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-7">
                <div className="mb-6 flex items-center justify-between border-b border-[#1A1E26] pb-4">
                  <div>
                    <span className="text-xs font-medium text-[#6B7280]">
                      Live Distribution Vector
                    </span>
                    <div
                      className="mt-0.5 text-sm font-semibold text-[#F5F6F8]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch ? `Epoch #${activeEpoch.epochId}` : "Current Epoch"} ·{" "}
                      <span className="text-[#34D399]">
                        {activeEpoch?.status.toUpperCase() ?? "LIVE"}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22262F] bg-[#08090C] px-2.5 py-1 text-xs font-medium text-[#D1D5DB]">
                    <Radar className="h-3.5 w-3.5 text-[#34D399]" />
                    <span>{radar.alerts.length} Signals</span>
                  </span>
                </div>

                <MindshareRing
                  narratives={snapshot.narratives}
                  epochId={activeEpoch?.epochId ?? null}
                />

                <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-[#1A1E26] pt-5">
                  <div className="rounded-xl border border-[#1A1E26] bg-[#08090C] p-3">
                    <div className="text-[11px] text-[#6B7280]">Leader</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-[#F5F6F8]">
                      {leader?.label ?? "—"}
                    </div>
                    <div
                      className="text-xs font-semibold text-[#34D399]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {leader ? formatBpsPercent(leader.iBps) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#1A1E26] bg-[#08090C] p-3">
                    <div className="text-[11px] text-[#6B7280]">Velocity</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-[#F5F6F8]">
                      {fastest?.label ?? "Warming"}
                    </div>
                    <div
                      className="text-xs font-semibold text-[#D1D5DB]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {fastest?.vBps !== null && fastest?.vBps !== undefined
                        ? formatSignedBps(fastest.vBps)
                        : "EMA 3"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#1A1E26] bg-[#08090C] p-3">
                    <div className="text-[11px] text-[#6B7280]">Manifest</div>
                    <div
                      className="mt-0.5 truncate text-xs font-semibold text-[#F5F6F8]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch ? truncateHex(activeEpoch.datasetHash, 5, 4) : "Pending"}
                    </div>
                    <div className="text-[11px] text-[#6B7280]">SHA-256</div>
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

        {/* Full-Width Monotone Ecosystem Bento + Live Radar */}
        <section
          id="ecosystem"
          className="w-full border-t border-[#1A1E26] bg-[#0A0C10] py-20 lg:py-28"
        >
          <div className="mx-auto w-full max-w-[1680px] px-5 sm:px-8 lg:px-14">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span
                  className="text-xs font-medium uppercase tracking-wider text-[#34D399]"
                  style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                >
                  On-Chain Applications
                </span>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight text-[#F5F6F8] sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                >
                  Four Ways to Trade &amp; Govern Attention
                </h2>
              </div>
              <Link
                href="/terminal"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D1D5DB] hover:text-[#34D399]"
              >
                <span>Open Full Terminal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
                {[
                  {
                    href: "/markets",
                    badge: "24h & 7d Pools",
                    title: "Narrative Pair Markets",
                    body: "Bet on which crypto narrative leads the next epoch cycle in pure parimutuel ETH pools with zero external price oracles.",
                    foot: "0.1% Pool Fee",
                    cta: "Explore",
                    icon: Activity,
                  },
                  {
                    href: "/baskets",
                    badge: "Uniswap V3 TWAP",
                    title: "TWAP Narrative Baskets",
                    body: "Deposit ETH into curated token baskets protected by 30-minute Uniswap V3 TWAP pricing and permissionless redemptions.",
                    foot: "30m TWAP Bound",
                    cta: "Open Vaults",
                    icon: Layers,
                  },
                  {
                    href: "/stake",
                    badge: "30% ETH Fees",
                    title: "Stake $NTI & Tiers",
                    body: "Lock 100k, 1M, or 5M $NTI to unlock zero-delay Radar signals, up to 50% fee discounts, and 30% of protocol ETH revenue.",
                    foot: "Up to 50% Off",
                    cta: "Stake",
                    icon: Coins,
                  },
                  {
                    href: "/grants",
                    badge: "Quadratic Rounds",
                    title: "Grants & Disputes",
                    body: "Direct 30% of fee revenue into quadratic ecosystem rounds or verify SHA-256 dataset proofs via Oracle & Disputes.",
                    foot: "30% Ecosystem Pool",
                    cta: "Govern",
                    icon: Sparkles,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-scroll-card
                      className="group flex flex-col justify-between rounded-2xl border border-[#1E222B] bg-[#0D0F13] p-6 transition-colors hover:border-[#34D399]/60"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#232833] bg-[#08090C] text-[#D1D5DB] group-hover:text-[#34D399]">
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="rounded-full border border-[#22262F] bg-[#08090C] px-2.5 py-0.5 text-[11px] font-medium text-[#9CA3AF]">
                            {item.badge}
                          </span>
                        </div>
                        <h3
                          className="mt-5 text-xl font-bold text-[#F5F6F8] group-hover:text-[#34D399]"
                          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                        >
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">
                          {item.body}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center justify-between border-t border-[#1A1E26] pt-4 text-xs text-[#D1D5DB]">
                        <span style={{ fontFamily: "var(--font-ibm-mono), monospace" }}>
                          {item.foot}
                        </span>
                        <span className="inline-flex items-center gap-1 group-hover:text-[#34D399]">
                          <span>{item.cta}</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Live Radar Panel (Right 4 cols) */}
              <div
                data-scroll-card
                className="flex flex-col justify-between rounded-2xl border border-[#1E222B] bg-[#0D0F13] p-6 lg:col-span-4"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[#1A1E26] pb-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[#F5F6F8]">
                      <Radar className="h-4 w-4 text-[#34D399]" />
                      <span>Emerging Radar</span>
                    </span>
                    <span
                      className="text-[11px] text-[#9CA3AF]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      60m Staker Edge
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {radar.alerts.slice(0, 4).map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-[#1A1E26] bg-[#08090C] p-3.5"
                      >
                        <div
                          className="flex items-center justify-between text-[10px] uppercase text-[#6B7280]"
                          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                        >
                          <span className="text-[#34D399]">
                            {alert.kind === "new_token" ? "Token Signal" : "Velocity Spike"}
                          </span>
                          <span>Sector #{alert.narrativeId}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-[#F5F6F8]">
                            {alert.narrativeLabel}
                          </span>
                          {alert.vBps !== null && (
                            <span
                              className="text-xs font-semibold tabular-nums text-[#34D399]"
                              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                            >
                              {formatSignedBps(alert.vBps)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {radar.alerts.length === 0 && (
                      <div className="rounded-xl border border-[#1A1E26] bg-[#08090C] p-4 text-xs text-[#6B7280]">
                        Radar scanner armed — awaiting next velocity breakout.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-2 border-t border-[#1A1E26] pt-4">
                  <Link
                    href="/radar"
                    className="flex items-center justify-between rounded-xl border border-[#22262F] bg-[#08090C] px-4 py-2.5 text-xs font-medium text-[#F5F6F8] transition-colors hover:border-[#34D399]"
                  >
                    <span>Open Radar Feed</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#34D399]" />
                  </Link>
                  <Link
                    href="/heatmap"
                    className="flex items-center justify-between rounded-xl border border-[#22262F] bg-[#08090C] px-4 py-2.5 text-xs font-medium text-[#9CA3AF] transition-colors hover:border-[#34D399] hover:text-[#F5F6F8]"
                  >
                    <span>Builder Heatmap</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#34D399]" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Full-Width Contracts Directory & Closing CTA */}
        <section id="contracts" className="w-full border-t border-[#1A1E26] bg-[#07080A] py-20 lg:py-24">
          <div className="mx-auto w-full max-w-[1680px] px-5 sm:px-8 lg:px-14">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span
                  className="text-xs font-medium uppercase tracking-wider text-[#34D399]"
                  style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                >
                  Verified Infrastructure
                </span>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight text-[#F5F6F8] sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                >
                  Deployed Contracts on Robinhood Chain
                </h2>
              </div>
              <a
                href={explorerBase}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D1D5DB] hover:text-[#34D399]"
              >
                <span>Open Explorer</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coreContracts.map((c) => (
                <div
                  key={c.name}
                  data-scroll-card
                  className="flex flex-col justify-between rounded-2xl border border-[#1E222B] bg-[#0D0F13] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold text-[#F5F6F8]">
                        <ShieldCheck className="h-4 w-4 text-[#34D399]" />
                        <span>{c.name}</span>
                      </span>
                      <a
                        href={`${explorerBase}/address/${c.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-[#9CA3AF] hover:text-[#34D399]"
                      >
                        <span>Explorer</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">{c.role}</p>
                  </div>
                  <div className="mt-4">
                    <CopyAddrButton address={c.address} />
                  </div>
                </div>
              ))}
            </div>

            {/* Clean Monotone CTA Card */}
            <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-3xl border border-[#22262F] bg-[#0E1015] p-8 sm:p-10 lg:flex-row lg:items-center">
              <div>
                <h3
                  className="text-2xl font-bold tracking-tight text-[#F5F6F8] sm:text-3xl"
                  style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                >
                  Ready to trade live narrative momentum?
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-[#9CA3AF]">
                  Enter the full workspace to inspect real-time sector trajectories, stake $NTI,
                  allocate into TWAP baskets, or participate in pair pools.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F5F6F8] px-6 py-3 text-sm font-semibold text-[#07080A] transition-colors hover:bg-[#34D399]"
                >
                  <span>Enter Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/oracle"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#242933] px-6 py-3 text-sm font-semibold text-[#F5F6F8] transition-colors hover:border-[#34D399]"
                >
                  <span>Audit Oracle</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Full-Width Footer with Brand Logo */}
      <footer className="w-full border-t border-[#1A1E26] bg-[#07080A]">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-[#6B7280] sm:px-8 lg:px-14">
          <div className="flex items-center gap-3">
            <NtiBrandMark className="h-6 w-6" />
            <span>NTI Protocol · Measures crypto narrative attention, not token prices.</span>
          </div>
          <nav className="flex flex-wrap items-center gap-6 font-medium text-[#9CA3AF]">
            <Link href="/terminal" className="hover:text-[#F5F6F8]">
              Terminal
            </Link>
            <Link href="/markets" className="hover:text-[#F5F6F8]">
              Markets
            </Link>
            <Link href="/baskets" className="hover:text-[#F5F6F8]">
              Baskets
            </Link>
            <Link href="/oracle" className="hover:text-[#F5F6F8]">
              Oracle
            </Link>
            <Link href="/methodology" className="hover:text-[#F5F6F8]">
              Methodology
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
