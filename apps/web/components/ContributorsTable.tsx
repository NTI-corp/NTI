"use client";

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
    <div className="panel-surface rounded-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1B2028] px-4 py-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#EDF1F7]">
            Top Post-Cap KOL Contributors · {narrativeLabel}
          </h3>
          <p className="font-mono text-[11px] text-[#8A96A8]">
            Iterative truncation cap limits any single account to ≤10.00% (or min(1, 1.5/N) when N ≤ 10)
          </p>
        </div>
        <span className="rounded border border-[#2A3342] bg-[#131820] px-2 py-0.5 font-mono text-[10px] text-[#8A96A8]">
          {contributors.length} ACCOUNTS
        </span>
      </div>

      {contributors.length === 0 ? (
        <div className="px-4 py-8 text-center font-mono text-xs text-[#556173]">
          No contributor breakdown recorded yet for the latest finalized epoch.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1B2028] bg-[#0B0E13] font-mono text-[10px] uppercase tracking-wider text-[#556173]">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Account Handle</th>
                <th className="px-4 py-2.5 text-right">Followers</th>
                <th className="px-4 py-2.5 text-right">Post-Cap Share</th>
                <th className="px-4 py-2.5">Distribution</th>
                <th className="px-4 py-2.5 text-right">Cap Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B2028] font-mono tabular-nums">
              {contributors.map((c, idx) => {
                const barPct = Math.min(100, (c.shareBps / 1000) * 100);
                return (
                  <tr
                    key={c.userId}
                    className="transition-colors hover:bg-[#131820]/70"
                  >
                    <td className="px-4 py-2.5 text-[#556173]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-2.5 text-[#EDF1F7]">@{c.handle}</td>
                    <td className="px-4 py-2.5 text-right text-[#8A96A8]">
                      {formatCompactNumber(c.followers)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#EDF1F7]">
                      {formatBpsPercent(c.shareBps, 2)}
                    </td>
                    <td className="w-44 px-4 py-2.5">
                      <div className="h-1.5 w-full overflow-hidden bg-[#1B202C]">
                        <div
                          className={`h-full ${
                            c.capped ? "bg-[#F59E0B]" : "bg-[#B8FF2E]"
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {c.capped ? (
                        <span className="inline-flex items-center rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]">
                          CAPPED 10%
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#556173]">UNCAPPED</span>
                      )}
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
