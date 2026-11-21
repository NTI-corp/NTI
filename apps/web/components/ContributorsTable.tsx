import React from "react";
import { formatBpsPercent, formatCompactNumber } from "@/lib/format";
import type { ContributorRow } from "@/lib/types";

interface ContributorsTableProps {
  contributors: ContributorRow[];
  narrativeLabel: string;
}

export function ContributorsTable({
  contributors,
  narrativeLabel,
}: ContributorsTableProps) {
  return (
    <div className="rounded-lg border border-[#232325] bg-[#0E0E0F]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232325] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#F4F4F5]">
            Top KOL Contributors · {narrativeLabel}
          </h3>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Effective KOL cap = 10% (if N_active ≥ 11) or min(1, 1.5 / N_active) for smaller narratives
          </p>
        </div>
        <span className="rounded border border-[#232325] bg-[#131314] px-2 py-0.5 font-mono text-[10px] text-[#A1A1AA]">
          {contributors.length} ACTIVE KOLS
        </span>
      </div>

      {contributors.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-[#71717A]">
          No contributor attributions indexed for this narrative yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232325] bg-[#131314] font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                <th className="px-4 py-2.5">Rank</th>
                <th className="px-4 py-2.5">Handle</th>
                <th className="px-4 py-2.5 text-right">Followers</th>
                <th className="px-4 py-2.5 text-right">Share</th>
                <th className="px-4 py-2.5 text-right">Cap Guard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232325] font-mono tabular-nums">
              {contributors.map((c, idx) => {
                const cleanHandle = c.handle.replace(/^@/, "");
                return (
                  <tr
                    key={`${c.userId}-${idx}`}
                    className="transition-colors hover:bg-[#131314]/60"
                  >
                    <td className="px-4 py-2.5 text-[#71717A]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`https://x.com/${cleanHandle}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[#F4F4F5] transition-colors hover:text-[#CCFF00]"
                      >
                        @{cleanHandle} ↗
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatCompactNumber(c.followers)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#F4F4F5]">
                      {formatBpsPercent(c.shareBps, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[10px] font-medium ${c.capped ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>
                        {c.capped ? "CAPPED" : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
