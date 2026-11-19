"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Lock, Scale, ShieldCheck, Sliders } from "lucide-react";

interface StoryStage {
  id: string;
  tag: string;
  title: string;
  headline: string;
  summary: string;
  formula: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}

const STAGES: StoryStage[] = [
  {
    id: "normalization",
    tag: "01 · MATH ENGINE",
    title: "KOL Capping & Decay",
    headline: "Zero whale spam. Deterministic Decimal(40) vectors.",
    summary:
      "Social feeds are noisy and easy to astroturf. Before any post enters NTI, it passes a 48-hour half-life engagement decay curve, multi-label LLM relevance scoring (temp = 0), and an iterative 10% single-KOL truncation cap.",
    formula: "Σ I_n = 10,000 bps · α = 0.3 EMA · cap(KOL) ≤ 10%",
    bullets: [
      "60-post per-KOL per-epoch ceiling blocks automated thread flooding",
      "48h exponential decay weights recent conviction over stale spikes",
      "Hamilton largest-remainder rounding guarantees exact 10,000 bps sum",
    ],
    ctaLabel: "Read Full Methodology",
    ctaHref: "/methodology",
  },
  {
    id: "consensus",
    tag: "02 · EIP-712 ORACLE",
    title: "Quorum & 2h Dispute",
    headline: "Multi-validator attestation with permissionless challenge.",
    summary:
      "Every 4-hour epoch is signed independently via EIP-712 across at least 3 validators sharing ≥ 95% KOL coverage. After commit on Robinhood Chain, a strict 2-hour challenge window lets anyone dispute missing data or math divergence.",
    formula: "Validators ≥ 3 · Overlap ≥ 95% · Dispute = 7,200s",
    bullets: [
      "SHA-256 cycle manifest pins exact tweet IDs & classifier outputs",
      "Any address can submit an omission proof or math dispute on-chain",
      "Clean epochs auto-finalize once the 2-hour safety clock expires",
    ],
    ctaLabel: "Inspect Live Oracle",
    ctaHref: "/oracle",
  },
  {
    id: "value-flow",
    tag: "03 · VALUE ROUTING",
    title: "FeeRouter & Staking",
    headline: "Protocol activity flows straight back to ETH stakers & grants.",
    summary:
      "Every parimutuel pool swap and narrative basket deposit routes fees through FeeRouter.sol — splitting native ETH to $NTI stakers, funding Uniswap V3/V4 buybacks, and backing open ecosystem grants voted quadratically.",
    formula: "30% ETH Stakers · 40% Buyback & Burn · 30% Grants",
    bullets: [
      "Stake 100k $NTI to unlock 0-delay Real-Time Radar & 10% fee discount",
      "1M $NTI tier unlocks 25% discount; 5M $NTI reaches maximum 50% off",
      "60-minute public delay guarantees staker informational alpha",
    ],
    ctaLabel: "Stake $NTI & Tiers",
    ctaHref: "/stake",
  },
];

