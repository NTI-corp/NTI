"use client";

import React, { useState } from "react";
import { truncateHex } from "@/lib/format";

export function CopyContractPill({
  label = "CA",
  address,
}: {
  label?: string;
  address: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={`Copy contract ${address}`}
      className="group inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-md border border-[#24242C] bg-[#131317] px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-[#6366F1]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#6366F1]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
      <span className="rounded border border-[#24242C] bg-[#19191F] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#A1A1AA]">
        {label}
      </span>
      <span className="text-[#F4F4F5] tabular-nums sm:hidden">{truncateHex(address, 8, 6)}</span>
      <span className="hidden text-[#F4F4F5] tabular-nums sm:inline">{address}</span>
      <span className="border-l border-[#24242C] pl-2 text-[10px] uppercase tracking-wider text-[#A5B4FC] group-hover:text-[#F4F4F5]">
        {copied ? "COPIED" : "COPY"}
      </span>
    </button>
  );
}

export function TacticalFrame({
  eyebrow,
  rightLabel,
  children,
  className = "",
}: {
  eyebrow?: string;
  rightLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[#24242C] bg-[#131317] ${className}`}>
      {(eyebrow || rightLabel) && (
        <div className="flex items-center justify-between border-b border-[#24242C] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-[#A1A1AA]">{eyebrow}</span>
          {rightLabel && <span className="text-[#A5B4FC] tabular-nums">{rightLabel}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
