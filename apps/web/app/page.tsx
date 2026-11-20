import Link from "next/link";
import { Bricolage_Grotesque, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Coins,
  Layers,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getActiveChainId, getChain, getProtocolAddresses } from "@/lib/contracts";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { SectorBoard } from "@/components/landing/SectorBoard";
import { CopyAddrButton } from "@/components/landing/CopyAddrButton";

export const revalidate = 60;

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["500", "600", "700", "800"],
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

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "3-Lane X Ingestion",
    spec: "25+ KOLs · 60-post cap",
    description:
      "Rotated cookie lanes collect posts every 4 hours with deterministic SHA-256 cycle manifests.",
    icon: Radar,
  },
  {
    step: "02",
    title: "Deterministic Classification",
    spec: "10 sectors · temp = 0",
    description:
      "Each post is scored q ∈ [0, 1] across ten crypto sectors with zero temperature drift.",
    icon: Sparkles,
  },
  {
    step: "03",
    title: "Decimal(40) Normalization",
    spec: "48h decay · 10% KOL cap",
    description:
      "No single account exceeds 10% weight; Hamilton largest-remainder ensures exact 10,000 bps.",
    icon: Scale,
  },
  {
    step: "04",
    title: "Quorum & 2h Dispute",
    spec: "≥3 EIP-712 · 7,200s guard",
    description:
      "Validators sign digests on Robinhood Chain ahead of a permissionless 2-hour dispute window.",
    icon: ShieldCheck,
  },
] as const;

