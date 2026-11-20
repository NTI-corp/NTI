"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";

type SortKey = "share" | "velocity" | "posts";

export function SectorBoard({ narratives }: { narratives: NarrativeIndexItem[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("share");

  const rows = useMemo(() => {
    const list = [...narratives];
    if (sortBy === "velocity") {
      return list.sort((a, b) => (b.vBps ?? -999999) - (a.vBps ?? -999999));
    }
    if (sortBy === "posts") {
      return list.sort((a, b) => b.weightedPosts - a.weightedPosts);
    }
    return list.sort((a, b) => b.iBps - a.iBps);
  }, [narratives, sortBy]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      {/* Compact Sort Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
        <div className="text-xs font-semibold text-slate-600">
          10 Tracked Crypto Sectors · Sum = 10,000 bps
        </div>
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs"
          role="group"
          aria-label="Sort sectors"
        >
          {(
            [
              { id: "share", label: "Mindshare %" },
              { id: "velocity", label: "Velocity" },
              { id: "posts", label: "Decay Load" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSortBy(tab.id)}
              className={`cursor-pointer rounded-md px-3 py-1 font-medium transition-colors ${
                sortBy === tab.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Crisp Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr
              className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wider text-slate-400"
              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
            >
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Narrative</th>
              <th className="px-5 py-3 text-right">Share (I_n)</th>
              <th className="hidden px-5 py-3 md:table-cell">Distribution</th>
              <th className="px-5 py-3 text-right">4h Velocity</th>
              <th className="hidden px-5 py-3 text-right sm:table-cell">Decay S_n</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((n, idx) => {
              const barWidth = Math.min(100, Math.max(4, (n.iBps / 2200) * 100));
              const isPos = (n.vBps ?? 0) >= 0;
              return (
                <tr
                  key={n.narrativeId}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td
                    className="px-5 py-3.5 text-xs tabular-nums text-slate-400"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    #{String(idx + 1).padStart(2, "0")}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900">{n.label}</div>
                    <div className="hidden text-xs text-slate-500 sm:block">
                      {n.description}
                    </div>
                  </td>
                  <td
                    className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    {formatBpsPercent(n.iBps)}
                  </td>
                  <td className="hidden w-44 px-5 py-3.5 md:table-cell">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </td>
                  <td
                    className="px-5 py-3.5 text-right text-xs font-medium tabular-nums"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    {n.vBps !== null ? (
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 ${
                          isPos
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {formatSignedBps(n.vBps)}
                      </span>
                    ) : (
                      <span className="text-slate-400">Warming</span>
                    )}
                  </td>
                  <td
                    className="hidden px-5 py-3.5 text-right text-xs tabular-nums text-slate-500 sm:table-cell"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    {n.sN.toFixed(1)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/narratives/${n.narrativeId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-600 hover:text-blue-600"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
