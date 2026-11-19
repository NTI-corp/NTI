import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Coins,
  Layers,
  Radar,
  Shield,
  Sparkles,
} from "lucide-react";
import type { RadarAlertItem } from "@/lib/types";
import { formatSignedBps } from "@/lib/format";

const PRODUCT_CARDS = [
  {
    href: "/terminal",
    area: "LIVE MATRIX",
    state: "ALL SECTORS",
    title: "Narrative Index Terminal",
    detail:
      "Track real-time 10,000 bps sector share allocations, 4h velocity acceleration, and contributor manifests.",
    action: "Open Terminal",
    icon: BarChart3,
  },
  {
    href: "/markets",
    area: "PARIMUTUEL",
    state: "24H & 7D POOLS",
    title: "Narrative Pair Markets",
    detail:
      "Go long one narrative vs another over 24-hour or 7-day settlement epochs with zero external price oracles.",
    action: "Explore Markets",
    icon: Activity,
  },
  {
    href: "/baskets",
    area: "TWAP VAULTS",
    state: "UNISWAP V3",
    title: "Narrative Baskets",
    detail:
      "Deposit ETH into curated Uniswap V3 narrative vaults safeguarded by 30-minute TWAP manipulation bounds.",
    action: "View Baskets",
    icon: Layers,
  },
  {
    href: "/grants",
    area: "ECOSYSTEM QF",
    state: "MIND-WEIGHTED",
    title: "Quadratic Narrative Grants",
    detail:
      "Propose and allocate treasury matching pools toward emerging high-velocity builder narratives.",
    action: "Open Grants",
    icon: Sparkles,
  },
  {
    href: "/stake",
    area: "STAKER ALPHA",
    state: "30% ETH FEES",
    title: "Stake $NTI & RT Radar",
    detail:
      "Lock 100k+ $NTI for zero-delay Radar signals ahead of the 60-minute public feed plus up to 50% fee discounts.",
    action: "Stake $NTI",
    icon: Coins,
  },
  {
    href: "/oracle",
    area: "VERIFICATION",
    state: "EIP-712 + DISPUTE",
    title: "Oracle Consensus & Disputes",
    detail:
      "Audit signed validator vectors, dataset SHA-256 roots, and open permissionless 2-hour math challenges.",
    action: "Audit Oracle",
    icon: Shield,
  },
] as const;

