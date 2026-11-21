import React from "react";
import Link from "next/link";
import { NARRATIVES } from "@nti/sdk";
import { sectorColor } from "@/lib/sectors";
import { SectorIcon } from "@/components/ui/Icons";
import type { EpochStatus, EpochSummary, ValidatorAttestationItem } from "@/lib/types";

type IconType = React.ComponentType<{ className?: string }>;

/** Sector marker: the sector's own icon in its color (replaces anonymous colored dots). */
export function SectorGlyph({ id, className = "h-3.5 w-3.5" }: { id: number; className?: string }) {
  const slug = NARRATIVES.find((n) => n.id === id)?.slug ?? "";
  return (
    <span className="inline-flex shrink-0" style={{ color: sectorColor(id) }}>
      <SectorIcon slug={slug} className={className} />
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * EmptyState: a designed "nothing here yet" panel with the steps that will fill it.
 * ---------------------------------------------------------------------------------------------- */
export function EmptyState({
  icon: Icon,
  kicker,
  title,
  text,
  steps,
  action,
  children,
}: {
  icon: IconType;
  kicker?: string;
  title: string;
  text: string;
  steps?: string[];
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-[#2E2E31] bg-[#0A0A0B] px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="terminal-grid-bg pointer-events-none absolute inset-0 opacity-50"
        style={{ maskImage: "radial-gradient(ellipse at center, black, transparent 70%)" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-[#CCFF00]/[0.07] blur-[70px]" />
      <div className="relative">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#CCFF00]/30 bg-[#CCFF00]/10 text-[#CCFF00] shadow-[0_0_40px_-10px_rgba(204,255,0,0.5)]">
          <Icon className="h-6 w-6" />
        </div>
        {kicker && <div className="kicker mt-5">{kicker}</div>}
        <h2 className="mt-2 font-display text-2xl font-extrabold uppercase tracking-tight text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#A1A1AA]">{text}</p>
        {steps && steps.length > 0 && (
          <ol className="mx-auto mt-6 grid max-w-3xl gap-2 text-left sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-3 rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#CCFF00]/12 font-mono text-[11px] font-bold text-[#CCFF00]">
                  {i + 1}
                </span>
                <span className="text-xs leading-relaxed text-[#D4D4D8]">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {action && (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center rounded-md bg-[#CCFF00] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#B8E600]"
          >
            {action.label}
          </Link>
        )}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * FlowSteps: numbered pipeline with icons and connectors.
 * ---------------------------------------------------------------------------------------------- */
export function FlowSteps({ steps }: { steps: Array<{ icon: IconType; title: string; text: string }> }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-[#232325] bg-[#232325] grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className="group relative bg-[#0C0C0D] p-4 transition-colors hover:bg-[#101011]">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CCFF00]/25 bg-[#CCFF00]/10 text-[#CCFF00] transition-transform group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </span>
              <span className="font-mono text-[10px] text-[#52525B]">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div className="mt-3 font-display text-sm font-extrabold uppercase tracking-tight text-white">{s.title}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8A8A93]">{s.text}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * EpochTimeline: recent epochs as status-colored bars, newest on the right.
 * ---------------------------------------------------------------------------------------------- */
const STATUS_VISUAL: Record<EpochStatus, { color: string; height: number; label: string }> = {
  final: { color: "#22C55E", height: 100, label: "Final" },
  committed: { color: "#F59E0B", height: 72, label: "Committed" },
  disputed: { color: "#EF4444", height: 88, label: "Disputed" },
  computed: { color: "#38BDF8", height: 56, label: "Computed" },
  collecting: { color: "#71717A", height: 44, label: "Collecting" },
  incomplete: { color: "#52525B", height: 30, label: "Incomplete" },
};

export function EpochTimeline({
  epochs,
  activeId,
  loadingId,
  onSelect,
}: {
  epochs: EpochSummary[];
  activeId: number;
  loadingId?: number | null;
  onSelect: (epochId: number) => void;
}) {
  const ordered = [...epochs].sort((a, b) => a.epochId - b.epochId);
  return (
    <div className="rounded-xl border border-[#232325] bg-[#0E0E0F] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="kicker">Epoch timeline</div>
          <div className="mt-1 font-display text-lg font-extrabold uppercase tracking-tight text-white">
            Last {ordered.length} epochs
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]">
          {(["final", "committed", "disputed", "incomplete"] as const).map((st) => (
            <li key={st} className="flex items-center gap-1.5">
              <span className="h-3 w-1 rounded-sm" style={{ background: STATUS_VISUAL[st].color }} />
              {STATUS_VISUAL[st].label}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex h-28 items-end gap-1.5">
        {ordered.map((ep) => {
          const v = STATUS_VISUAL[ep.status] ?? STATUS_VISUAL.collecting;
          const active = ep.epochId === activeId;
          return (
            <button
              key={ep.epochId}
              type="button"
              onClick={() => onSelect(ep.epochId)}
              disabled={loadingId === ep.epochId}
              title={`Epoch #${ep.epochId} · ${v.label}`}
              className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
            >
              <span
                className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-125"
                style={{
                  height: `${v.height}%`,
                  background: `linear-gradient(to top, ${v.color}33, ${v.color})`,
                  outline: active ? `2px solid #CCFF00` : "none",
                  outlineOffset: 2,
                  opacity: active ? 1 : 0.78,
                }}
              />
              <span className={`font-mono text-[9px] tabular-nums ${active ? "text-[#CCFF00]" : "text-[#71717A]"}`}>
                {String(ep.epochId).slice(-3)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * ValidatorSpread: how closely the validators agree, per narrative.
 * ---------------------------------------------------------------------------------------------- */
const VALIDATOR_TINTS = ["#CCFF00", "#38BDF8", "#F472B6", "#F59E0B", "#A78BFA"] as const;

export function ValidatorSpread({ attestations }: { attestations: ValidatorAttestationItem[] }) {
  if (attestations.length === 0) return null;
  const rows = NARRATIVES.map((n, idx) => {
    const values = attestations.map((a) => a.iBps[idx] ?? 0);
    return { n, values, min: Math.min(...values), max: Math.max(...values) };
  });
  const top = Math.max(1, ...rows.map((r) => r.max));
  const worst = Math.max(...rows.map((r) => r.max - r.min));
  const pct = (v: number) => `${(v / top) * 100}%`;

  return (
    <div className="rounded-xl border border-[#232325] bg-[#0E0E0F] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="kicker">Validator agreement</div>
          <div className="mt-1 font-display text-lg font-extrabold uppercase tracking-tight text-white">
            {attestations.length} validators, one answer
          </div>
        </div>
        <div className="rounded-md border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1.5 font-mono text-[11px] text-[#22C55E]">
          Max spread {worst} bps · limit 100
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map(({ n, values, min, max }) => (
          <li key={n.id} className="grid grid-cols-[92px_1fr_44px] sm:grid-cols-[120px_1fr_64px] items-center gap-3 text-xs">
            <span className="flex items-center gap-2 truncate text-[#D4D4D8]">
              <SectorGlyph id={n.id} />
              <span className="truncate">{n.label}</span>
            </span>
            <span className="relative h-3 rounded-full bg-[#151516]">
              <span
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ left: pct(min), width: `max(4px, calc(${pct(max)} - ${pct(min)}))`, background: `${sectorColor(n.id)}55` }}
              />
              {values.map((v, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm"
                  style={{ left: pct(v), background: VALIDATOR_TINTS[i % VALIDATOR_TINTS.length] }}
                  title={`Validator ${i + 1}: ${v} bps`}
                />
              ))}
            </span>
            <span className="text-right font-mono text-[11px] tabular-nums text-[#A1A1AA]">±{max - min}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
        {attestations.map((a, i) => (
          <span key={a.validator} className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-sm" style={{ background: VALIDATOR_TINTS[i % VALIDATOR_TINTS.length] }} />
            {a.validator.slice(0, 6)}…{a.validator.slice(-4)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * TierLadder: where the staker sits between the discount tiers (square-root scale keeps 100k visible).
 * ---------------------------------------------------------------------------------------------- */
export function TierLadder({
  stake,
  tiers,
}: {
  stake: number;
  tiers: ReadonlyArray<{ name: string; minNti: number; discount: string }>;
}) {
  const max = Math.max(...tiers.map((t) => t.minNti)) * 1.15;
  const pos = (v: number) => `${Math.min(100, (Math.sqrt(v) / Math.sqrt(max)) * 100)}%`;
  const next = tiers.find((t) => stake < t.minNti);
  return (
    <div className="mt-4 rounded-lg border border-[#232325] bg-[#090909] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
        <span className="uppercase tracking-wider text-[#8A8A93]">Your position</span>
        <span className="text-[#A1A1AA]">
          {next
            ? `${Math.max(0, next.minNti - stake).toLocaleString("en-US")} $NTI to ${next.name}`
            : "Top tier unlocked"}
        </span>
      </div>
      <div className="relative mt-6 h-2.5 rounded-full bg-[#151516]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#CCFF00]/40 to-[#CCFF00] transition-all duration-700"
          style={{ width: pos(stake) }}
        />
        {tiers.map((t) => {
          const reached = stake >= t.minNti;
          return (
            <div key={t.name} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(t.minNti) }}>
              <span
                className={`block h-4 w-4 rounded-full border-2 ${
                  reached ? "border-[#CCFF00] bg-[#CCFF00]" : "border-[#3A3A3D] bg-[#0E0E0F]"
                }`}
              />
              <span className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10px] text-[#A1A1AA]">
                <span className="block text-white">{t.discount}</span>
                {t.minNti >= 1_000_000 ? `${t.minNti / 1_000_000}M` : `${t.minNti / 1_000}k`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-9" />
    </div>
  );
}
