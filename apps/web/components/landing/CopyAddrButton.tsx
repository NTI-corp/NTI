"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateHex } from "@/lib/format";

export function CopyAddrButton({
  address,
  label,
}: {
  address: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#22262F] bg-[#0D0F13] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors hover:border-[#3A404D] hover:text-white"
      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
    >
      {label && <span className="text-[11px] text-[#6B7280]">{label}</span>}
      <span className="tabular-nums text-[#F5F6F8]">{truncateHex(address, 6, 4)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[#34D399]" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-[#6B7280]" />
      )}
    </button>
  );
}