export function ArchitectureFlowAndSuite({
  alerts,
  chainId,
}: {
  alerts: RadarAlertItem[];
  chainId: number;
}) {
  return (
    <div className="space-y-8">
      {/* BELL ProductFlowArt-inspired Interactive SVG Architecture Diagram */}
      <div className="reticle-frame p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8B94A7]">
          <span>HOW ATTENTION ENTERS ROBINHOOD CHAIN</span>
          <span className="text-[#23F7DD]">CHAIN ID {chainId} · DETERMINISTIC RAIL</span>
        </div>

        <svg
          viewBox="0 0 860 360"
          className="h-auto w-full"
          role="img"
          aria-label="Data flows from X 3-lane ingestion and Gemini classifier through the NTI EIP-712 Oracle Core into Markets, Baskets, Grants, and Staking"
        >
          <defs>
            <pattern id="nti-arch-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="#1B202C" strokeWidth="1" />
            </pattern>
            <linearGradient id="nti-beam-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#23F7DD" />
              <stop offset="50%" stopColor="#B8FF2E" />
              <stop offset="100%" stopColor="#23F7DD" />
            </linearGradient>
          </defs>

          <rect width="860" height="360" fill="#06070A" />
          <rect width="860" height="360" fill="url(#nti-arch-grid)" />

          {/* Base Rails */}
          <path
            d="M210 92 H305 Q335 92 355 128 L380 165 H485 Q515 165 540 128 L565 92 H640"
            fill="none"
            stroke="#1B202C"
            strokeWidth="2.5"
          />
          <path d="M210 180 H640" fill="none" stroke="#1B202C" strokeWidth="2.5" />
          <path
            d="M210 268 H305 Q335 268 355 232 L380 195 H485 Q515 195 540 232 L565 268 H640"
            fill="none"
            stroke="#1B202C"
            strokeWidth="2.5"
          />

          {/* Animated Glowing Data Beams */}
          <path
            d="M210 92 H305 Q335 92 355 128 L380 165 H485 Q515 165 540 128 L565 92 H640"
            fill="none"
            stroke="url(#nti-beam-grad)"
            strokeWidth="2.5"
            className="svg-beam-flow"
          />
          <path
            d="M210 180 H640"
            fill="none"
            stroke="url(#nti-beam-grad)"
            strokeWidth="2.5"
            className="svg-beam-flow"
          />
          <path
            d="M210 268 H305 Q335 268 355 232 L380 195 H485 Q515 195 540 232 L565 268 H640"
            fill="none"
            stroke="url(#nti-beam-grad)"
            strokeWidth="2.5"
            className="svg-beam-flow"
          />

          {/* Left Input Feeds */}
          <g>
            <rect x="34" y="62" width="176" height="60" fill="#0B0D12" stroke="#2B3345" />
            <text x="52" y="88" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              3-LANE X STREAM
            </text>
            <text x="52" y="106" fill="#23F7DD" fontSize="10" fontFamily="monospace">
              25+ KOLS · 60 POST CAP
            </text>
          </g>
          <g>
            <rect x="34" y="150" width="176" height="60" fill="#0B0D12" stroke="#2B3345" />
            <text x="52" y="176" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              GEMINI CLASSIFIER
            </text>
            <text x="52" y="194" fill="#B8FF2E" fontSize="10" fontFamily="monospace">
              10 SECTORS · TEMP = 0
            </text>
          </g>
          <g>
            <rect x="34" y="238" width="176" height="60" fill="#0B0D12" stroke="#2B3345" />
            <text x="52" y="264" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              DECIMAL(40) MATH
            </text>
            <text x="52" y="282" fill="#8B94A7" fontSize="10" fontFamily="monospace">
              48H DECAY · 10% KOL CAP
            </text>
          </g>

          {/* Center Hexagonal Oracle Core */}
          <g>
            <polygon
              points="370,84 404,58 456,58 490,84 490,276 456,302 404,302 370,276"
              fill="#11141C"
              stroke="#B8FF2E"
              strokeWidth="1.5"
            />
            <line x1="386" y1="120" x2="474" y2="120" stroke="#1B202C" strokeWidth="1" />
            <text
              x="430"
              y="102"
              textAnchor="middle"
              fill="#B8FF2E"
              fontSize="11"
              fontFamily="monospace"
            >
              CONSENSUS CORE
            </text>
            <text
              x="430"
              y="165"
              textAnchor="middle"
              fill="#F3F5F8"
              fontSize="19"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              NTI
            </text>
            <text
              x="430"
              y="186"
              textAnchor="middle"
              fill="#23F7DD"
              fontSize="12"
              fontWeight="600"
              fontFamily="monospace"
            >
              ORACLE COMMIT
            </text>
            <line x1="392" y1="205" x2="468" y2="205" stroke="#1B202C" strokeWidth="1" />
            <text x="430" y="226" textAnchor="middle" fill="#8B94A7" fontSize="10" fontFamily="monospace">
              ≥3 EIP-712 SIGS
            </text>
            <text x="430" y="244" textAnchor="middle" fill="#8B94A7" fontSize="10" fontFamily="monospace">
              SHA-256 MANIFEST
            </text>
            <text x="430" y="262" textAnchor="middle" fill="#8B94A7" fontSize="10" fontFamily="monospace">
              2H DISPUTE WINDOW
            </text>
          </g>

          {/* Right On-Chain Outputs */}
          <g>
            <rect x="640" y="62" width="186" height="60" fill="#0B0D12" stroke="#B8FF2E" strokeOpacity="0.6" />
            <text x="658" y="88" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              PAIR MARKETS
            </text>
            <text x="658" y="106" fill="#B8FF2E" fontSize="10" fontFamily="monospace">
              24H & 7D PARIMUTUEL
            </text>
          </g>
          <g>
            <rect x="640" y="150" width="186" height="60" fill="#0B0D12" stroke="#23F7DD" strokeOpacity="0.6" />
            <text x="658" y="176" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              V3 TWAP BASKETS
            </text>
            <text x="658" y="194" fill="#23F7DD" fontSize="10" fontFamily="monospace">
              30M TWAP NAV VAULTS
            </text>
          </g>
          <g>
            <rect x="640" y="238" width="186" height="60" fill="#0B0D12" stroke="#2B3345" />
            <text x="658" y="264" fill="#F3F5F8" fontSize="13" fontWeight="700" fontFamily="monospace">
              STAKING & GRANTS
            </text>
            <text x="658" y="282" fill="#8B94A7" fontSize="10" fontFamily="monospace">
              30% ETH · RT RADAR
            </text>
          </g>
        </svg>

        <div className="mt-4 grid gap-2 border-t border-[#1B202C] pt-3 font-mono text-[10px] text-[#8B94A7] sm:grid-cols-3">
          <span>01 · Signed collector streams verified discourse with strict caps.</span>
          <span>02 · Deterministic OracleCommit locks vectors behind 2h disputes.</span>
          <span>03 · Every contract reads verified finalIndex(epoch, sectorId).</span>
        </div>
      </div>

      {/* 6 Product Module Grid + Live Radar Panel */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
          {PRODUCT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                data-spot
                className="panel-surface group flex flex-col justify-between p-5 transition-colors hover:border-[#B8FF2E]/60 hover:bg-[#11141C]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center border border-[#2B3345] bg-[#06070A] text-[#B8FF2E]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-right font-mono text-[10px]">
                      <div className="text-[#5A6478]">{card.area}</div>
                      <div className="text-[#23F7DD]">{card.state}</div>
                    </div>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#8B94A7]">
                    {card.detail}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#1B202C] pt-3 font-mono text-[11px] uppercase tracking-wider text-[#F3F5F8] group-hover:text-[#B8FF2E]">
                  <span>{card.action}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Live Radar Signals Card alongside Product Modules */}
        <div className="reticle-frame flex flex-col justify-between p-5 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#1B202C] pb-3">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#B8FF2E]">
                <Radar className="h-4 w-4" />
                <span>LIVE RADAR FEED</span>
              </div>
              <span className="font-mono text-[10px] text-[#F59E0B]">60M STAKER EDGE</span>
            </div>

            <div className="mt-4 space-y-2.5">
              {alerts.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="border border-[#1B202C] bg-[#06070A] p-3 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#23F7DD]">
                      {a.kind === "new_token" ? "NEW TOKEN SIGNAL" : "VELOCITY SPIKE"}
                    </span>
                    <span className="text-[#5A6478]">SEC #{a.narrativeId}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[#F3F5F8]">
                      {a.narrativeLabel}
                    </span>
                    {a.vBps !== null && (
                      <span className="tabular-nums text-[#B8FF2E]">
                        V_n {formatSignedBps(a.vBps)}
                      </span>
                    )}
                  </div>
                  {a.token?.symbol && (
                    <div className="mt-1 text-[10px] text-[#8B94A7]">
                      Token signal: ${a.token.symbol}
                    </div>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="border border-[#1B202C] bg-[#06070A] p-4 font-mono text-xs text-[#5A6478]">
                  Radar scanner armed — awaiting next velocity spike &gt; 1.8x threshold.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-[#1B202C] pt-4">
            <Link
              href="/radar"
              className="flex w-full items-center justify-between border border-[#2B3345] bg-[#06070A] px-3.5 py-2.5 font-mono text-[11px] uppercase text-[#F3F5F8] hover:border-[#23F7DD]"
            >
              <span>Inspect Full Radar Feed</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#23F7DD]" />
            </Link>
            <Link
              href="/stake"
              className="flex w-full items-center justify-between border border-[#B8FF2E]/40 bg-[#B8FF2E]/10 px-3.5 py-2.5 font-mono text-[11px] uppercase text-[#B8FF2E] hover:bg-[#B8FF2E]/15"
            >
              <span>Unlock 0-Delay Staker Access</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
