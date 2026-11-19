import Link from "next/link";
import { ArrowRight, ArrowUpRight, Compass, Layers3, ShieldAlert, TrendingUp } from "lucide-react";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getActiveChainId, getChain, getProtocolAddresses } from "@/lib/contracts";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { EpochBadge } from "@/components/EpochBadge";
import { HalftoneHorizonCanvas } from "@/components/HalftoneHorizonCanvas";
import { CopyContractPill, TacticalFrame } from "@/components/TacticalFrame";
import { LiveTickerBar } from "@/components/LiveTickerBar";
import { LandingEffects } from "@/components/landing/LandingEffects";
import { MindshareExplorer } from "@/components/landing/MindshareExplorer";
import { FeatureStory } from "@/components/landing/FeatureStory";
import { OraclePipelineConsole } from "@/components/landing/OraclePipelineConsole";
import { ArchitectureFlowAndSuite } from "@/components/landing/ArchitectureFlowAndSuite";
import { ProtocolRoadmap } from "@/components/landing/ProtocolRoadmap";
import {
  ProtocolContractsAndFacts,
  type ContractEntry,
} from "@/components/landing/ProtocolContractsAndFacts";

export const revalidate = 60;

const MANIFESTO_WORDS =
  "Every four hours, NTI distills raw crypto X discourse across 25+ curated voices into one capped, deterministic mindshare distribution — then settles parimutuel pair markets, TWAP narrative vaults, and staker yields directly on Robinhood Chain.".split(
    " ",
  );

const FIGURES = [
  { count: 10, suffix: "", unit: "SECTORS", caption: "Tracked crypto attention verticals summing to 100%" },
  { count: 10000, suffix: "", unit: "BPS SUM", caption: "Exact Hamilton largest-remainder vector invariant" },
  { count: 4, suffix: "h", unit: "CADENCE", caption: "Autonomous epoch ingestion & EIP-712 commit cycle" },
  { count: 30, suffix: "%", unit: "ETH YIELD", caption: "Native protocol fees routed directly to $NTI stakers" },
] as const;

