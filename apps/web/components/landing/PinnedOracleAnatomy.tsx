"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Lock,
  Radio,
  Scale,
  ShieldCheck,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const ANATOMY_STAGES = [
  {
    key: "ingestion",
    label: "Ingestion",
    headline: "Three rotated X lanes collect curated voices without noise.",
    detail:
      "Every four hours, independent worker lanes pull timelines across 25+ curated crypto accounts, enforcing a strict 60-post per-account ceiling and sealing the raw dataset with SHA-256.",
    metricLabel: "25+ KOLs · 60-post ceiling · SHA-256 manifest",
    icon: Radio,
    accent: "#38BDF8",
  },
  {
    key: "classification",
    label: "Classification",
    headline: "Zero-temperature semantic scoring across all ten sectors.",
    detail:
      "Posts are evaluated deterministically at temperature 0, producing calibrated multi-label relevance weights q ∈ [0, 1] across Privacy, AI Agents, RWA, DeFi, Perp DEX, and more.",
    metricLabel: "Gemini Flash-Lite · temp = 0 · 10 verticals",
    icon: Cpu,
    accent: "#818CF8",
  },
  {
    key: "normalization",
    label: "Normalization",
    headline: "Dominance capping and Decimal(40) precision stop brigading.",
    detail:
      "A 48-hour exponential decay weights fresh conviction while iterative truncation caps any single KOL at 10% share before Hamilton largest-remainder rounding guarantees 10,000 bps.",
    metricLabel: "48h decay · 10% KOL cap · α = 0.3 EMA",
    icon: Scale,
    accent: "#F59E0B",
  },
  {
    key: "settlement",
    label: "Settlement",
    headline: "EIP-712 quorum commits behind a two-hour dispute shield.",
    detail:
      "At least three independent validators sharing ≥95% KOL overlap sign the packed vector. Once committed to Robinhood Chain, a permissionless 2-hour Dispute window guards finalization.",
    metricLabel: "Validators ≥ 3 · 95% overlap · 7,200s challenge",
    icon: ShieldCheck,
    accent: "#10B981",
  },
] as const;

