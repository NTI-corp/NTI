"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Terminal } from "lucide-react";

const STAGES = [
  {
    key: "Fetch",
    fn: "nti_fetcher.py · 3-lane X",
    text: "Polls 25+ curated crypto KOL timelines across rotated cookie lanes with 60-post per-KOL cap.",
  },
  {
    key: "Classify",
    fn: "gemini-3.5-flash-lite",
    text: "Deterministic temperature=0 classifier maps each post q ∈ [0,1] across 10 narrative sectors.",
  },
  {
    key: "Compute",
    fn: "Decimal(40) · Hamilton",
    text: "Applies 48h decay, 10% single-KOL truncation cap, α=0.3 EMA, and Hamilton 10,000 bps rounding.",
  },
  {
    key: "Attest",
    fn: "EIP-712 · ≥3 validators",
    text: "Validators cross-check ≥95% KOL overlap, hash the cycle manifest (SHA-256), and sign digest.",
  },
  {
    key: "Commit",
    fn: "OracleCommit.sol · 46630",
    text: "Submits packed 10-sector vector on Robinhood Chain; 2h dispute window opens before finalization.",
  },
] as const;

export function OraclePipelineConsole({
  epochId,
  datasetRoot,
  leaderLabel,
  leaderBps,
  chainId,
}: {
  epochId: number | null;
  datasetRoot: string;
  leaderLabel: string;
  leaderBps: number;
  chainId: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(4);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);

  const ep = epochId ?? 124658;
  const shortRoot =
    datasetRoot.length > 18
      ? `${datasetRoot.slice(0, 10)}…${datasetRoot.slice(-6)}`
      : datasetRoot;

  const LOGS: string[][] = [
    [
      `nti_fetcher --epoch ${ep} --lanes 3 --kols 25 --cap 60`,
      `fetched 418 valid posts · manifest sha256 → ${shortRoot}`,
    ],
    [
      `classify --model gemini-3.5-flash-lite --temp 0 --sectors 10`,
      `scored 418 posts · top sector=${leaderLabel.toUpperCase()} (${leaderBps} bps)`,
    ],
    [
      `math.decimal40 --decay-half-life 48h --kol-cap 0.10 --ema 0.3`,
      `hamilton_round(vector) → sum=10000 bps (invariant=OK)`,
    ],
    [
      `quorum.attest --validators 3/3 --min-overlap 0.95`,
      `eip712_verify(digest, sig[0..2]) → 3/3 valid ✓`,
    ],
    [
      `oracleCommit.commitEpoch(${ep}, packedVector, ${shortRoot})`,
      `status=COMMITTED · disputeWindow=7200s · chainId=${chainId}`,
    ],
  ];

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPlaying(false);
      setStep(4);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !playing) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STAGES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [visible, playing]);

  const visibleLogs = LOGS.flatMap((group, idx) =>
    idx <= step ? group.map((line) => ({ idx, line })) : [],
  ).slice(-7);

  const field = (minStep: number, val: string) => (step >= minStep ? val : "pending");

  return (
    <div ref={rootRef} className="reticle-frame overflow-hidden">
      {/* Console Top Chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1B202C] bg-[#0B0D12] px-4 py-3 font-mono text-[11px]">
        <div className="flex items-center gap-2.5 text-[#F3F5F8]">
          <Terminal className="h-3.5 w-3.5 text-[#B8FF2E]" />
          <span className="font-semibold">NTI-EPOCH-{ep}</span>
          <span className="text-[#5A6478]">·</span>
          <span className="text-[#8B94A7]">ROBINHOOD CHAIN {chainId}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex cursor-pointer items-center gap-1.5 border border-[#1B202C] bg-[#06070A] px-2.5 py-1 text-[10px] uppercase text-[#8B94A7] hover:border-[#2B3345] hover:text-[#F3F5F8]"
          >
            {playing ? <Pause className="h-3 w-3 text-[#B8FF2E]" /> : <Play className="h-3 w-3 text-[#B8FF2E]" />}
            <span>{playing ? "LIVE CYCLE" : "PAUSED"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
            aria-label="Replay pipeline cycle"
            className="inline-flex cursor-pointer items-center border border-[#1B202C] bg-[#06070A] p-1.5 text-[#8B94A7] hover:border-[#2B3345] hover:text-[#F3F5F8]"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid divide-y divide-[#1B202C] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left: 5 Clickable Stages */}
        <ol className="divide-y divide-[#1B202C] lg:col-span-6" aria-label="Pipeline stages">
          {STAGES.map((s, i) => {
            const state = i < step ? "DONE" : i === step ? "RUNNING" : "QUEUED";
            const isCurrent = i === step;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPlaying(false);
                  }}
                  className={`flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-left transition-colors ${
                    isCurrent
                      ? "bg-[#11141C]"
                      : i < step
                        ? "bg-[#0B0D12]/60 hover:bg-[#11141C]/60"
                        : "bg-[#06070A] opacity-65 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${
                        isCurrent ? "text-[#B8FF2E]" : i < step ? "text-[#23F7DD]" : "text-[#5A6478]"
                      }`}
                    >
                      0{i + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-bold text-[#F3F5F8]">
                          {s.key}
                        </span>
                        <span className="font-mono text-[10px] text-[#5A6478]">{s.fn}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#8B94A7]">{s.text}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] ${
                      isCurrent
                        ? "border-[#B8FF2E]/60 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                        : i < step
                          ? "border-[#23F7DD]/40 bg-[#23F7DD]/10 text-[#23F7DD]"
                          : "border-[#1B202C] text-[#5A6478]"
                    }`}
                  >
                    {state}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Right: Watcher Log + Deterministic Report Receipt */}
        <div className="flex flex-col divide-y divide-[#1B202C] bg-[#06070A] lg:col-span-6">
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#5A6478]">
              <span>WATCHER STREAM LOG</span>
              <span className="text-[#23F7DD]">STEP 0{step + 1} / 05</span>
            </div>
            <ul className="min-h-[156px] space-y-1.5 font-mono text-[11px]">
              {visibleLogs.map((entry, idx) => (
                <li
                  key={`${entry.idx}-${idx}`}
                  className="flex items-start gap-2 leading-relaxed"
                  style={{
                    opacity: 0.5 + (idx / Math.max(1, visibleLogs.length - 1)) * 0.5,
                  }}
                >
                  <span className="text-[#B8FF2E]">$</span>
                  <span className="break-all text-[#C7CEDB]">{entry.line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 p-4 sm:p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5A6478]">
              ON-CHAIN EPOCH RECEIPT
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 font-mono text-[11px]">
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">epochId</dt>
                <dd className="tabular-nums text-[#F3F5F8]">#{ep}</dd>
              </div>
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">datasetRoot</dt>
                <dd className={step >= 0 ? "text-[#23F7DD]" : "text-[#5A6478]"}>
                  {field(0, shortRoot)}
                </dd>
              </div>
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">topSector</dt>
                <dd className={step >= 1 ? "text-[#F3F5F8]" : "text-[#5A6478]"}>
                  {field(1, `${leaderLabel} (${leaderBps})`)}
                </dd>
              </div>
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">sumCheck</dt>
                <dd className={step >= 2 ? "text-[#B8FF2E]" : "text-[#5A6478]"}>
                  {field(2, "10,000 bps")}
                </dd>
              </div>
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">quorum</dt>
                <dd className={step >= 3 ? "text-[#23F7DD]" : "text-[#5A6478]"}>
                  {field(3, "3 / 3 EIP-712")}
                </dd>
              </div>
              <div className="flex justify-between border-b border-[#1B202C] pb-1.5">
                <dt className="text-[#5A6478]">settlement</dt>
                <dd className={step >= 4 ? "text-[#B8FF2E]" : "text-[#5A6478]"}>
                  {field(4, "COMMITTED")}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
