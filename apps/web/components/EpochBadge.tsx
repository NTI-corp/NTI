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
    dot: "bg-[#23F7DD]",
    border: "border-[#23F7DD]/35",
    text: "text-[#23F7DD]",
    bg: "bg-[#23F7DD]/10",
    label: "COLLECTING",
  },
  computed: {
    dot: "bg-[#23F7DD]",
    border: "border-[#23F7DD]/35",
    text: "text-[#23F7DD]",
    bg: "bg-[#23F7DD]/10",
    label: "COMPUTED",
  },
  committed: {
    dot: "bg-[#F59E0B] animate-pulse",
    border: "border-[#F59E0B]/40",
    text: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    label: "COMMITTED · AWAITING FINAL",
  },
  disputed: {
    dot: "bg-[#F43F5E] animate-pulse",
    border: "border-[#F43F5E]/40",
    text: "text-[#F43F5E]",
    bg: "bg-[#F43F5E]/10",
    label: "DISPUTED",
  },
  final: {
    dot: "bg-[#B8FF2E]",
    border: "border-[#B8FF2E]/35",
    text: "text-[#B8FF2E]",
    bg: "bg-[#B8FF2E]/10",
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
      className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:border-[#F3F5F8]/40 ${s.border} ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {epochId != null && (
        <span className="text-[#F3F5F8] tabular-nums">EP-{epochId}</span>
      )}
      <span>{compact ? status.toUpperCase() : s.label}</span>
    </Link>
  );
}
