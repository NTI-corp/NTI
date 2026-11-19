import { Fragment } from "react";

interface MilestonePhase {
  code: string;
  name: string;
  status: "VERIFIED" | "LIVE" | "ACTIVE" | "NEXT";
  bullets: string[];
}

const PHASES: MilestonePhase[] = [
  {
    code: "INGESTION",
    name: "3-Lane Collector",
    status: "VERIFIED",
    bullets: [
      "Rotated cookie lanes across 25+ curated crypto KOLs",
      "60-post per-KOL cap + SHA-256 cycle manifests",
      "Zero external black-box sentiment providers",
    ],
  },
  {
    code: "ENGINE",
    name: "Decimal(40) Core",
    status: "VERIFIED",
    bullets: [
      "Deterministic Gemini Flash-Lite scoring at temp = 0",
      "48h decay + 10% single-KOL dominance cap",
      "Hamilton largest-remainder exact 10,000 bps sum",
    ],
  },
  {
    code: "ORACLE",
    name: "EIP-712 & Disputes",
    status: "LIVE",
    bullets: [
      "4-hour automated commits on Robinhood Chain 46630",
      "Independent ≥3 validator attestation & 95% overlap",
      "Permissionless 2h Dispute bond safety guard",
    ],
  },
  {
    code: "MARKETS",
    name: "DeFi Suite Live",
    status: "LIVE",
    bullets: [
      "24h & 7d parimutuel NarrativePairMarkets pools",
      "Uniswap V3 30-min TWAP NarrativeBaskets vaults",
      "Quadratic Ecosystem Grants + 30% ETH staking yield",
    ],
  },
  {
    code: "MAINNET",
    name: "Chain 4663 Rollout",
    status: "NEXT",
    bullets: [
      "Canonical NTIRegistry freeze before live $NTI lock",
      "BuybackAdapter V3/V4 autonomous fee sweeps",
      "DAO Governor parameter & KOL-slate proposals",
    ],
  },
];

const NODE_X = (i: number) => 100 + i * 200;
const NODE_Y = (i: number) => (i % 2 ? 28 : 92);

function buildCurve(from: number, to: number): string {
  let d = `M${NODE_X(from)} ${NODE_Y(from)}`;
  for (let i = from; i < to; i++) {
    d += ` C${NODE_X(i) + 100} ${NODE_Y(i)} ${NODE_X(i + 1) - 100} ${NODE_Y(i + 1)} ${NODE_X(i + 1)} ${NODE_Y(i + 1)}`;
  }
  return d;
}

export function ProtocolRoadmap() {
  const fullDone = buildCurve(0, 3);
  const futureEdge = buildCurve(3, 4);

  return (
    <div className="space-y-8">
      {/* Winding SVG Milestone Rail inspired by BELL RoadmapSection */}
      <div className="relative hidden border border-[#1B202C] bg-[#0B0D12] px-6 py-10 md:block">
        <div className="relative h-28 w-full">
          <svg
            viewBox="0 0 1000 120"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={futureEdge}
              fill="none"
              stroke="#2B3345"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
            <path
              d={`M0 ${NODE_Y(0)} L${NODE_X(0)} ${NODE_Y(0)} ${fullDone.replace(/^M[^C]*/, "")}`}
              fill="none"
              stroke="#B8FF2E"
              strokeWidth="2.5"
            />
          </svg>

          {PHASES.map((p, i) => {
            const leftPct = (NODE_X(i) / 1000) * 100;
            const topPct = (NODE_Y(i) / 120) * 100;
            const isNext = p.status === "NEXT";
            return (
              <Fragment key={p.code}>
                <span
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 border ${
                    isNext
                      ? "border-[#5A6478] bg-[#06070A]"
                      : "border-[#B8FF2E] bg-[#B8FF2E]"
                  }`}
                />
                <span
                  style={{
                    left: `${leftPct}%`,
                    top: i % 2 ? "62%" : "22%",
                  }}
                  className={`absolute -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] ${
                    isNext ? "text-[#5A6478]" : "text-[#F3F5F8]"
                  }`}
                >
                  {p.code}
                </span>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* 5 Milestone Cards */}
      <ol className="grid gap-3 md:grid-cols-5">
        {PHASES.map((ph) => {
          const isNext = ph.status === "NEXT";
          return (
            <li
              key={ph.code}
              data-spot
              className={`panel-surface flex flex-col justify-between p-4 ${
                isNext ? "border-[#1B202C] opacity-85" : "border-[#1B202C]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#5A6478]">{ph.code}</span>
                  <span
                    className={`border px-1.5 py-0.5 ${
                      ph.status === "LIVE"
                        ? "border-[#B8FF2E]/50 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                        : ph.status === "VERIFIED"
                          ? "border-[#23F7DD]/40 bg-[#23F7DD]/10 text-[#23F7DD]"
                          : "border-[#2B3345] text-[#8B94A7]"
                    }`}
                  >
                    {ph.status}
                  </span>
                </div>
                <h3 className="mt-2.5 font-display text-base font-bold text-[#F3F5F8]">
                  {ph.name}
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#8B94A7]">
                  {ph.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 bg-[#B8FF2E]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
