import Link from "next/link";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getActiveChainId, getChain, getProtocolAddresses } from "@/lib/contracts";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { EpochBadge } from "@/components/EpochBadge";
import { HalftoneHorizonCanvas } from "@/components/HalftoneHorizonCanvas";
import { CopyContractPill, TacticalFrame } from "@/components/TacticalFrame";
import { LiveTickerBar } from "@/components/LiveTickerBar";

export const revalidate = 60;

const PIPELINE_STAGES = [
  {
    step: "01",
    tag: "INGESTION",
    title: "3-Lane X Fetcher",
    metric: "25+ KOLs · 60-post cap",
    detail:
      "Parallel cookie-authenticated timeline ingestion across 3 rotated lanes with deterministic SHA-256 cycle manifests.",
  },
  {
    step: "02",
    tag: "CLASSIFICATION",
    title: "Gemini Flash-Lite v1",
    metric: "10 sectors · temp = 0",
    detail:
      "Multi-label relevance scoring q ∈ [0, 1] across Privacy, AI Agents, RWA, Stablecoins, DePIN, Prediction, Perp DEX, DeFi, Memecoin & Gaming.",
  },
  {
    step: "03",
    tag: "COMPUTE",
    title: "Decimal(40) Engine",
    metric: "10% cap · α = 0.3 EMA",
    detail:
      "48h exponential engagement decay, 10% iterative truncation cap per KOL, and exact Hamilton largest-remainder rounding to 10,000 bps.",
  },
  {
    step: "04",
    tag: "CONSENSUS",
    title: "EIP-712 Quorum & Disputes",
    metric: "≥3 validators · 95% overlap",
    detail:
      "Independent 10% KOL omission checks, median vector aggregation, and a 2-hour permissionless dispute window before finalization.",
  },
  {
    step: "05",
    tag: "SETTLEMENT",
    title: "Robinhood On-Chain Suite",
    metric: "Markets · Baskets · Grants",
    detail:
      "Parimutuel relative-mindshare pair markets, TWAP-navigated Uniswap V3 narrative baskets, quadratic grants, and 30% ETH fee staking.",
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

  const contractRows = [
    { name: "OracleCommit", role: "4h index commits & EIP-712 quorum", address: addresses.oracleCommit },
    { name: "NTIRegistry", role: "Canonical protocol address registry", address: addresses.registry },
    { name: "Staking", role: "100k/1M/5M $NTI tiers & ETH fee yield", address: addresses.staking },
    { name: "NarrativeMarket", role: "24h & 7d parimutuel pair pools", address: addresses.narrativeMarket },
    { name: "BasketFactory", role: "Whitelisted Uniswap V3 TWAP baskets", address: addresses.basketFactory },
    { name: "Dispute", role: "Permissionless omission & math challenge", address: addresses.dispute },
  ].filter((c): c is { name: string; role: string; address: `0x${string}` } => Boolean(c.address));

  return (
    <div className="min-h-screen bg-[#06070A] text-[#F3F5F8]">
      {/* Dedicated Landing Navigation (BELL / QTimeline separation pattern) */}
      <header className="sticky top-0 z-40 border-b border-[#1B202C] bg-[#06070A]/90 backdrop-blur-md">
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
            className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8B94A7] md:flex"
          >
            <a href="#live-index" className="transition-colors hover:text-[#F3F5F8]">
              01 Index
            </a>
            <a href="#architecture" className="transition-colors hover:text-[#F3F5F8]">
              02 Pipeline
            </a>
            <a href="#contracts" className="transition-colors hover:text-[#F3F5F8]">
              03 Contracts
            </a>
            <Link href="/methodology" className="transition-colors hover:text-[#F3F5F8]">
              04 Formulas
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            {activeEpoch && (
              <div className="hidden sm:block">
                <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} compact />
              </div>
            )}
            <Link
              href="/terminal"
              className="inline-flex min-h-[38px] items-center gap-2 bg-[#B8FF2E] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
            >
              Launch Terminal →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[#1B202C]">
        {/* 4-Cell Swiss Telemetry Strip */}
        <div className="mx-auto max-w-[1440px]">
          <div className="grid grid-cols-2 border-b border-[#1B202C] bg-[#0B0D12]/80 font-mono text-[10px] uppercase tracking-[0.16em] lg:grid-cols-4">
            <div className="border-r border-b border-[#1B202C] px-4 py-2.5 lg:border-b-0">
              <span className="block text-[#5A6478]">PROTOCOL</span>
              <span className="mt-0.5 block text-[#F3F5F8]">NARRATIVE TRADE INDEX v1</span>
            </div>
            <div className="border-b border-[#1B202C] px-4 py-2.5 lg:border-r lg:border-b-0">
              <span className="block text-[#5A6478]">SETTLEMENT</span>
              <span className="mt-0.5 block text-[#B8FF2E]">{chain.name} · {chainId}</span>
            </div>
            <div className="border-r border-[#1B202C] px-4 py-2.5">
              <span className="block text-[#5A6478]">DETERMINISM</span>
              <span className="mt-0.5 block text-[#23F7DD]">DECIMAL(40) · HAMILTON BPS</span>
            </div>
            <div className="px-4 py-2.5">
              <span className="block text-[#5A6478]">LIVE EPOCH</span>
              <span className="mt-0.5 block text-[#F3F5F8] tabular-nums">
                {activeEpoch ? `#${activeEpoch.epochId} · ${activeEpoch.status.toUpperCase()}` : "STANDBY"}
              </span>
            </div>
          </div>
        </div>

        <div className="terminal-grid-bg relative">
          <div className="absolute inset-0 opacity-85">
            <HalftoneHorizonCanvas />
          </div>

          <div className="relative z-10 mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-20">
            <div className="space-y-6 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 border border-[#2B3345] bg-[#0B0D12]/90 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#B8FF2E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
                  THE ATTENTION LAYER · ON-CHAIN ORACLE
                </span>
                <span className="border border-[#1B202C] bg-[#06070A]/85 px-2.5 py-1 font-mono text-[10px] text-[#8B94A7] tabular-nums">
                  Σ I_n = {totalBps.toLocaleString("en-US")} BPS
                </span>
              </div>

              <h1 className="font-display text-4xl font-bold leading-[0.96] tracking-[-0.04em] text-[#F3F5F8] sm:text-6xl lg:text-[68px]">
                Measure Crypto Attention{" "}
                <span className="text-[#B8FF2E]">On-Chain.</span>
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-[#8B94A7] sm:text-lg">
                NTI transforms real-time crypto X discourse into deterministic 4-hour sector
                mindshare vectors — signed by independent EIP-712 validators and settled
                directly into Robinhood Chain markets, baskets, and staker yields.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href="/terminal"
                  className="inline-flex min-h-[46px] items-center justify-center bg-[#B8FF2E] px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[#06070A] transition-colors hover:bg-[#c9ff5c]"
                >
                  Open NTI Terminal →
                </Link>
                <Link
                  href="/markets"
                  className="inline-flex min-h-[46px] items-center justify-center border border-[#2B3345] bg-[#0B0D12]/90 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[#F3F5F8] transition-colors hover:border-[#23F7DD]/60 hover:text-[#23F7DD]"
                >
                  Explore Pair Markets
                </Link>
                {addresses.oracleCommit && (
                  <CopyContractPill label="ORACLE CA" address={addresses.oracleCommit} />
                )}
              </div>
            </div>

            <div className="lg:col-span-5">
              <TacticalFrame
                eyebrow="LIVE PROTOCOL TELEMETRY"
                rightLabel={activeEpoch ? `EP-${activeEpoch.epochId}` : "LIVE"}
              >
                <div className="grid grid-cols-2 divide-x divide-y divide-[#1B202C] font-mono tabular-nums">
                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      LEADER SECTOR
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
                      ACTIVE RADAR
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#F3F5F8]">
                      {radar.alerts.length} SIGNALS
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#F59E0B]">60M STAKER EDGE</div>
                  </div>

                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#5A6478]">
                      DATASET ROOT
                    </div>
                    <div className="mt-1 text-xs text-[#F3F5F8]">
                      {activeEpoch?.datasetHash
                        ? truncateHex(activeEpoch.datasetHash, 8, 6)
                        : "VERIFIED"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#23F7DD]">SHA-256 + EIP-712</div>
                  </div>
                </div>

                <div className="border-t border-[#1B202C] bg-[#06070A]/80 px-4 py-3 font-mono text-[11px] text-[#8B94A7]">
                  <div className="flex items-center justify-between">
                    <span>No wallet needed to browse live telemetry.</span>
                    <Link href="/stake" className="text-[#B8FF2E] hover:underline">
                      STAKE $NTI →
                    </Link>
                  </div>
                </div>
              </TacticalFrame>
            </div>
          </div>
        </div>

        <LiveTickerBar
          narratives={snapshot.narratives}
          epochId={activeEpoch?.epochId ?? null}
        />
      </section>

      {/* Section 01: Live Mindshare Snapshot */}
      <section id="live-index" className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[#1B202C] pb-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B8FF2E]">
              01 // LIVE SECTOR MINDSHARE
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F3F5F8] sm:text-3xl">
              Ten Tracked Narratives. One Verifiable Distribution.
            </h2>
          </div>
          <Link
            href="/terminal"
            className="border border-[#2B3345] bg-[#0B0D12] px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-[#F3F5F8] transition-colors hover:border-[#B8FF2E]/60 hover:text-[#B8FF2E]"
          >
            Inspect Full Terminal →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {sortedNarratives.slice(0, 5).map((n, idx) => (
            <Link
              key={n.narrativeId}
              href={`/narratives/${n.narrativeId}`}
              className="group border border-[#1B202C] bg-[#0B0D12] p-4 transition-colors hover:border-[#B8FF2E]/50 hover:bg-[#11141C]"
            >
              <div className="flex items-center justify-between font-mono text-[10px] text-[#5A6478]">
                <span>RANK #{String(idx + 1).padStart(2, "0")}</span>
                <span className="text-[#23F7DD]">{n.iBps} BPS</span>
              </div>
              <div className="mt-2 font-display text-base font-semibold text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                {n.label}
              </div>
              <div className="mt-3 font-mono text-2xl font-bold text-[#F3F5F8] tabular-nums">
                {formatBpsPercent(n.iBps)}
              </div>
              <div className="mt-3 h-1 w-full bg-[#1B202C]">
                <div
                  className="h-full bg-[#B8FF2E]"
                  style={{ width: `${Math.min(100, (n.iBps / 2500) * 100)}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Section 02: 5-Stage Architecture Pipeline */}
      <section
        id="architecture"
        className="border-y border-[#1B202C] bg-[#0B0D12]/50 py-16"
      >
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="mb-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#23F7DD]">
              02 // AUTONOMOUS PIPELINE
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F3F5F8] sm:text-3xl">
              From Raw X Signals to Finalized On-Chain Truth.
            </h2>
          </div>

          <div className="grid grid-cols-1 border border-[#1B202C] bg-[#06070A] md:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STAGES.map((stage, i) => (
              <div
                key={stage.step}
                className={`flex flex-col justify-between p-5 ${
                  i < PIPELINE_STAGES.length - 1 ? "border-b border-[#1B202C] lg:border-r lg:border-b-0" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="border border-[#1B202C] bg-[#0B0D12] px-2 py-0.5 text-[#B8FF2E]">
                      {stage.step}
                    </span>
                    <span className="text-[#5A6478]">{stage.tag}</span>
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-[#F3F5F8]">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#8B94A7]">{stage.detail}</p>
                </div>
                <div className="mt-5 border-t border-[#1B202C] pt-3 font-mono text-[10px] text-[#23F7DD]">
                  {stage.metric}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 03: Verified Contracts */}
      <section id="contracts" className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B8FF2E]">
              03 // ON-CHAIN INFRASTRUCTURE
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#F3F5F8] sm:text-3xl">
              Deployed &amp; Verified on {chain.name}
            </h2>
          </div>
          <Link
            href="/oracle"
            className="font-mono text-xs text-[#23F7DD] hover:underline"
          >
            Inspect Live Oracle Proofs →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contractRows.map((c) => (
            <div
              key={c.name}
              className="flex flex-col justify-between border border-[#1B202C] bg-[#0B0D12] p-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-[#F3F5F8]">
                    {c.name}
                  </span>
                  <a
                    href={`${explorerBase}/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-[10px] text-[#23F7DD] hover:underline"
                  >
                    EXPLORER ↗
                  </a>
                </div>
                <p className="mt-1 text-xs text-[#8B94A7]">{c.role}</p>
              </div>
              <div className="mt-3">
                <CopyContractPill label="ADDR" address={c.address} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[#1B202C] bg-[#0B0D12] py-16">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B8FF2E]">
              READY TO TRADE &amp; VERIFY
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F3F5F8] sm:text-4xl">
              Signal over noise. Verified every 4 hours.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/terminal"
              className="inline-flex min-h-[46px] items-center justify-center bg-[#B8FF2E] px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[#06070A] hover:bg-[#c9ff5c]"
            >
              Launch Terminal →
            </Link>
            <Link
              href="/methodology"
              className="inline-flex min-h-[46px] items-center justify-center border border-[#2B3345] bg-[#06070A] px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[#F3F5F8] hover:border-[#23F7DD]/60 hover:text-[#23F7DD]"
            >
              Read Methodology
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
