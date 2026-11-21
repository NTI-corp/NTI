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
      className="group inline-flex min-h-[30px] cursor-pointer items-center gap-2 border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 font-mono text-[10.5px] transition-colors hover:border-[#3A3A40] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#CCFF00]"
    >
      <span className="border border-[#1F1F23] bg-[#161618] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[#71717A]">
        {label}
      </span>
      <span className="text-[#F5F5F7] tabular-nums sm:hidden">{truncateHex(address, 8, 6)}</span>
      <span className="hidden text-[#F5F5F7] tabular-nums sm:inline">{address}</span>
      <span className="border-l border-[#1F1F23] pl-2 text-[9.5px] uppercase tracking-[0.1em] text-[#CCFF00] group-hover:text-[#F5F5F7]">
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
    <div className={`border border-[#26262A] bg-[#161618] ${className}`}>
      {(eyebrow || rightLabel) && (
        <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span className="text-[#F5F5F7]">{eyebrow}</span>
          {rightLabel && <span className="text-[#CCFF00] tabular-nums">{rightLabel}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
