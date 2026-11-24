"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Search } from "lucide-react";
import { NARRATIVES, NARRATIVE_BY_ID } from "@nti/sdk";
import type { KolLeaderboardResponse } from "@/lib/types";
import { formatCompactNumber } from "@/lib/format";
import { sectorColor } from "@/lib/sectors";

type SortKey = "authority" | "rK" | "followers" | "pollTier";
type StatusFilter = "all" | "human" | "flagged";

export function KolLeaderboardClient({ initial }: { initial: KolLeaderboardResponse }) {
  const [query, setQuery] = useState("");
  const [sectorId, setSectorId] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("authority");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = initial.kols.filter((k) => {
      if (sectorId !== "all" && !k.narrativeIds.includes(sectorId)) return false;
      if (statusFilter === "human" && k.hK === 0) return false;
      if (statusFilter === "flagged" && k.hK !== 0) return false;
      if (q) {
        const hay = `${k.handle} ${k.displayName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const av =
        sortKey === "rK"
          ? a.rK
          : sortKey === "followers"
            ? a.followers
            : sortKey === "pollTier"
              ? -a.pollTier
              : a.authorityScore;
      const bv =
        sortKey === "rK"
          ? b.rK
          : sortKey === "followers"
            ? b.followers
            : sortKey === "pollTier"
              ? -b.pollTier
              : b.authorityScore;
      return sortAsc ? av - bv : bv - av;
    });
  }, [initial.kols, query, sectorId, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortAsc ? (
      <ArrowUp className="ml-0.5 inline h-3 w-3 text-[#CCFF00]" />
    ) : (
      <ArrowDown className="ml-0.5 inline h-3 w-3 text-[#CCFF00]" />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-4">
        <div>
          <p className="kicker">Analytics · Dynamic reputation &amp; bot filter</p>
          <h1 className="mt-1.5">KOL Universe</h1>
          <p className="mt-1 text-xs text-[#8A8A93]">
            Live reputation r_k (0.25–1.50) calibrated from median engagement-to-follower ratio and AI signal-to-noise.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-[#26262A] bg-[#161618] px-2.5 py-1.5 focus-within:border-[#CCFF00]">
          <Search className="h-3.5 w-3.5 text-[#71717A]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter @handle or name"
            className="w-48 bg-transparent font-mono text-xs text-[#F5F5F7] placeholder-[#71717A] outline-none"
          />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="stat-strip stat-strip-compact">
        <div>
          <div className="stat-label">Active KOL Universe</div>
          <div className="stat-value tabular-nums">{initial.totalActive.toLocaleString("en-US")}</div>
          <div className="stat-caption">Paginated live from Supabase</div>
        </div>
        <div>
          <div className="stat-label">Tier 1 Priority</div>
          <div className="stat-value tabular-nums text-[#CCFF00]">{initial.tier1Count}</div>
          <div className="stat-caption">Polled every 4h epoch</div>
        </div>
        <div>
          <div className="stat-label">Avg Reputation r_k</div>
          <div className="stat-value tabular-nums">{initial.avgReputation.toFixed(2)}x</div>
          <div className="stat-caption">Range 0.25x to 1.50x</div>
        </div>
        <div>
          <div className="stat-label">Flagged Bots (h_k = 0)</div>
          <div className="stat-value tabular-nums text-[#EF4444]">{initial.flaggedBots}</div>
          <div className="stat-caption">Zeroed out of index score</div>
        </div>
      </div>

      {/* Sector & Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSectorId("all")}
            className={`cursor-pointer border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              sectorId === "all"
                ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
                : "border-[#26262A] bg-[#161618] text-[#8A8A93] hover:text-[#F5F5F7]"
            }`}
          >
            All Sectors
          </button>
          {NARRATIVES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSectorId(n.id)}
              className={`cursor-pointer border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                sectorId === n.id
                  ? "border-[#CCFF00]/60 bg-[#CCFF00]/12 text-[#F5F5F7]"
                  : "border-[#26262A] bg-[#161618] text-[#8A8A93] hover:text-[#F5F5F7]"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 font-mono text-[10px] uppercase">
          {(["all", "human", "flagged"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`cursor-pointer border px-2.5 py-1 transition-colors ${
                statusFilter === s
                  ? "border-[#F5F5F7] bg-[#1E1E21] text-[#F5F5F7]"
                  : "border-[#26262A] bg-[#161618] text-[#71717A] hover:text-[#F5F5F7]"
              }`}
            >
              {s === "all" ? "All" : s === "human" ? "Human (h=1)" : "Flagged (h=0)"}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      <section className="border border-[#26262A] bg-[#161618]">
        <div className="flex items-center justify-between border-b border-[#26262A] bg-[#0D0D0E] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span className="text-[#F5F5F7]">
            Showing {filtered.length} of top {initial.kols.length} KOLs ({initial.totalActive} total active)
          </span>
          <span className="text-[#71717A]">A_k = min(ln(1 + F_k) × r_k × h_k, A_max)</span>
        </div>

        {initial.dataSource === "unavailable" ? (
          <div className="p-8 text-center font-mono text-xs text-[#71717A]">
            KOL universe is temporarily unavailable from Supabase.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-[#71717A]">
            No KOLs match your current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#26262A] bg-[#111113] font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A]">
                <tr>
                  <th className="w-12 py-2.5 pl-4 font-medium">#</th>
                  <th className="py-2.5 font-medium">KOL</th>
                  <th className="hidden py-2.5 font-medium md:table-cell">Sectors</th>
                  <th className="py-2.5 text-right font-medium">
                    <button type="button" onClick={() => toggleSort("followers")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                      Followers{sortIcon("followers")}
                    </button>
                  </th>
                  <th className="py-2.5 text-right font-medium">
                    <button type="button" onClick={() => toggleSort("rK")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                      Rep r_k{sortIcon("rK")}
                    </button>
                  </th>
                  <th className="py-2.5 text-right font-medium">
                    <button type="button" onClick={() => toggleSort("authority")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                      Authority{sortIcon("authority")}
                    </button>
                  </th>
                  <th className="hidden py-2.5 text-right font-medium sm:table-cell">
                    <button type="button" onClick={() => toggleSort("pollTier")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                      Tier{sortIcon("pollTier")}
                    </button>
                  </th>
                  <th className="py-2.5 pr-4 text-right font-medium">X</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F1F23] font-mono tabular-nums">
                {filtered.map((k, idx) => (
                  <tr key={k.userId} className="transition-colors hover:bg-[#1E1E21]">
                    <td className="py-2.5 pl-4 text-[11px] text-[#71717A]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        {k.avatarUrl ? (
                          <img
                            src={k.avatarUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 border border-[#26262A] object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#26262A] bg-[#0D0D0E] text-[10px] text-[#71717A]">
                            {k.handle.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-[#F5F5F7]">@{k.handle}</span>
                            {k.hK === 0 && (
                              <span className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-1 py-0.2 text-[9px] text-[#EF4444]">
                                BOT h=0
                              </span>
                            )}
                          </div>
                          {k.displayName && (
                            <div className="truncate font-sans text-[11px] text-[#71717A]">
                              {k.displayName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden py-2.5 md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {k.narrativeIds.slice(0, 2).map((nid) => {
                          const meta = NARRATIVE_BY_ID.get(nid);
                          if (!meta) return null;
                          return (
                            <Link
                              key={nid}
                              href={`/narratives/${nid}`}
                              className="inline-flex items-center gap-1 border border-[#26262A] bg-[#0D0D0E] px-1.5 py-0.5 text-[10px] text-[#A1A1AA] hover:border-[#3A3A40] hover:text-[#F5F5F7]"
                            >
                              <span
                                className="inline-block h-1.5 w-1.5"
                                style={{ backgroundColor: sectorColor(nid) }}
                              />
                              {meta.label}
                            </Link>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-[#F5F5F7]">
                      {formatCompactNumber(k.followers)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={
                          k.rK >= 1.1
                            ? "text-[#4ADE80]"
                            : k.rK < 0.7
                              ? "text-[#EF4444]"
                              : "text-[#F5F5F7]"
                        }
                      >
                        {k.rK.toFixed(2)}x
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-[#CCFF00]">
                      {k.authorityScore.toFixed(2)}
                    </td>
                    <td className="hidden py-2.5 text-right sm:table-cell">
                      <span className="border border-[#26262A] bg-[#0D0D0E] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                        T{k.pollTier}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <a
                        href={`https://x.com/${k.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 border border-[#26262A] px-2 py-1 text-[10px] uppercase text-[#A1A1AA] transition-colors hover:border-[#CCFF00] hover:text-[#F5F5F7]"
                      >
                        <span>X</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
