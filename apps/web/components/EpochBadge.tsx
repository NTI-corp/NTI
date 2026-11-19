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
  { dot: string; border: string; text: string; bg: string; label: string }
> = {
  collecting: {
    dot: "bg-[#38BDF8]",
    border: "border-[#38BDF8]/30",
    text: "text-[#38BDF8]",
    bg: "bg-[#38BDF8]/8",
    label: "COLLECTING",
  },
  computed: {
    dot: "bg-[#38BDF8]",
    border: "border-[#38BDF8]/30",
    text: "text-[#38BDF8]",
    bg: "bg-[#38BDF8]/8",
    label: "COMPUTED",
  },
  committed: {
    dot: "bg-[#F59E0B] animate-pulse",
    border: "border-[#F59E0B]/35",
    text: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    label: "COMMITTED · AWAITING FINAL",
  },
  disputed: {
    dot: "bg-[#EF4444] animate-pulse",
    border: "border-[#EF4444]/40",
    text: "text-[#EF4444]",
    bg: "bg-[#EF4444]/10",
    label: "DISPUTED",
  },
  final: {
    dot: "bg-[#10B981]",
    border: "border-[#10B981]/35",
    text: "text-[#10B981]",
    bg: "bg-[#10B981]/10",
    label: "FINAL",
  },
  incomplete: {
    dot: "bg-[#F59E0B]",
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
      className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors hover:border-[#EDF1F7]/40 ${s.border} ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {epochId != null && (
        <span className="text-[#EDF1F7] tabular-nums">EP-{epochId}</span>
      )}
      <span>{compact ? status.toUpperCase() : s.label}</span>
    </Link>
  );
}
