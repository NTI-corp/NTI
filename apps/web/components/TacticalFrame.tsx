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
      className="group inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-md border border-[#232325] bg-[#0E0E0F] px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-[#CCFF00]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#CCFF00]"
    >
      <span className="rounded border border-[#232325] bg-[#1A1D22] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#A1A1AA]">
        {label}
      </span>
      <span className="text-[#F4F4F5] tabular-nums sm:hidden">{truncateHex(address, 8, 6)}</span>
      <span className="hidden text-[#F4F4F5] tabular-nums sm:inline">{address}</span>
      <span className="border-l border-[#232325] pl-2 text-[10px] uppercase tracking-wider text-[#CCFF00] group-hover:text-[#F4F4F5]">
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
    <div className={`rounded-lg border border-[#232325] bg-[#0E0E0F] ${className}`}>
      {(eyebrow || rightLabel) && (
        <div className="flex items-center justify-between border-b border-[#232325] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-[#A1A1AA]">{eyebrow}</span>
          {rightLabel && <span className="text-[#CCFF00] tabular-nums">{rightLabel}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
