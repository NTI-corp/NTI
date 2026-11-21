"use client";

import Link from "next/link";
import type { EpochStatus } from "@/lib/types";

interface EpochBadgeProps {
  epochId?: number | null;
  status: EpochStatus;
  compact?: boolean;
}

const STATUS_STYLE: Record<
  EpochStatus,
  { border: string; text: string; bg: string; label: string }
> = {
  collecting: {
    border: "border-[#CCFF00]/40",
    text: "text-[#CCFF00]",
    bg: "bg-[#CCFF00]/12",
    label: "COLLECTING",
  },
  computed: {
    border: "border-[#CCFF00]/40",
    text: "text-[#CCFF00]",
    bg: "bg-[#CCFF00]/12",
    label: "COMPUTED",
  },
  committed: {
    border: "border-[#F59E0B]/40",
    text: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    label: "COMMITTED · AWAITING FINAL",
  },
  disputed: {
    border: "border-[#EF4444]/40",
    text: "text-[#F87171]",
    bg: "bg-[#EF4444]/10",
    label: "DISPUTED",
  },
  final: {
    border: "border-[#22C55E]/40",
    text: "text-[#22C55E]",
    bg: "bg-[#22C55E]/10",
    label: "FINAL",
  },
  incomplete: {
    border: "border-[#F59E0B]/35",
    text: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    label: "INCOMPLETE",
  },
};

export function EpochBadge({ epochId, status, compact = false }: EpochBadgeProps) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.collecting;
  return (
    <Link
      href="/oracle"
      title="Inspect oracle epoch timeline, dataset hashes, and validator attestations"
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:border-[#3A3A3D] ${s.border} ${s.bg} ${s.text}`}
    >
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {epochId != null && <span className="text-[#F4F4F5] tabular-nums">EP-{epochId}</span>}
      <span>{compact ? status.toUpperCase() : s.label}</span>
    </Link>
  );
}
