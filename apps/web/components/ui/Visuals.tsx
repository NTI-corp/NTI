import React from "react";
import Link from "next/link";
import { NARRATIVES } from "@nti/sdk";
import { sectorColor } from "@/lib/sectors";
import { SectorIcon } from "@/components/ui/Icons";
import type { EpochStatus, EpochSummary, ValidatorAttestationItem } from "@/lib/types";

type IconType = React.ComponentType<{ className?: string }>;

/** Sector marker: the sector's own icon in its color. */
export function SectorGlyph({ id, className = "h-3.5 w-3.5" }: { id: number; className?: string }) {
  const slug = NARRATIVES.find((n) => n.id === id)?.slug ?? "";
  return (
    <span className="inline-flex shrink-0" style={{ color: sectorColor(id) }}>
      <SectorIcon slug={slug} className={className} />
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * EmptyState: institutional carbon panel with crisp steps.
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
    <div className="border border-[#26262A] bg-[#161618] px-6 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center border border-[#26262A] bg-[#0D0D0E] text-[#CCFF00]">
        <Icon className="h-4 w-4" />
      </div>
      {kicker && (
        <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">
          {kicker}
        </div>
      )}
      <h2 className="mt-1.5 text-base font-semibold tracking-tight text-[#F5F5F7]">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-[#71717A]">{text}</p>
      {steps && steps.length > 0 && (
        <ol className="mx-auto mt-6 grid max-w-3xl border-l border-t border-[#1F1F23] text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s}
              className="flex items-start gap-2.5 border-b border-r border-[#1F1F23] bg-[#0D0D0E] p-3"
            >
              <span className="font-mono text-[10.5px] font-medium text-[#CCFF00]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs leading-relaxed text-[#A1A1AA]">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center bg-[#CCFF00] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0D0D0E] transition-colors hover:bg-[#B8E600]"
        >
          {action.label}
        </Link>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * FlowSteps: numbered pipeline grid with 1px hairlines.
 * ---------------------------------------------------------------------------------------------- */
export function FlowSteps({ steps }: { steps: Array<{ icon: IconType; title: string; text: string }> }) {
  return (
    <div className="grid grid-cols-2 border-l border-t border-[#26262A] bg-[#161618] sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className="border-b border-r border-[#26262A] bg-[#161618] p-3.5 transition-colors hover:bg-[#1E1E21]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center border border-[#1F1F23] bg-[#0D0D0E] text-[#CCFF00]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="font-mono text-[10px] text-[#52525B]">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#F5F5F7]">
              {s.title}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#71717A]">{s.text}</p>
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
  final: { color: "#4ADE80", height: 100, label: "Final" },
  committed: { color: "#A1A1AA", height: 72, label: "Committed" },
  disputed: { color: "#EF4444", height: 88, label: "Disputed" },
  computed: { color: "#71717A", height: 56, label: "Computed" },
  collecting: { color: "#52525B", height: 44, label: "Collecting" },
  incomplete: { color: "#3A3A40", height: 30, label: "Incomplete" },
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
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            Epoch Timeline · Last {ordered.length} Epochs
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#71717A]">
          {(["final", "committed", "disputed", "incomplete"] as const).map((st) => (
            <li key={st} className="flex items-center gap-1.5">
              <span className="h-2.5 w-1" style={{ background: STATUS_VISUAL[st].color }} />
              {STATUS_VISUAL[st].label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex h-28 items-end gap-1.5 bg-[#0D0D0E] p-4">
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
                className="w-full transition-all duration-150 group-hover:brightness-125"
                style={{
                  height: `${v.height}%`,
                  background: v.color,
                  outline: active ? `1.5px solid #CCFF00` : "none",
                  outlineOffset: 2,
                  opacity: active ? 1 : 0.72,
                }}
              />
              <span
                className={`font-mono text-[9px] tabular-nums ${
                  active ? "text-[#CCFF00]" : "text-[#52525B]"
                }`}
              >
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
const VALIDATOR_TINTS = ["#CCFF00", "#38BDF8", "#F59E0B", "#EF4444", "#A78BFA"] as const;

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
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
          Validator Agreement · {attestations.length} Signers
        </div>
        <div className="border border-[#4ADE80]/35 bg-[#4ADE80]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#4ADE80]">
          MAX SPREAD {worst} BPS · LIMIT 100
        </div>
      </div>
      <div className="p-4">
        <ul className="space-y-2">
          {rows.map(({ n, values, min, max }) => (
            <li
              key={n.id}
              className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-xs sm:grid-cols-[120px_1fr_64px]"
            >
              <span className="truncate font-medium text-[#F5F5F7]">{n.label}</span>
              <span className="relative h-2.5 bg-[#0D0D0E]">
                <span
                  className="absolute top-1/2 h-1 -translate-y-1/2"
                  style={{
                    left: pct(min),
                    width: `max(4px, calc(${pct(max)} - ${pct(min)}))`,
                    background: "rgba(204,255,0,0.35)",
                  }}
                />
                {values.map((v, i) => (
                  <span
                    key={i}
                    className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: pct(v), background: VALIDATOR_TINTS[i % VALIDATOR_TINTS.length] }}
                    title={`Validator ${i + 1}: ${v} bps`}
                  />
                ))}
              </span>
              <span className="text-right font-mono text-[10.5px] tabular-nums text-[#71717A]">
                ±{max - min}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-[#1F1F23] pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#71717A]">
          {attestations.map((a, i) => (
            <span key={a.validator} className="flex items-center gap-1.5">
              <span className="h-2.5 w-1" style={{ background: VALIDATOR_TINTS[i % VALIDATOR_TINTS.length] }} />
              {a.validator.slice(0, 6)}…{a.validator.slice(-4)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * TierLadder: staker fee-discount ladder.
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
    <div className="mt-4 border border-[#1F1F23] bg-[#0D0D0E] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px]">
        <span className="uppercase tracking-[0.1em] text-[#71717A]">Tier Position</span>
        <span className="text-[#F5F5F7]">
          {next
            ? `${Math.max(0, next.minNti - stake).toLocaleString("en-US")} $NTI to ${next.name}`
            : "Top tier unlocked"}
        </span>
      </div>
      <div className="relative mt-5 h-2 bg-[#1E1E21]">
        <div
          className="h-full bg-[#CCFF00] transition-all duration-500"
          style={{ width: pos(stake) }}
        />
        {tiers.map((t) => {
          const reached = stake >= t.minNti;
          return (
            <div
              key={t.name}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: pos(t.minNti) }}
            >
              <span
                className={`block h-3 w-3 border ${
                  reached ? "border-[#CCFF00] bg-[#CCFF00]" : "border-[#3A3A40] bg-[#0D0D0E]"
                }`}
              />
              <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[9.5px] text-[#71717A]">
                <span className="block text-[#F5F5F7]">{t.discount}</span>
                {t.minNti >= 1_000_000 ? `${t.minNti / 1_000_000}M` : `${t.minNti / 1_000}k`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-8" />
    </div>
  );
}
