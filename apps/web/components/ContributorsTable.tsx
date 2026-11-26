"use client";

import React from "react";
import { formatBpsPercent, formatCompactNumber } from "@/lib/format";
import { XIcon } from "@/components/ui/Icons";
import type { ContributorRow } from "@/lib/types";

interface ContributorsTableProps {
  contributors: ContributorRow[];
  narrativeLabel: string;
  accent?: string;
}

function Avatar({ handle, url, color }: { handle: string; url?: string; color: string }) {
  const [failed, setFailed] = React.useState(false);
  const initial = handle.charAt(0).toUpperCase();
  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-[#26262A] font-mono text-xs font-bold text-[#0D0D0E]"
      style={{ background: color }}
    >
      {initial}
      {url && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url.replace("_normal.", "_bigger.")}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

export function ContributorsTable({
  contributors,
  narrativeLabel,
  accent = "#CCFF00",
}: ContributorsTableProps) {
  const maxShare = Math.max(1, ...contributors.map((c) => c.shareBps));
  return (
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
        <div>
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
            Top KOL Contributors · {narrativeLabel}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#71717A]">
            Effective KOL cap = 10% (if N_active ≥ 11) or min(1, 1.5 / N_active)
          </p>
        </div>
        <span className="border border-[#1F1F23] bg-[#0D0D0E] px-2 py-0.5 font-mono text-[10px] text-[#71717A]">
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
              <tr className="border-b border-[#1F1F23] bg-[#0D0D0E] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#71717A]">
                <th className="px-4 py-2 font-medium">Rank</th>
                <th className="px-4 py-2 font-medium">Creator</th>
                <th className="px-4 py-2 text-right font-medium">Followers</th>
                <th className="px-4 py-2 font-medium">Share</th>
                <th className="px-4 py-2 text-right font-medium">Cap Guard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F23] font-mono tabular-nums">
              {contributors.map((c, idx) => {
                const cleanHandle = c.handle.replace(/^@/, "");
                return (
                  <tr
                    key={`${c.userId}-${idx}`}
                    className="transition-colors hover:bg-[#1E1E21]"
                  >
                    <td className="px-4 py-2.5 text-[#52525B]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`https://x.com/${cleanHandle}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group flex items-center gap-3"
                      >
                        <Avatar handle={cleanHandle} url={c.avatarUrl} color={accent} />
                        <span className="min-w-0">
                          <span className="block truncate font-sans text-xs font-medium text-[#F5F5F7] transition-colors group-hover:text-[#CCFF00]">
                            {c.displayName || cleanHandle}
                          </span>
                          <span className="inline-flex items-center gap-1 truncate text-[10.5px] text-[#71717A]">
                            <XIcon className="h-2.5 w-2.5 shrink-0 opacity-75" />
                            <span className="truncate">@{cleanHandle} ↗</span>
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatCompactNumber(c.followers)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-24 bg-[#0D0D0E]">
                          <span
                            className="block h-full"
                            style={{ width: `${(c.shareBps / maxShare) * 100}%`, background: accent }}
                          />
                        </span>
                        <span className="w-14 text-right font-medium text-[#F5F5F7]">
                          {formatBpsPercent(c.shareBps, 2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[10px] font-medium ${c.capped ? "text-[#F59E0B]" : "text-[#4ADE80]"}`}>
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