const OPERATORS = [
  {
    code: "TRD",
    role: "ATTENTION TRADERS",
    title: "Price Narrative Rotations",
    text: "Express relative conviction between AI Agents, DeFi, RWA, Memecoin, and Privacy in permissionless 24h and 7d parimutuel pools — settled by attention, not price feeds.",
    href: "/markets",
    cta: "Open Pair Markets",
    icon: TrendingUp,
  },
  {
    code: "VAULT",
    role: "PASSIVE & TWAP LPS",
    title: "Capture Narrative Baskets",
    text: "Deposit ETH into whitelisted Uniswap V3 basket vaults protected by 30-minute TWAP bounds, or inspect builder heatmaps to spot under-crowded sectors early.",
    href: "/baskets",
    cta: "Inspect Baskets",
    icon: Layers3,
  },
  {
    code: "STK",
    role: "$NTI STAKERS & WATCHERS",
    title: "0-Delay Radar & Disputes",
    text: "Stake 100k+ $NTI for zero-delay Radar velocity alerts 60 minutes ahead of public release, earn 30% ETH fees, and challenge faulty epochs within the 2h guard.",
    href: "/stake",
    cta: "Stake & Unlock",
    icon: ShieldAlert,
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

  const contractRows: ContractEntry[] = [
    { name: "OracleCommit", role: "4h index commits & EIP-712 quorum", address: addresses.oracleCommit },
    { name: "NTIRegistry", role: "Canonical protocol address registry", address: addresses.registry },
    { name: "Staking", role: "100k/1M/5M $NTI tiers & ETH yield", address: addresses.staking },
    { name: "NarrativeMarket", role: "24h & 7d parimutuel pair pools", address: addresses.narrativeMarket },
    { name: "BasketFactory", role: "Whitelisted Uniswap V3 TWAP baskets", address: addresses.basketFactory },
    { name: "Dispute", role: "Permissionless omission & math guard", address: addresses.dispute },
    { name: "FeeRouter", role: "30% ETH stakers · 40% buyback · 30% grants", address: addresses.feeRouter },
    { name: "Grants", role: "Quadratic mindshare ecosystem funding", address: addresses.grants },
    { name: "NTIToken", role: "Protocol staking & governance ERC-20", address: addresses.ntiToken },
    { name: "ConfigRegistry", role: "Governable oracle & cap parameters", address: addresses.configRegistry },
    { name: "Governor", role: "On-chain protocol proposals & voting", address: addresses.governor },
    { name: "Timelock", role: "Time-delayed governance execution", address: addresses.timelock },
  ].filter((c): c is ContractEntry => Boolean(c.address));

  const marqueeRepeat = Array.from({ length: 8 });

  return (
    <div className="min-h-screen bg-[#06070A] text-[#F3F5F8]">
      <LandingEffects />

      {/* Sticky Editorial Landing Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#1B202C] bg-[#06070A]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center border border-[#2B3345] bg-[#0B0D12] transition-colors group-hover:border-[#B8FF2E]/70">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 text-[#B8FF2E]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 19V5l14 14V5" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-[#23F7DD]" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-[#F3F5F8]">
              NTI <span className="font-mono font-normal text-[#5A6478]">//</span> PROTOCOL
            </span>
          </Link>

          <nav
            aria-label="Landing sections"
            className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8B94A7] xl:flex"
          >
            <a href="#thesis" className="transition-colors hover:text-[#F3F5F8]">
              01 Thesis
            </a>
            <a href="#live-index" className="transition-colors hover:text-[#F3F5F8]">
              02 Index
            </a>
            <a href="#controls" className="transition-colors hover:text-[#F3F5F8]">
              03 Controls
            </a>
            <a href="#pipeline" className="transition-colors hover:text-[#F3F5F8]">
              04 Pipeline
            </a>
            <a href="#architecture" className="transition-colors hover:text-[#F3F5F8]">
              05 Suite
            </a>
            <a href="#roadmap" className="transition-colors hover:text-[#F3F5F8]">
              06 Roadmap
            </a>
            <a href="#contracts" className="transition-colors hover:text-[#F3F5F8]">
              07 Contracts
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:block">
              <EpochBadge
                epochId={activeEpoch?.epochId ?? null}
                status={activeEpoch?.status ?? "collecting"}
                compact
              />
            </div>
            <Link
              href="/terminal"
              className="inline-flex min-h-[36px] items-center gap-2 border border-[#B8FF2E]/60 bg-[#B8FF2E] px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
            >
              <span>Launch Terminal</span>
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Top Protocol Specification Strip */}
      <div className="border-b border-[#1B202C] bg-[#0B0D12]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 divide-x divide-[#1B202C] font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B94A7] sm:grid-cols-4">
          <div className="px-4 py-2.5">
            <span className="block text-[#5A6478]">PROTOCOL</span>
            <span className="text-[#F3F5F8]">NARRATIVE TRADE INDEX V1</span>
          </div>
          <div className="px-4 py-2.5">
            <span className="block text-[#5A6478]">SETTLEMENT</span>
            <span className="text-[#B8FF2E]">ROBINHOOD CHAIN · {chainId}</span>
          </div>
          <div className="border-t border-[#1B202C] px-4 py-2.5 sm:border-t-0">
            <span className="block text-[#5A6478]">PRECISION</span>
            <span className="text-[#23F7DD]">DECIMAL(40) · HAMILTON BPS</span>
          </div>
          <div className="border-t border-[#1B202C] px-4 py-2.5 sm:border-t-0">
            <span className="block text-[#5A6478]">LIVE EPOCH</span>
            <span className="tabular-nums text-[#F3F5F8]">
              {activeEpoch ? `#${activeEpoch.epochId} · ${activeEpoch.status.toUpperCase()}` : "AWAITING INIT"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 01 · FULL-VIEWPORT HERO WITH HALFTONE HORIZON & LIVE TELEMETRY */}
      <section className="terminal-grid-bg relative overflow-hidden border-b border-[#1B202C]">
        <HalftoneHorizonCanvas className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-4 py-14 sm:px-6 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
                <span className="inline-flex items-center gap-2 border border-[#2B3345] bg-[#0B0D12]/90 px-3 py-1 text-[#B8FF2E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
                  <span>THE ATTENTION LAYER · ON-CHAIN ORACLE</span>
                </span>
                <span className="border border-[#1B202C] bg-[#06070A]/90 px-3 py-1 text-[#8B94A7]">
                  Σ I_n = {totalBps.toLocaleString("en-US")} BPS
                </span>
              </div>

              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.03] tracking-tight text-[#F3F5F8] sm:text-6xl lg:text-[66px]">
                Measure Crypto Attention{" "}
                <span className="text-[#B8FF2E]">On-Chain.</span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#8B94A7] sm:text-lg">
                NTI transforms real-time crypto X discourse into deterministic 4-hour sector
                mindshare vectors — signed by independent EIP-712 validators and settled
                directly into Robinhood Chain markets, baskets, and staker yields.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex min-h-[46px] items-center gap-2.5 border border-[#B8FF2E] bg-[#B8FF2E] px-6 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
                >
                  <span>Open NTI Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex min-h-[46px] items-center gap-2 border border-[#2B3345] bg-[#0B0D12]/90 px-6 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[#F3F5F8] transition-colors hover:border-[#23F7DD]/60 hover:text-[#23F7DD]"
                >
                  Explore Pair Markets
                </Link>
                <Link
                  href="/methodology"
                  className="inline-flex min-h-[46px] items-center gap-1.5 px-4 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[#8B94A7] transition-colors hover:text-[#F3F5F8]"
                >
                  <span>Read Formulas</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {addresses.oracleCommit && (
                <div className="mt-6">
                  <CopyContractPill label="ORACLE CA" address={addresses.oracleCommit} />
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              <TacticalFrame
                eyebrow="LIVE PROTOCOL TELEMETRY"
                rightLabel={activeEpoch ? `EP-${activeEpoch.epochId}` : "PREVIEW"}
                className="p-5 sm:p-6"
              >
                <div className="grid grid-cols-2 gap-px border border-[#1B202C] bg-[#1B202C]">
                  <div className="bg-[#0B0D12] p-4">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                      LEADER SECTOR
                    </span>
                    <div className="mt-1.5 font-display text-lg font-bold text-[#F3F5F8]">
                      {leader?.label ?? "—"}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#B8FF2E]">
                      {leader ? formatBpsPercent(leader.iBps) : "—"}
                    </div>
                  </div>
                  <div className="bg-[#0B0D12] p-4">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                      FASTEST VELOCITY
                    </span>
                    <div className="mt-1.5 font-display text-lg font-bold text-[#F3F5F8]">
                      {fastest?.label ?? "Warming Up"}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#23F7DD]">
                      {fastest?.vBps !== null && fastest?.vBps !== undefined
                        ? formatSignedBps(fastest.vBps)
                        : "3-Epoch EMA"}
                    </div>
                  </div>
                  <div className="bg-[#0B0D12] p-4">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                      ACTIVE RADAR
                    </span>
                    <div className="mt-1.5 font-display text-lg font-bold tabular-nums text-[#F3F5F8]">
                      {radar.alerts.length} SIGNALS
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#F59E0B]">
                      60M STAKER EDGE
                    </div>
                  </div>
                  <div className="bg-[#0B0D12] p-4">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                      DATASET ROOT
                    </span>
                    <div className="mt-1.5 font-mono text-xs tabular-nums text-[#F3F5F8]">
                      {activeEpoch ? truncateHex(activeEpoch.datasetHash, 8, 6) : "Pending"}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#23F7DD]">
                      SHA-256 + EIP-712
                    </div>
                  </div>
                </div>

                {/* Top 4 Preview Bars inside Hero Card */}
                <div className="mt-4 space-y-2 border-t border-[#1B202C] pt-4">
                  <div className="flex justify-between font-mono text-[10px] text-[#5A6478]">
                    <span>TOP MINDSHARE ALLOCATIONS</span>
                    <span>BPS / 10,000</span>
                  </div>
                  {sortedNarratives.slice(0, 4).map((n, idx) => (
                    <div key={n.narrativeId} className="space-y-1">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="text-[#F3F5F8]">
                          #{idx + 1} {n.label}
                        </span>
                        <span className="tabular-nums text-[#B8FF2E]">
                          {formatBpsPercent(n.iBps)} ({n.iBps})
                        </span>
                      </div>
                      <div className="h-1 w-full bg-[#1B202C]">
                        <div
                          className="h-full bg-[#B8FF2E]"
                          style={{ width: `${Math.min(100, (n.iBps / 2500) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#1B202C] pt-3 font-mono text-[11px]">
                  <span className="text-[#8B94A7]">No wallet required for live telemetry.</span>
                  <Link href="/stake" className="text-[#B8FF2E] hover:underline">
                    STAKE $NTI -&gt;
                  </Link>
                </div>
              </TacticalFrame>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE TICKER RIBBON */}
      <LiveTickerBar narratives={snapshot.narratives} epochId={activeEpoch?.epochId ?? null} />

      {/* SECTION 02 · MANIFESTO / CORE THESIS (QTimeline Word Scrub Pattern) */}
      <section id="thesis" className="border-b border-[#1B202C] bg-[#06070A] py-20 lg:py-28">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6" data-manifesto>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#B8FF2E]">
            <Compass className="h-3.5 w-3.5" />
            <span>01 // PROTOCOL THESIS</span>
          </div>
          <p
            aria-label={MANIFESTO_WORDS.join(" ")}
            className="mt-6 max-w-5xl font-display text-2xl font-bold leading-[1.22] tracking-tight text-[#F3F5F8] sm:text-4xl lg:text-[42px]"
          >
            {MANIFESTO_WORDS.map((word, idx) => (
              <span
                key={idx}
                data-manifesto-word
                className="inline-block transition-opacity"
              >
                {word}&nbsp;
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* EDITORIAL MARQUEE STRIP (QTimeline Marquee Pattern) */}
      <div className="overflow-hidden border-b border-[#1B202C] bg-[#0B0D12] py-4">
        <div className="marquee-track items-center gap-8 font-mono text-xs uppercase tracking-[0.2em] text-[#8B94A7]">
          {marqueeRepeat.map((_, idx) => (
            <div key={idx} className="flex items-center gap-8 whitespace-nowrap">
              <span className="text-[#F3F5F8]">Attention Is Measurable Capital</span>
              <span className="text-[#B8FF2E]">◆</span>
              <span>Σ I_n = 10,000 BPS</span>
              <span className="text-[#23F7DD]">◆</span>
              <span>Robinhood Chain · {chainId}</span>
              <span className="text-[#B8FF2E]">◆</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 03 · INTERACTIVE 10-SECTOR MINDSHARE SPECTRUM & MATRIX */}
      <section id="live-index" className="border-b border-[#1B202C] bg-[#06070A] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#B8FF2E]">
                02 // LIVE SECTOR MINDSHARE
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
                Ten Tracked Narratives. One Verifiable Distribution.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#8B94A7]">
                Inspect every sector&apos;s live EMA weight, raw epoch share, 4-hour velocity, and
                weighted KOL posts directly from Supabase &amp; on-chain index state.
              </p>
            </div>
            <Link
              href="/terminal"
              className="inline-flex items-center gap-2 border border-[#2B3345] bg-[#0B0D12] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-[#F3F5F8] transition-colors hover:border-[#B8FF2E]"
            >
              <span>Inspect Full Terminal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <MindshareExplorer
            narratives={snapshot.narratives}
            epochId={activeEpoch?.epochId ?? null}
          />
        </div>
      </section>

      {/* SECTION 04 · PROTOCOL FIGURES BAND (QTimeline Figures Count-Up Pattern) */}
      <section className="border-b border-[#1B202C] bg-[#0B0D12] py-14 lg:py-20">
        <div className="mx-auto grid max-w-[1440px] gap-px border border-[#1B202C] bg-[#1B202C] px-0 sm:grid-cols-2 lg:grid-cols-4">
          {FIGURES.map((fig) => (
            <div key={fig.unit} className="bg-[#0B0D12] p-6 sm:p-8" data-spot>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#23F7DD]">
                {fig.unit}
              </div>
              <div className="mt-3 flex items-baseline gap-1 font-display text-4xl font-bold tabular-nums text-[#F3F5F8] sm:text-5xl">
                <span data-count={String(fig.count)}>
                  {fig.count.toLocaleString("en-US")}
                </span>
                {fig.suffix && <span className="text-[#B8FF2E]">{fig.suffix}</span>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#8B94A7]">{fig.caption}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 05 · BELL-INSPIRED OPERATING CONTROLS LAB (3 INTERACTIVE INSTRUMENTS) */}
      <section id="controls" className="border-b border-[#1B202C] bg-[#06070A] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
              03 // OPERATING CONTROLS
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
              Anti-Sybil Math, Quorum Attestation &amp; Revenue Routing.
            </h2>
            <p className="mt-2 text-sm text-[#8B94A7]">
              Explore the three protocol engines that turn noisy X timelines into tamper-proof,
              yield-generating DeFi primitives.
            </p>
          </div>

          <FeatureStory />
        </div>
      </section>

      {/* SECTION 06 · QTIMELINE-INSPIRED LIVE ORACLE PIPELINE CONSOLE */}
      <section id="pipeline" className="border-b border-[#1B202C] bg-[#0B0D12] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#B8FF2E]">
                04 // AUTONOMOUS PIPELINE
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
                From X Timelines to Signed On-Chain Settlement.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#8B94A7]">
                Watch how each 4-hour cycle fetches 25+ KOLs, scores relevance deterministically,
                attains ≥ 3 EIP-712 signatures, and commits directly on Robinhood Chain.
              </p>
            </div>
            <Link
              href="/oracle"
              className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#23F7DD] hover:underline"
            >
              <span>Inspect Oracle Consensus</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <OraclePipelineConsole
            epochId={activeEpoch?.epochId ?? null}
            datasetRoot={activeEpoch?.datasetHash ?? "0xac4a6c98e41f329a1b677b6d"}
            leaderLabel={leader?.label ?? "DeFi"}
            leaderBps={leader?.iBps ?? 1664}
            chainId={chainId}
          />
        </div>
      </section>

      {/* SECTION 07 · BELL ARCHITECTURE FLOW DIAGRAM + 6 PRODUCT MODULES + LIVE RADAR */}
      <section id="architecture" className="border-b border-[#1B202C] bg-[#06070A] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
                05 // DEPLOYED PRODUCT SUITE
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
                One Oracle Core. Six Connected On-Chain Applications.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#8B94A7]">
                Trade narrative momentum, allocate into TWAP-bounded baskets, vote on quadratic
                grants, or stake $NTI for 30% ETH fees and real-time velocity alerts.
              </p>
            </div>
            <Link
              href="/terminal"
              className="inline-flex items-center gap-2 border border-[#B8FF2E]/60 bg-[#B8FF2E] px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] hover:bg-[#c9ff5c]"
            >
              <span>Open Full Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ArchitectureFlowAndSuite alerts={radar.alerts} chainId={chainId} />
        </div>
      </section>

      {/* SECTION 08 · QTIMELINE BUILT FOR EVERY PARTICIPANT */}
      <section className="border-b border-[#1B202C] bg-[#0B0D12] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#B8FF2E]">
              06 // OPERATORS &amp; ROLES
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
              Built for Traders, Vault LPs, and Attention Watchers.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {OPERATORS.map((op) => {
              const Icon = op.icon;
              return (
                <Link
                  key={op.code}
                  href={op.href}
                  data-spot
                  className="reticle-frame group flex flex-col justify-between p-6 transition-colors hover:border-[#B8FF2E]/60"
                >
                  <div>
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="border border-[#2B3345] bg-[#06070A] px-2 py-0.5 text-[#B8FF2E]">
                        {op.code}
                      </span>
                      <span className="text-[#5A6478]">{op.role}</span>
                    </div>
                    <div className="mt-5 flex h-11 w-11 items-center justify-center border border-[#1B202C] bg-[#06070A] text-[#23F7DD]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 font-display text-xl font-bold text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                      {op.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#8B94A7]">{op.text}</p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#1B202C] pt-4 font-mono text-[11px] uppercase tracking-wider text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                    <span>{op.cta}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 09 · BELL-INSPIRED PROTOCOL ROADMAP RAIL */}
      <section id="roadmap" className="border-b border-[#1B202C] bg-[#06070A] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
              07 // DEPLOYED &amp; VERIFIABLE
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
              Live on Robinhood Chain. Ready to Expand.
            </h2>
            <p className="mt-2 text-sm text-[#8B94A7]">
              Every off-chain collector lane, math invariant, EIP-712 verifier, and DeFi primitive
              runs end-to-end on Chain {chainId} today ahead of canonical mainnet registry lock.
            </p>
          </div>

          <ProtocolRoadmap />
        </div>
      </section>

      {/* SECTION 10 · GUARANTEES + CONTRACTS LEDGER + 12-TILE SNAPSHOT */}
      <section id="contracts" className="border-b border-[#1B202C] bg-[#0B0D12] py-16 lg:py-24">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <ProtocolContractsAndFacts
            contracts={contractRows}
            explorerBase={explorerBase}
            chainId={chainId}
            epochId={activeEpoch?.epochId ?? null}
          />
        </div>
      </section>

      {/* SECTION 11 · INVERTED HIGH-CONTRAST CTA (QTimeline Final CTA Pattern) */}
      <section className="border-b border-[#06070A] bg-[#B8FF2E] py-16 text-[#06070A] lg:py-24">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-8 px-4 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#06070A]/75">
              08 // LAUNCH WORKSPACE · CHAIN {chainId}
            </div>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              Ready to trade crypto attention on-chain?
            </h2>
            <p className="mt-3 max-w-xl text-sm font-medium text-[#06070A]/80 sm:text-base">
              Enter the full sidebar terminal to monitor live narrative velocity, stake $NTI,
              allocate TWAP baskets, or wager in 24h &amp; 7d pair pools.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/terminal"
              className="inline-flex min-h-[50px] items-center gap-3 border border-[#06070A] bg-[#06070A] px-7 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#B8FF2E] transition-colors hover:bg-[#11141C]"
            >
              <span>Enter NTI Terminal</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/markets"
              className="inline-flex min-h-[50px] items-center gap-2 border border-[#06070A]/40 px-6 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#06070A] transition-colors hover:bg-[#06070A]/10"
            >
              <span>Pair Markets</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 12 · EDITORIAL FOOTER WITH GIANT WORDMARK (QTimeline & BELL Pattern) */}
      <footer className="overflow-hidden bg-[#06070A] pt-16">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="grid gap-10 border-b border-[#1B202C] pb-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center border border-[#2B3345] bg-[#0B0D12] font-mono text-xs font-bold text-[#B8FF2E]">
                  N
                </div>
                <span className="font-display text-base font-bold text-[#F3F5F8]">
                  NTI PROTOCOL
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#8B94A7]">
                Narrative Trade Index measures live crypto attention across 10 sectors on Robinhood
                Chain using deterministic Decimal(40) normalization and EIP-712 quorum commits.
              </p>
              <Link
                href="/terminal"
                className="mt-5 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#B8FF2E] hover:underline"
              >
                <span>Open Terminal</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5A6478]">
                  Telemetry
                </div>
                <ul className="mt-3 space-y-2 text-xs text-[#8B94A7]">
                  <li>
                    <Link href="/terminal" className="hover:text-[#F3F5F8]">
                      Index Terminal
                    </Link>
                  </li>
                  <li>
                    <Link href="/radar" className="hover:text-[#F3F5F8]">
                      Emerging Radar
                    </Link>
                  </li>
                  <li>
                    <Link href="/heatmap" className="hover:text-[#F3F5F8]">
                      Opportunity Heatmap
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5A6478]">
                  Protocols
                </div>
                <ul className="mt-3 space-y-2 text-xs text-[#8B94A7]">
                  <li>
                    <Link href="/markets" className="hover:text-[#F3F5F8]">
                      Pair Markets
                    </Link>
                  </li>
                  <li>
                    <Link href="/baskets" className="hover:text-[#F3F5F8]">
                      Narrative Baskets
                    </Link>
                  </li>
                  <li>
                    <Link href="/grants" className="hover:text-[#F3F5F8]">
                      Ecosystem Grants
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5A6478]">
                  Verification
                </div>
                <ul className="mt-3 space-y-2 text-xs text-[#8B94A7]">
                  <li>
                    <Link href="/stake" className="hover:text-[#F3F5F8]">
                      Stake $NTI
                    </Link>
                  </li>
                  <li>
                    <Link href="/oracle" className="hover:text-[#F3F5F8]">
                      Oracle &amp; Disputes
                    </Link>
                  </li>
                  <li>
                    <Link href="/methodology" className="hover:text-[#F3F5F8]">
                      Decimal(40) Specs
                    </Link>
                  </li>
                  <li>
                    <a
                      href={explorerBase}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:text-[#23F7DD]"
                    >
                      Robinhood Explorer ↗
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-6 font-mono text-[10px] text-[#5A6478]">
            <span>
              NTI PROTOCOL · ROBINHOOD CHAIN {chainId} · MEASURES DISCUSSION VELOCITY, NOT TOKEN
              PRICES
            </span>
            <span>OBSERVE · COMPUTE · ATTEST · SETTLE</span>
          </div>

          <div
            aria-hidden="true"
            className="select-none pb-2 text-center font-display text-[13vw] font-bold leading-[0.82] tracking-tighter text-[#11141C]"
          >
            NTI PROTOCOL
          </div>
        </div>
      </footer>
    </div>
  );
}
