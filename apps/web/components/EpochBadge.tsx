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
    border: "border-[#3A3A40]",
    text: "text-[#CCFF00]",
    bg: "bg-[#1E1E21]",
    label: "COLLECTING",
  },
  computed: {
    border: "border-[#3A3A40]",
    text: "text-[#CCFF00]",
    bg: "bg-[#1E1E21]",
    label: "COMPUTED",
  },
  committed: {
    border: "border-[#E2A856]/50",
    text: "text-[#E2A856]",
    bg: "bg-[#E2A856]/10",
    label: "COMMITTED",
  },
  disputed: {
    border: "border-[#EF4444]/50",
    text: "text-[#EF4444]",
    bg: "bg-[#EF4444]/10",
    label: "DISPUTED",
  },
  final: {
    border: "border-[#4ADE80]/40",
    text: "text-[#4ADE80]",
    bg: "bg-[#4ADE80]/10",
    label: "FINAL",
  },
  incomplete: {
    border: "border-[#E2A856]/40",
    text: "text-[#E2A856]",
    bg: "bg-[#E2A856]/10",
    label: "INCOMPLETE",
  },
};

export function EpochBadge({ epochId, status, compact = false }: EpochBadgeProps) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.collecting;
  return (
    <Link
      href="/oracle"
      title="Inspect oracle epoch timeline, dataset hashes, and validator attestations"
      className={`inline-flex min-h-[24px] items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors hover:border-[#F5F5F7]/40 ${s.border} ${s.bg} ${s.text}`}
    >
      {epochId != null && <span className="text-[#F5F5F7] tabular-nums">EP-{epochId}</span>}
      <span>{compact ? status.toUpperCase() : s.label}</span>
    </Link>
  );
}