function AnatomyVisual({ stageIndex }: { stageIndex: number }) {
  if (stageIndex === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#222836] pb-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-[#38BDF8]">
            <Radio className="h-4 w-4" />
            <span>3-Lane Ingestion Collector</span>
          </span>
          <span
            className="text-[11px] text-[#64748B]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            Cycle 4h
          </span>
        </div>

        <div className="space-y-2.5">
          {[
            { lane: "Lane A", accounts: "9 KOLs", posts: "148 posts", pct: "84%" },
            { lane: "Lane B", accounts: "8 KOLs", posts: "136 posts", pct: "76%" },
            { lane: "Lane C", accounts: "8 KOLs", posts: "134 posts", pct: "74%" },
          ].map((l) => (
            <div key={l.lane} className="rounded-xl border border-[#222836] bg-[#0B0D13] p-3.5">
              <div
                className="flex items-center justify-between text-xs"
                style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
              >
                <span className="font-semibold text-[#F4F6FA]">{l.lane}</span>
                <span className="text-[#94A0B8]">
                  {l.accounts} · {l.posts}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#191E2B]">
                <div className="h-full rounded-full bg-[#38BDF8]" style={{ width: l.pct }} />
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between rounded-xl border border-[#222836] bg-[#0B0D13] px-4 py-3 text-xs"
          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
        >
          <span className="text-[#64748B]">Dataset Hash</span>
          <span className="text-[#10B981]">SHA-256 Locked</span>
        </div>
      </div>
    );
  }

  if (stageIndex === 1) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#222836] pb-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-[#818CF8]">
            <Cpu className="h-4 w-4" />
            <span>Multi-Label Sector Classifier</span>
          </span>
          <span
            className="text-[11px] text-[#64748B]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            temp = 0.0
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { name: "AI Agents", score: "0.92" },
            { name: "DeFi", score: "0.78" },
            { name: "Perp DEX", score: "0.64" },
            { name: "Stablecoins", score: "0.55" },
            { name: "Privacy / ZK", score: "0.48" },
            { name: "RWA", score: "0.41" },
          ].map((item) => (
            <div
              key={item.name}
              className="rounded-xl border border-[#222836] bg-[#0B0D13] p-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#E2E8F0]">{item.name}</span>
                <span
                  className="font-semibold text-[#818CF8]"
                  style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                >
                  q={item.score}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#191E2B]">
                <div
                  className="h-full rounded-full bg-[#818CF8]"
                  style={{ width: `${Number(item.score) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between rounded-xl border border-[#222836] bg-[#0B0D13] px-4 py-3 text-xs"
          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
        >
          <span className="text-[#64748B]">Classifier Mode</span>
          <span className="text-[#F4F6FA]">Deterministic Replayable</span>
        </div>
      </div>
    );
  }

  if (stageIndex === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#222836] pb-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-[#F59E0B]">
            <Scale className="h-4 w-4" />
            <span>Single-KOL Dominance Cap</span>
          </span>
          <span
            className="text-[11px] text-[#F59E0B]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            Ceiling 10.00%
          </span>
        </div>

        <div className="space-y-2.5">
          {[
            { handle: "@WhalePoster", raw: 92, capped: 42, status: "Capped 24.8% -> 10.0%" },
            { handle: "@DeFiResearch", raw: 38, capped: 38, status: "Organic 8.6%" },
            { handle: "@MacroDesk", raw: 31, capped: 31, status: "Organic 7.1%" },
          ].map((row) => (
            <div key={row.handle} className="rounded-xl border border-[#222836] bg-[#0B0D13] p-3.5">
              <div
                className="flex items-center justify-between text-xs"
                style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
              >
                <span className="text-[#F4F6FA]">{row.handle}</span>
                <span className={row.raw > row.capped ? "text-[#F59E0B]" : "text-[#10B981]"}>
                  {row.status}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#191E2B]">
                <div className="h-full bg-[#2A3244]" style={{ width: `${row.raw}%` }}>
                  <div
                    className="h-full rounded-full bg-[#F59E0B]"
                    style={{ width: `${Math.round((row.capped / row.raw) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between rounded-xl border border-[#222836] bg-[#0B0D13] px-4 py-3 text-xs"
          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
        >
          <span className="text-[#64748B]">Hamilton Vector Check</span>
          <span className="text-[#10B981]">Sum = 10,000 bps</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#222836] pb-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-[#10B981]">
          <ShieldCheck className="h-4 w-4" />
          <span>EIP-712 Quorum &amp; Dispute Guard</span>
        </span>
        <span
          className="text-[11px] text-[#10B981]"
          style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
        >
          Finalized
        </span>
      </div>

      <div className="space-y-2.5">
        {[
          { signer: "Validator Node Alpha", overlap: "98.2% overlap" },
          { signer: "Validator Node Beta", overlap: "97.4% overlap" },
          { signer: "Validator Node Gamma", overlap: "96.6% overlap" },
        ].map((v) => (
          <div
            key={v.signer}
            className="flex items-center justify-between rounded-xl border border-[#222836] bg-[#0B0D13] px-4 py-3"
          >
            <div>
              <div className="text-xs font-semibold text-[#F4F6FA]">{v.signer}</div>
              <div
                className="text-[11px] text-[#64748B]"
                style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
              >
                {v.overlap}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#10B981]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Signed</span>
            </span>
          </div>
        ))}
      </div>

      <div
        className="flex items-center justify-between rounded-xl border border-[#222836] bg-[#0B0D13] px-4 py-3 text-xs"
        style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
      >
        <span className="flex items-center gap-1.5 text-[#94A0B8]">
          <Lock className="h-3.5 w-3.5 text-[#F59E0B]" />
          <span>Dispute Window</span>
        </span>
        <span className="text-[#F4F6FA]">2h Challenge Active</span>
      </div>
    </div>
  );
}

export function PinnedOracleAnatomy() {
  const containerRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    const prog = progressBarRef.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
      () => {
        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 2.4)}`,
          pin: true,
          scrub: 0.4,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const idx = Math.min(3, Math.floor(self.progress * 4));
            setActiveStage(idx);
            if (prog) {
              prog.style.transform = `scaleX(${Math.max(0.06, self.progress)})`;
            }
          },
        });
      },
    );

    return () => mm.revert();
  }, []);

  const current = ANATOMY_STAGES[activeStage] ?? ANATOMY_STAGES[0];

  return (
    <section
      id="engine"
      ref={containerRef}
      className="flex min-h-screen items-center bg-[#08090D] py-16 lg:py-0"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#38BDF8]">
              Oracle Engine Anatomy
            </span>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight text-[#F4F6FA] sm:text-4xl"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              How attention becomes settlement proof
            </h2>
          </div>

          <Link
            href="/methodology"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#38BDF8] hover:underline"
          >
            <span>Read Decimal(40) Specs</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Scroll-Scrubbed Progress Track */}
        <div className="mb-8 h-[2px] w-full overflow-hidden rounded-full bg-[#1C2130]">
          <div
            ref={progressBarRef}
            className="h-full w-full origin-left bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#10B981]"
            style={{ transform: "scaleX(0.25)" }}
          />
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-12">
          {/* Left: 4 Scroll-Linked Interactive Stage Selectors */}
          <div className="space-y-2.5 lg:col-span-6">
            {ANATOMY_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = idx === activeStage;

              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => setActiveStage(idx)}
                  className={`flex w-full cursor-pointer items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                    isActive
                      ? "border-[#38BDF8]/60 bg-[#121622] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                      : "border-[#1C2130] bg-[#0D1017] opacity-65 hover:opacity-100"
                  }`}
                >
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#242B3D] bg-[#08090D]"
                    style={{ color: isActive ? stage.accent : "#64748B" }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-bold text-[#F4F6FA]"
                        style={{ fontFamily: "var(--font-syne), sans-serif" }}
                      >
                        {stage.label}
                      </span>
                      {isActive && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: stage.accent }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A0B8]">
                      {stage.headline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Live Visual Funnel Stage */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 lg:col-span-6">
            <AnatomyVisual stageIndex={activeStage} />

            <div className="mt-6 border-t border-[#1D2230] pt-4">
              <p className="text-xs leading-relaxed text-[#94A0B8]">
                {current.detail}
              </p>
              <div
                className="mt-3 text-[11px] font-medium"
                style={{
                  color: current.accent,
                  fontFamily: "var(--font-ibm-mono), monospace",
                }}
              >
                {current.metricLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