const APPLICATIONS = [
  {
    href: "/markets",
    badge: "Parimutuel Pools",
    title: "Narrative Pair Markets",
    description:
      "Take a position on which sector captures higher mindshare over 24-hour or 7-day settlement windows.",
    stat: "0.1% protocol fee · 0 external price feeds",
    icon: Activity,
    tone: "bg-blue-50 text-blue-600 border-blue-100",
  },
  {
    href: "/baskets",
    badge: "Uniswap V3 Vaults",
    title: "TWAP Narrative Baskets",
    description:
      "Allocate ETH into curated narrative token baskets protected by 30-minute TWAP manipulation bounds.",
    stat: "Instant deposit & proportional redeem",
    icon: Layers,
    tone: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
  {
    href: "/stake",
    badge: "30% ETH Fee Share",
    title: "Staking & Real-Time Radar",
    description:
      "Stake 100k+ $NTI for zero-delay velocity spikes 60 minutes ahead of public feed plus up to 50% fee discounts.",
    stat: "100k / 1M / 5M $NTI tiers",
    icon: Coins,
    tone: "bg-amber-50 text-amber-600 border-amber-100",
  },
  {
    href: "/oracle",
    badge: "Verification & QF",
    title: "Oracle Audits & Grants",
    description:
      "Inspect validator attestations, challenge math omissions in the 2h window, or vote on ecosystem grants.",
    stat: "Public SHA-256 dataset roots",
    icon: ShieldCheck,
    tone: "bg-slate-100 text-slate-700 border-slate-200",
  },
] as const;

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
    { name: "OracleCommit", role: "4h mindshare commits & finalization", address: addresses.oracleCommit },
    { name: "NTIRegistry", role: "Canonical protocol address registry", address: addresses.registry },
    { name: "Staking", role: "100k–5M $NTI tiers & 30% ETH fees", address: addresses.staking },
    { name: "NarrativeMarket", role: "24h & 7d parimutuel pair pools", address: addresses.narrativeMarket },
    { name: "BasketFactory", role: "Uniswap V3 TWAP basket vaults", address: addresses.basketFactory },
    { name: "Dispute", role: "2h omission & math challenge guard", address: addresses.dispute },
  ].filter((c): c is { name: string; role: string; address: `0x${string}` } => Boolean(c.address));

  return (
    <div
      className={`${bricolage.variable} ${dmSans.variable} ${ibmMono.variable} min-h-screen bg-[#F8FAFC] text-slate-900 antialiased`}
      style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Clean Sticky Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 16l4.5-6 4 4.5L19 6" />
                  <circle cx="19" cy="6" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <span
                className="text-base font-bold tracking-tight text-slate-900"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                NTI
              </span>
            </Link>

            <span
              className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 sm:inline-flex"
              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {activeEpoch ? `EP-${activeEpoch.epochId}` : "LIVE"} · CHAIN {chainId}
            </span>
          </div>

          <nav
            aria-label="Primary sections"
            className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
          >
            <a href="#index" className="transition-colors hover:text-slate-900">
              Live Index
            </a>
            <a href="#pipeline" className="transition-colors hover:text-slate-900">
              How It Works
            </a>
            <a href="#applications" className="transition-colors hover:text-slate-900">
              Applications
            </a>
            <a href="#contracts" className="transition-colors hover:text-slate-900">
              Contracts
            </a>
          </nav>

          <Link
            href="/terminal"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
          >
            <span>Launch Terminal</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main>
        {/* Crisp Split Hero (Pure CSS atmosphere, 0 canvas / 0 GSAP) */}
        <section
          className="border-b border-slate-200 bg-white"
          style={{
            backgroundImage:
              "radial-gradient(circle at 82% 12%, rgba(37, 99, 235, 0.06), transparent 48%), radial-gradient(circle at 12% 88%, rgba(5, 150, 105, 0.05), transparent 42%)",
          }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:py-20">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                <span>4-Hour Attention Oracle on Robinhood Chain</span>
              </div>

              <h1
                className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-[54px]"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                Quantify crypto narrative momentum{" "}
                <span className="text-blue-600">on-chain.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                NTI scores live crypto X discourse across 25+ curated accounts into 10 verifiable
                sector weights summing to 10,000 bps — settling pair markets, TWAP baskets, and
                staker yields.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                >
                  <span>Open Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>Explore Markets</span>
                </Link>
                <Link
                  href="/methodology"
                  className="inline-flex items-center gap-1 px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
                >
                  <span>Specs</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              {addresses.oracleCommit && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <CopyAddrButton label="OracleCommit" address={addresses.oracleCommit} />
                  <span
                    className="text-xs text-slate-400"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    Σ I_n = {totalBps.toLocaleString("en-US")} bps
                  </span>
                </div>
              )}
            </div>

            {/* Right: Crisp Live Telemetry Card */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400">
                      Latest Settled Snapshot
                    </div>
                    <div
                      className="mt-0.5 text-sm font-semibold text-slate-900"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch
                        ? `Epoch #${activeEpoch.epochId} · ${activeEpoch.status.toUpperCase()}`
                        : "Preview Snapshot"}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {radar.alerts.length} Radar Signals
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[11px] font-medium text-slate-500">Top Narrative</div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-900">
                      {leader?.label ?? "—"}
                    </div>
                    <div
                      className="text-xs font-semibold text-blue-600"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {leader ? formatBpsPercent(leader.iBps) : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[11px] font-medium text-slate-500">Velocity Lead</div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-900">
                      {fastest?.label ?? "Warming"}
                    </div>
                    <div
                      className="text-xs font-semibold text-emerald-600"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {fastest?.vBps !== null && fastest?.vBps !== undefined
                        ? formatSignedBps(fastest.vBps)
                        : "3-Epoch EMA"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[11px] font-medium text-slate-500">Dataset Root</div>
                    <div
                      className="mt-1 truncate text-xs font-semibold text-slate-900"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {activeEpoch ? truncateHex(activeEpoch.datasetHash, 6, 4) : "Pending"}
                    </div>
                    <div className="text-[11px] text-slate-500">SHA-256</div>
                  </div>
                </div>

                {/* Top 5 Sector Bars */}
                <div className="mt-5 space-y-3">
                  {sortedNarratives.slice(0, 5).map((n, idx) => (
                    <div key={n.narrativeId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">
                          <span
                            className="mr-2 text-slate-400"
                            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                          >
                            0{idx + 1}
                          </span>
                          {n.label}
                        </span>
                        <span
                          className="font-semibold tabular-nums text-slate-900"
                          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                        >
                          {formatBpsPercent(n.iBps)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${Math.min(100, (n.iBps / 2200) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                  <span className="text-slate-500">No wallet needed to inspect live data</span>
                  <Link
                    href="/terminal"
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <span>Full Terminal</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Interactive 10-Sector Live Index */}
        <section id="index" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-18">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Live Attention Vector
              </span>
              <h2
                className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                All 10 Narrative Sectors
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
                Every 4-hour commit distributes exactly 10,000 basis points across these ten sectors
                after engagement decay and single-KOL dominance capping.
              </p>
            </div>
            <Link
              href="/terminal"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:border-slate-300"
            >
              <span>Open Charts &amp; Matrix</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <SectorBoard narratives={snapshot.narratives} />
        </section>

        {/* Section 3: How NTI Computes Attention (Clean 4-Card Row) */}
        <section id="pipeline" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-18">
            <div className="mb-8 max-w-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Deterministic Methodology
              </span>
              <h2
                className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                From X timelines to disputed-guarded settlement
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.step}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-[#F8FAFC] p-5"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span
                          className="text-xs font-semibold text-slate-400"
                          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                        >
                          {item.step}
                        </span>
                      </div>
                      <h3
                        className="mt-4 text-base font-bold text-slate-900"
                        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                      >
                        {item.title}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        {item.description}
                      </p>
                    </div>
                    <div
                      className="mt-4 border-t border-slate-200/80 pt-3 text-[11px] font-medium text-blue-700"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {item.spec}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 4: Four Core On-Chain Applications */}
        <section id="applications" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-18">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                On-Chain Suite
              </span>
              <h2
                className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
                style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
              >
                Four primitives settled on Robinhood Chain
              </h2>
            </div>
            <Link
              href="/radar"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Inspect live Radar alerts -&gt;
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {APPLICATIONS.map((app) => {
              const Icon = app.icon;
              return (
                <Link
                  key={app.href}
                  href={app.href}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-[0_6px_24px_rgba(15,23,42,0.05)]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${app.tone}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {app.badge}
                      </span>
                    </div>

                    <h3
                      className="mt-4 text-lg font-bold text-slate-900 group-hover:text-blue-600"
                      style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                    >
                      {app.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                      {app.description}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                    <span
                      className="text-slate-500"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      {app.stat}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900 group-hover:text-blue-600">
                      <span>Open</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Section 5: Deployed Contracts & Closing CTA */}
        <section id="contracts" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Robinhood Chain · {chainId}
                </span>
                <h2
                  className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
                  style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                >
                  Verified Contract Directory
                </h2>
              </div>
              <a
                href={explorerBase}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <span>Open Block Explorer</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {coreContracts.map((c) => (
                <div
                  key={c.name}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{c.name}</span>
                      <a
                        href={`${explorerBase}/address/${c.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <span>Explorer</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.role}</p>
                  </div>
                  <div className="mt-3">
                    <CopyAddrButton address={c.address} />
                  </div>
                </div>
              ))}
            </div>

            {/* Clean Final CTA Card */}
            <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-2xl bg-slate-950 p-7 text-white sm:p-9 lg:flex-row lg:items-center">
              <div>
                <h3
                  className="text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                >
                  Ready to monitor live crypto narrative flows?
                </h3>
                <p className="mt-1.5 text-sm text-slate-300">
                  Open the full NTI workspace to track sector charts, pair pools, baskets, and
                  real-time Radar.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-blue-50"
                >
                  <span>Enter Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/stake"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-slate-500"
                >
                  <span>Stake $NTI</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Minimal 1-Row Footer */}
      <footer className="border-t border-slate-200 bg-[#F8FAFC]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <div>
            NTI Protocol · Measures social narrative attention, not token prices.
          </div>
          <nav className="flex flex-wrap items-center gap-5 font-medium text-slate-600">
            <Link href="/terminal" className="hover:text-slate-950">
              Terminal
            </Link>
            <Link href="/markets" className="hover:text-slate-950">
              Markets
            </Link>
            <Link href="/baskets" className="hover:text-slate-950">
              Baskets
            </Link>
            <Link href="/oracle" className="hover:text-slate-950">
              Oracle
            </Link>
            <Link href="/methodology" className="hover:text-slate-950">
              Methodology
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
