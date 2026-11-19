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
      className="group inline-flex min-h-[34px] cursor-pointer items-center gap-2 border border-[#1B202C] bg-[#0B0D12]/90 px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-[#B8FF2E]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B8FF2E]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
      <span className="border border-[#1B202C] bg-[#11141C] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#8B94A7]">
        {label}
      </span>
      <span className="text-[#F3F5F8] tabular-nums sm:hidden">{truncateHex(address, 8, 6)}</span>
      <span className="hidden text-[#F3F5F8] tabular-nums sm:inline">{address}</span>
      <span className="border-l border-[#1B202C] pl-2 text-[10px] uppercase tracking-wider text-[#B8FF2E] group-hover:text-[#F3F5F8]">
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
    <div className={`reticle-frame ${className}`}>
      {(eyebrow || rightLabel) && (
        <div className="flex items-center justify-between border-b border-[#1B202C] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em]">
          <span className="text-[#8B94A7]">{eyebrow}</span>
          {rightLabel && <span className="text-[#23F7DD] tabular-nums">{rightLabel}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
