"use client";

import React from "react";
import { formatBpsPercent, formatCompactNumber } from "@/lib/format";
import type { ContributorRow } from "@/lib/types";

interface ContributorsTableProps {
  contributors: ContributorRow[];
  narrativeLabel: string;
  accent?: string;
}

/** X profile picture with a colored initial as fallback (also used while the image loads or fails). */
function Avatar({ handle, url, color }: { handle: string; url?: string; color: string }) {
  const [failed, setFailed] = React.useState(false);
  const initial = handle.charAt(0).toUpperCase();
  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#2A2A2D] font-display text-sm font-extrabold text-black"
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
                <th className="px-4 py-2.5">Creator</th>
                <th className="px-4 py-2.5 text-right">Followers</th>
                <th className="px-4 py-2.5">Share</th>
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
                        className="group flex items-center gap-3"
                      >
                        <Avatar handle={cleanHandle} url={c.avatarUrl} color={accent} />
                        <span className="min-w-0">
                          <span className="block truncate font-sans text-[13px] font-semibold text-[#F4F4F5] transition-colors group-hover:text-[#CCFF00]">
                            {c.displayName || cleanHandle}
                          </span>
                          <span className="block truncate text-[11px] text-[#71717A]">
                            @{cleanHandle} ↗
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatCompactNumber(c.followers)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#1A1A1C]">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${(c.shareBps / maxShare) * 100}%`, background: accent }}
                          />
                        </span>
                        <span className="w-14 text-right font-semibold text-[#F4F4F5]">
                          {formatBpsPercent(c.shareBps, 2)}
                        </span>
                      </div>
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