function StageVisual({ stageIndex }: { stageIndex: number }) {
  if (stageIndex === 0) {
    return (
      <div className="reticle-frame flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-[#1B202C] pb-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="flex items-center gap-2 text-[#B8FF2E]">
            <Scale className="h-3.5 w-3.5" />
            <span>DECIMAL(40) NORMALIZER</span>
          </span>
          <span className="text-[#23F7DD]">CAP ≤ 10.00%</span>
        </div>

        <div className="my-5 space-y-3">
          {[
            { name: "@KOL_Alpha (Uncapped 24.8%)", raw: 92, capped: 42, note: "TRUNCATED → 10%" },
            { name: "@KOL_Research (Organic 8.4%)", raw: 40, capped: 40, note: "PASSED · 8.40%" },
            { name: "@KOL_Onchain (Organic 6.9%)", raw: 34, capped: 34, note: "PASSED · 6.90%" },
            { name: "@KOL_Macro (Organic 5.1%)", raw: 26, capped: 26, note: "PASSED · 5.10%" },
          ].map((row) => (
            <div key={row.name} className="border border-[#1B202C] bg-[#06070A] p-3">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-[#F3F5F8]">{row.name}</span>
                <span className={row.raw > row.capped ? "text-[#F59E0B]" : "text-[#23F7DD]"}>
                  {row.note}
                </span>
              </div>
              <div className="mt-2 h-2 w-full bg-[#1B202C]">
                <div
                  className="relative h-full bg-[#2B3345]"
                  style={{ width: `${row.raw}%` }}
                >
                  <div
                    className="h-full bg-[#B8FF2E]"
                    style={{ width: `${Math.round((row.capped / row.raw) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#1B202C] pt-3 font-mono text-[10px] text-[#8B94A7]">
          <span>HAMILTON REMAINDER CHECK</span>
          <span className="text-[#B8FF2E]">SUM = 10,000 BPS ✓</span>
        </div>
      </div>
    );
  }

  if (stageIndex === 1) {
    return (
      <div className="reticle-frame flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-[#1B202C] pb-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="flex items-center gap-2 text-[#23F7DD]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>QUORUM & DISPUTE DIAL</span>
          </span>
          <span className="text-[#B8FF2E]">3 / 3 SIGNED</span>
        </div>

        <div className="my-5 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col items-center justify-center border border-[#1B202C] bg-[#06070A] p-4">
            <svg viewBox="0 0 180 180" className="h-36 w-36" aria-hidden="true">
              <circle cx="90" cy="90" r="72" fill="none" stroke="#1B202C" strokeWidth="8" />
              <circle
                cx="90"
                cy="90"
                r="72"
                fill="none"
                stroke="#B8FF2E"
                strokeWidth="8"
                strokeDasharray="340 452"
                strokeLinecap="butt"
                transform="rotate(-90 90 90)"
              />
              <circle
                cx="90"
                cy="90"
                r="52"
                fill="none"
                stroke="#23F7DD"
                strokeWidth="2"
                strokeDasharray="6 6"
              />
              <text
                x="90"
                y="84"
                textAnchor="middle"
                fill="#F3F5F8"
                fontSize="22"
                fontWeight="700"
                fontFamily="monospace"
              >
                02:00h
              </text>
              <text
                x="90"
                y="104"
                textAnchor="middle"
                fill="#8B94A7"
                fontSize="9"
                fontFamily="monospace"
              >
                DISPUTE GUARD
              </text>
            </svg>
          </div>

          <div className="flex flex-col justify-between space-y-2">
            {[
              { id: "VAL-01", overlap: "98.4%", sig: "EIP-712 VALID" },
              { id: "VAL-02", overlap: "97.1%", sig: "EIP-712 VALID" },
              { id: "VAL-03", overlap: "96.8%", sig: "EIP-712 VALID" },
            ].map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between border border-[#1B202C] bg-[#06070A] px-3 py-2.5 font-mono text-[10px]"
              >
                <div>
                  <div className="font-semibold text-[#F3F5F8]">{v.id}</div>
                  <div className="text-[#5A6478]">Overlap {v.overlap}</div>
                </div>
                <span className="border border-[#B8FF2E]/40 bg-[#B8FF2E]/10 px-2 py-0.5 text-[#B8FF2E]">
                  {v.sig}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#1B202C] pt-3 font-mono text-[10px] text-[#8B94A7]">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-[#23F7DD]" />
            <span>PERMISSIONLESS BOND CHALLENGE</span>
          </span>
          <span className="text-[#23F7DD]">DISPUTE.SOL ARMED</span>
        </div>
      </div>
    );
  }

  return (
    <div className="reticle-frame flex h-full flex-col justify-between p-5 sm:p-6">
      <div className="flex items-center justify-between border-b border-[#1B202C] pb-3 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="flex items-center gap-2 text-[#B8FF2E]">
          <Sliders className="h-3.5 w-3.5" />
          <span>FEEROUTER & STAKER TIERS</span>
        </span>
        <span className="text-[#23F7DD]">30% ETH YIELD</span>
      </div>

      <div className="my-5 space-y-4">
        <div className="border border-[#1B202C] bg-[#06070A] p-3.5">
          <div className="mb-2 flex justify-between font-mono text-[10px] text-[#8B94A7]">
            <span>PROTOCOL REVENUE SPLIT</span>
            <span className="text-[#F3F5F8]">100% ALLOCATED ON-CHAIN</span>
          </div>
          <div className="flex h-4 w-full overflow-hidden border border-[#1B202C]">
            <div className="h-full bg-[#B8FF2E]" style={{ width: "30%" }} title="30% ETH to Stakers" />
            <div className="h-full bg-[#23F7DD]" style={{ width: "40%" }} title="40% Buyback & Burn" />
            <div className="h-full bg-[#38BDF8]" style={{ width: "30%" }} title="30% Grants & Treasury" />
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2 font-mono text-[10px]">
            <div>
              <span className="text-[#B8FF2E]">30% ETH</span>
              <div className="text-[#5A6478]">Staker Yield</div>
            </div>
            <div>
              <span className="text-[#23F7DD]">40% BUYBACK</span>
              <div className="text-[#5A6478]">V3/V4 Burn</div>
            </div>
            <div>
              <span className="text-[#38BDF8]">30% GRANTS</span>
              <div className="text-[#5A6478]">Ecosystem QF</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { tier: "TIER 1", stake: "100k $NTI", perk: "RT Radar + 10%" },
            { tier: "TIER 2", stake: "1M $NTI", perk: "25% Fee Off" },
            { tier: "TIER 3", stake: "5M $NTI", perk: "50% Max Off" },
          ].map((t) => (
            <div
              key={t.tier}
              className="border border-[#1B202C] bg-[#06070A] p-3 font-mono text-[10px]"
            >
              <div className="text-[#5A6478]">{t.tier}</div>
              <div className="mt-1 font-display text-sm font-bold text-[#F3F5F8]">{t.stake}</div>
              <div className="mt-1 text-[#B8FF2E]">{t.perk}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#1B202C] pt-3 font-mono text-[10px] text-[#8B94A7]">
        <span>60M PUBLIC DELAY VS 0S STAKER EDGE</span>
        <span className="text-[#B8FF2E]">SIWE SIGNED ✓</span>
      </div>
    </div>
  );
}

export function FeatureStory() {
  const [active, setActive] = useState(0);
  const current = STAGES[active] ?? STAGES[0]!;

  return (
    <div className="space-y-6">
      {/* Interactive Tab Selector inspired by BELL FeatureStory navigation */}
      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Operating engine controls">
        {STAGES.map((stage, i) => {
          const isCurrent = i === active;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => setActive(i)}
              className={`cursor-pointer border p-4 text-left transition-all ${
                isCurrent
                  ? "border-[#B8FF2E]/70 bg-[#11141C]"
                  : "border-[#1B202C] bg-[#0B0D12] hover:border-[#2B3345]"
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className={isCurrent ? "text-[#B8FF2E]" : "text-[#5A6478]"}>{stage.tag}</span>
                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />}
              </div>
              <div className="mt-1.5 font-display text-lg font-bold text-[#F3F5F8]">
                {stage.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage Copy + Custom Telemetry Instrument */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="panel-surface flex flex-col justify-between p-6 sm:p-8 lg:col-span-6">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
              {current.tag}
            </span>
            <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-[#F3F5F8] sm:text-3xl">
              {current.headline}
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[#8B94A7] sm:text-base">
              {current.summary}
            </p>

            <div className="mt-5 border border-[#1B202C] bg-[#06070A] px-3.5 py-2.5 font-mono text-xs text-[#B8FF2E]">
              {current.formula}
            </div>

            <ul className="mt-5 space-y-2.5">
              {current.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-[#C7CEDB]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#B8FF2E]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-7 border-t border-[#1B202C] pt-5">
            <Link
              href={current.ctaHref}
              className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#B8FF2E] hover:underline"
            >
              <span>{current.ctaLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <StageVisual stageIndex={active} />
        </div>
      </div>
    </div>
  );
}
