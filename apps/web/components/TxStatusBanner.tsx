"use client";

import { CheckCircle2, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import type { TxActionState } from "@/lib/useChainAction";

export function TxStatusBanner({
  state,
  explorerBase,
  onDismiss,
}: {
  state: TxActionState;
  explorerBase: string;
  onDismiss?: () => void;
}) {
  if (state.status === "idle") return null;

  const isError = state.status === "error";
  const isConfirmed = state.status === "confirmed";
  const isWorking =
    state.status === "switching" || state.status === "wallet" || state.status === "pending";

  const tone = isError
    ? "border-[#EF4444]/45 bg-[#EF4444]/10 text-[#EF4444]"
    : isConfirmed
      ? "border-[#4ADE80]/45 bg-[#4ADE80]/10 text-[#4ADE80]"
      : "border-[#CCFF00]/45 bg-[#CCFF00]/10 text-[#CCFF00]";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-2 border px-3.5 py-2.5 text-xs ${tone}`}
    >
      <div className="flex items-center gap-2">
        {isWorking && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#4ADE80]" />}
        {isError && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#EF4444]" />}
        <span>{isError ? state.error : state.label}</span>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10.5px]">
        {state.hash && (
          <a
            href={`${explorerBase}/tx/${state.hash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 underline hover:opacity-80"
          >
            <span>Explorer</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {onDismiss && !isWorking && (
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer uppercase tracking-[0.08em] opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
