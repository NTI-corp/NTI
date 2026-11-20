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
      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
    >
      {label && <span className="text-[11px] font-medium text-slate-400">{label}</span>}
      <span className="tabular-nums text-slate-900">{truncateHex(address, 6, 4)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-400" />
      )}
    </button>
  );
}
