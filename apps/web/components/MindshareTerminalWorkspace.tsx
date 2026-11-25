"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import type {
  EpochSummary,
  IndexesSnapshot,
  NarrativeIndexItem,
  RadarResponse,
} from "@/lib/types";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { IndexChart, type IndexChartSeries } from "./IndexChart";
import { SectorIcon } from "./landing/NtiLogos";
import { EpochBadge } from "./EpochBadge";
import { Sparkline } from "./ui/Sparkline";
import { sectorColor } from "@/lib/sectors";
import { CopyContractPill } from "./TacticalFrame";
import { SegmentedTabs } from "./ui/SegmentedTabs";

type CategoryFilter = "all" | "defi" | "infra" | "ai" | "consumer";
type SortColumn = "iBps" | "vBps" | "mBps" | "sN" | "weightedPosts";

const CATEGORY_GROUPS: Record<CategoryFilter, readonly string[] | null> = {
  all: null,
  defi: ["defi", "perp_dex", "stablecoins", "prediction_markets"],
  infra: ["privacy", "rwa", "depin"],
  ai: ["ai_agents", "depin"],
  consumer: ["memecoin", "gaming", "prediction_markets"],
};

export function MindshareTerminalWorkspace({
  narratives,
  recentSeries,
  combinedSeries,
  activeEpoch,
  oracleAddress,
  pendingFinalization,
}: {
  narratives: NarrativeIndexItem[];
  recentSeries: IndexesSnapshot["recentSeries"];
  combinedSeries: IndexChartSeries[];
  radar?: RadarResponse;
  activeEpoch: EpochSummary | null;
  oracleAddress: string | null;
  pendingFinalization: boolean;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [windowChip, setWindowChip] = useState<"4H" | "24H" | "7D" | "ALL">("4H");
  const [sortCol, setSortCol] = useState<SortColumn>("iBps");
  const [sortAsc, setSortAsc] = useState(false);
  const [hoveredSectorId, setHoveredSectorId] = useState<number | null>(null);

  const totalBps = useMemo(
    () => narratives.reduce((sum, n) => sum + n.iBps, 0) || 10_000,
    [narratives],
  );

  const windowDeltaById = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const n of narratives) {
      if (windowChip === "4H") {
        if (n.vBps === null) {
          // Official 24h velocity needs 6 clean epochs of one series. Until then show the change since the
          // first epoch of the current series (at most 6 epochs back), marked provisional with a "~".
          const pts = (recentSeries?.[n.narrativeId] ?? []).filter((p) => !p.incomplete);
          const latest = pts[pts.length - 1];
          const base = latest
            ? pts.find((p) => p.seriesId === latest.seriesId && p.epochId >= latest.epochId - 5)
            : undefined;
          if (latest && base && base.epochId !== latest.epochId) {
            map.set(n.narrativeId, latest.iBps - base.iBps);
            continue;
          }
        }
        map.set(n.narrativeId, n.vBps);
        continue;
      }
      const pts = recentSeries?.[n.narrativeId] ?? [];
      if (pts.length < 2) {
        map.set(n.narrativeId, n.vBps);
        continue;
      }
      const latestPt = pts[pts.length - 1]!;
      const lookbackCount = windowChip === "24H" ? 6 : windowChip === "7D" ? 42 : pts.length - 1;
      const baseIdx = Math.max(0, pts.length - 1 - lookbackCount);
      const basePt = pts[baseIdx]!;
      map.set(n.narrativeId, latestPt.iBps - basePt.iBps);
    }
    return map;
  }, [narratives, recentSeries, windowChip]);

  const windowedChartSeries = useMemo(() => {
    if (windowChip === "ALL") return combinedSeries;
    const limit = windowChip === "4H" ? 12 : windowChip === "24H" ? 24 : 42;
    return combinedSeries.map((s) => ({
      ...s,
      points: s.points.slice(-limit),
    }));
  }, [combinedSeries, windowChip]);

  const filtered = useMemo(() => {
    const slugs = CATEGORY_GROUPS[category];
    const base = slugs
      ? narratives.filter((n) => slugs.includes(n.slug))
      : narratives;

    return [...base].sort((a, b) => {
      const dA = windowDeltaById.get(a.narrativeId) ?? -999999;
      const dB = windowDeltaById.get(b.narrativeId) ?? -999999;
      const valA =
        sortCol === "vBps"
          ? dA
          : sortCol === "mBps"
            ? a.mBps
            : sortCol === "sN"
              ? a.sN
              : sortCol === "weightedPosts"
                ? a.weightedPosts
                : a.iBps;
      const valB =
        sortCol === "vBps"
          ? dB
          : sortCol === "mBps"
            ? b.mBps
            : sortCol === "sN"
              ? b.sN
              : sortCol === "weightedPosts"
                ? b.weightedPosts
                : b.iBps;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [narratives, category, sortCol, sortAsc, windowDeltaById]);

  const sortedByShare = useMemo(
    () => [...filtered].sort((a, b) => b.iBps - a.iBps),
    [filtered],
  );
  const leader = [...narratives].sort((a, b) => b.iBps - a.iBps)[0];
  const allSortedByShare = useMemo(
    () => [...narratives].sort((a, b) => b.iBps - a.iBps),
    [narratives],
  );
  const hoveredSector = useMemo(
    () => (hoveredSectorId !== null ? narratives.find((n) => n.narrativeId === hoveredSectorId) ?? null : null),
    [narratives, hoveredSectorId],
  );
  const fastest = [...narratives]
    .filter((n) => n.vBps !== null)
    .sort((a, b) => (b.vBps ?? -999999) - (a.vBps ?? -999999))[0];

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortCol !== col) return null;
    return sortAsc ? (
      <ArrowUp className="ml-0.5 inline h-3 w-3 text-[#CCFF00]" />
    ) : (
      <ArrowDown className="ml-0.5 inline h-3 w-3 text-[#CCFF00]" />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* BELL-style Page Header + Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#26262A] pb-4">
        <div>
          <p className="kicker">Analytics · 4h mindshare index</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1>Narrative Mindshare</h1>
            {activeEpoch && <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} />}
            {pendingFinalization && (
              <span className="border border-[#E2A856]/50 bg-[#E2A856]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#E2A856]">
                NEXT EPOCH AWAITING FINALIZATION
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            value={windowChip}
            onChange={setWindowChip}
            options={[
              { value: "4H", label: "4H" },
              { value: "24H", label: "24H" },
              { value: "7D", label: "7D" },
              { value: "ALL", label: "ALL" },
            ]}
          />
          <SegmentedTabs
            value={category}
            onChange={setCategory}
            options={[
              { value: "all", label: "All", tone: "lime" },
              { value: "defi", label: "DeFi", tone: "lime" },
              { value: "ai", label: "AI", tone: "lime" },
              { value: "infra", label: "Infra", tone: "lime" },
              { value: "consumer", label: "Consumer", tone: "lime" },
            ]}
          />
          {oracleAddress && <CopyContractPill label="Oracle" address={oracleAddress} />}
        </div>
      </div>

      {/* 4-Column Sharp Institutional KPI Board */}
      <div className="stat-strip stat-strip-compact">
        <div>
          <div className="stat-label">Leader sector</div>
          <div className="stat-value truncate">{leader?.label ?? "—"}</div>
          <div className="stat-caption">
            {leader ? `${formatBpsPercent(leader.iBps)} of total mindshare` : "—"}
          </div>
        </div>
        <div>
          <div className="stat-label">Total weight</div>
          <div className="stat-value tabular-nums">
            {narratives.length ? totalBps.toLocaleString("en-US") : "\u2014"}
            <span className="ml-1.5 font-mono text-xs font-normal text-[#71717A]">BPS</span>
          </div>
          <div className="stat-caption">Hamilton-rounded, sums to 10,000</div>
        </div>
        <div>
          <div className="stat-label">Fastest mover</div>
          <div className="stat-value truncate">{fastest ? fastest.label : "Warming up"}</div>
          <div className="stat-caption">
            {fastest ? `${formatSignedBps(fastest.vBps, fastest.vFlag)} over 24h` : "Needs 6 epochs of history"}
          </div>
        </div>
        <div>
          <div className="stat-label">Dataset root</div>
          <div className="stat-value truncate font-mono text-[15px] leading-[1.6rem]">
            {activeEpoch?.datasetHash ? truncateHex(activeEpoch.datasetHash, 8, 6) : "Pending"}
          </div>
          <div className="stat-caption">{activeEpoch?.datasetHash ? "Finalized on-chain" : "No finalized root available"}</div>
        </div>
      </div>

      {/* 100% Proportional Mindshare Allocation Bar */}
      <section aria-label="Mindshare allocation distribution" className="border border-[#26262A] bg-[#161618] p-3.5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
          <span className="uppercase tracking-[0.12em] text-[#A1A1AA]">
            Mindshare Allocation{narratives.length > 0 && ` · ${formatBpsPercent(totalBps)}`}
          </span>
          {hoveredSector ? (
            <span className="flex flex-wrap items-center gap-3 tabular-nums">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#F5F5F7]">
                <span
                  className="inline-block h-2 w-2"
                  style={{ backgroundColor: sectorColor(hoveredSector.narrativeId) }}
                />
                {hoveredSector.label}
              </span>
              <span className="text-[#F5F5F7]">{formatBpsPercent(hoveredSector.iBps)}</span>
              <span className="text-[#71717A]">{hoveredSector.iBps.toLocaleString("en-US")} bps</span>
              <span
                className={
                  (windowDeltaById.get(hoveredSector.narrativeId) ?? 0) >= 0
                    ? "text-[#4ADE80]"
                    : "text-[#EF4444]"
                }
              >
                {windowDeltaById.get(hoveredSector.narrativeId) !== null
                  ? formatSignedBps(
                      windowDeltaById.get(hoveredSector.narrativeId) ?? null,
                      windowChip === "4H" && hoveredSector.vBps !== null ? hoveredSector.vFlag : null,
                    )
                  : "—"}
              </span>
            </span>
          ) : (
            <span className="uppercase tracking-[0.08em] text-[#71717A]">
              Hover segment for telemetry · Click to open sector
            </span>
          )}
        </div>

        <div className="flex h-3.5 w-full overflow-hidden border border-[#26262A] bg-[#0D0D0E]">
          {allSortedByShare.map((n) => {
            const pct = (n.iBps / totalBps) * 100;
            if (pct <= 0) return null;
            const isDimmed = hoveredSectorId !== null && hoveredSectorId !== n.narrativeId;
            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                onMouseEnter={() => setHoveredSectorId(n.narrativeId)}
                onMouseLeave={() => setHoveredSectorId(null)}
                title={`${n.label}: ${formatBpsPercent(n.iBps)} (${n.iBps} bps)`}
                className="block h-full border-r border-[#0D0D0E] transition-opacity last:border-r-0"
                style={{
                  width: `${pct}%`,
                  backgroundColor: sectorColor(n.narrativeId),
                  opacity: isDimmed ? 0.3 : 1,
                }}
                aria-label={`${n.label} ${formatBpsPercent(n.iBps)}`}
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] tabular-nums">
          {allSortedByShare.map((n) => {
            const isActive = hoveredSectorId === n.narrativeId;
            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                onMouseEnter={() => setHoveredSectorId(n.narrativeId)}
                onMouseLeave={() => setHoveredSectorId(null)}
                className={`inline-flex items-center gap-1.5 transition-colors ${
                  isActive ? "text-[#F5F5F7]" : "text-[#8A8A93] hover:text-[#F5F5F7]"
                }`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0"
                  style={{ backgroundColor: sectorColor(n.narrativeId) }}
                />
                <span>{n.label}</span>
                <span className="text-[#F5F5F7]">{(n.iBps / 100).toFixed(1)}%</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bloomberg / US Stock 5-Up Sector Quote Board (shared 1px hairline borders, 0px radius) */}
      <section aria-label="Sector mindshare board">
        <div className="grid grid-cols-2 border-l border-t border-[#26262A] bg-[#0D0D0E] sm:grid-cols-5">
          {sortedByShare.map((n) => {
            const delta = windowDeltaById.get(n.narrativeId) ?? null;
            const rising = (delta ?? 0) >= 0;
            const sharePct = (n.iBps / (sortedByShare[0]?.iBps || 1)) * 100;
            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                className="group relative flex min-h-[88px] flex-col justify-between border-b border-r border-[#26262A] bg-[#161618] p-3.5 transition-colors hover:bg-[#1E1E21]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-[#F5F5F7] group-hover:text-[#CCFF00]">
                    {n.label}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[10px] tabular-nums ${
                      delta === null ? "text-[#71717A]" : rising ? "text-[#4ADE80]" : "text-[#EF4444]"
                    }`}
                  >
                    {delta !== null
                      ? `${windowChip === "4H" && n.vBps === null ? "~" : ""}${formatSignedBps(delta, windowChip === "4H" && n.vBps !== null ? n.vFlag : null)}`
                      : "—"}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="font-mono text-[19px] font-medium leading-none tabular-nums text-[#F5F5F7]">
                    {(n.iBps / 100).toFixed(2)}
                    <span className="ml-0.5 text-[11px] text-[#71717A]">%</span>
                  </div>
                  <div className="mt-2.5 h-[2px] w-full bg-[#1F1F23]">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, sharePct)}%`,
                        backgroundColor: delta !== null && !rising ? "#EF4444" : "#CCFF00",
                      }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Full-Width Trajectory Chart Board */}
      <div className="h-[400px] xl:h-[430px]">
        <IndexChart
          fill
          series={windowedChartSeries}
          title={`Top 5 sectors · ${windowChip === "ALL" ? "all epochs" : windowChip}`}
          subtitle="Share of mindshare per 4h epoch · Velocity histogram tracks primary selected sector"
          showVelocityBars
        />
      </div>

      {/* Full-Width Institutional Narratives Table */}
      <section className="border border-[#26262A] bg-[#161618]">
        <div className="flex items-center justify-between border-b border-[#26262A] bg-[#0D0D0E] px-4 py-2.5">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#F5F5F7]">
            Narratives ({filtered.length})
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#71717A]">
            Click column header to sort
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#26262A] bg-[#111113] font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A]">
              <tr>
                <th className="w-10 py-2.5 pl-4 font-medium">#</th>
                <th className="py-2.5 font-medium">Narrative</th>
                <th className="py-2.5 text-right font-medium">
                  <button type="button" onClick={() => handleSort("iBps")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                    Mindshare{renderSortIcon("iBps")}
                  </button>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <button type="button" onClick={() => handleSort("vBps")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                    {windowChip === "ALL" ? "Series" : windowChip} Chg{renderSortIcon("vBps")}
                  </button>
                </th>
                <th className="hidden py-2.5 text-right font-medium sm:table-cell">
                  <button type="button" onClick={() => handleSort("mBps")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                    Raw M_n{renderSortIcon("mBps")}
                  </button>
                </th>
                <th className="hidden py-2.5 text-right font-medium md:table-cell">
                  <button type="button" onClick={() => handleSort("sN")} className="cursor-pointer uppercase hover:text-[#F5F5F7]">
                    Decay{renderSortIcon("sN")}
                  </button>
                </th>
                <th className="hidden py-2.5 text-right font-medium lg:table-cell">7D Trend</th>
                <th className="w-20 py-2.5 pr-4 text-right font-medium">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F23]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-mono text-xs text-[#71717A]">
                    No narratives match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((n, idx) => {
                  const delta = windowDeltaById.get(n.narrativeId) ?? null;
                  const isPos = (delta ?? 0) >= 0;
                  return (
                    <tr key={n.narrativeId} className="group">
                      <td className="py-3 pl-4 font-mono text-[11px] tabular-nums text-[#71717A]">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="py-3">
                        <Link href={`/narratives/${n.narrativeId}`} className="flex items-center gap-2.5">
                          <span className="text-[#71717A] group-hover:text-[#CCFF00]">
                            <SectorIcon slug={n.slug} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-[#F5F5F7] group-hover:text-[#CCFF00]">
                              {n.label}
                            </span>
                            <span className="hidden max-w-[280px] truncate text-[11px] text-[#71717A] xl:block">
                              {n.description}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-[#F5F5F7]">
                        <div>{formatBpsPercent(n.iBps)}</div>
                        <div className="ml-auto mt-1 h-[2px] w-20 bg-[#1F1F23]">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, (n.iBps / (sortedByShare[0]?.iBps || 1)) * 100)}%`,
                              backgroundColor: sectorColor(n.narrativeId),
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums">
                        {delta !== null ? (
                          <span className={isPos ? "text-[#4ADE80]" : "text-[#EF4444]"}>
                            {windowChip === "4H" && n.vBps === null ? "~" : ""}
                            {formatSignedBps(delta, windowChip === "4H" && n.vBps !== null ? n.vFlag : null)}
                          </span>
                        ) : (
                          <span className="text-[#71717A]">—</span>
                        )}
                      </td>
                      <td className="hidden py-3 text-right font-mono tabular-nums text-[#A1A1AA] sm:table-cell">
                        {formatBpsPercent(n.mBps)}
                      </td>
                      <td className="hidden py-3 text-right font-mono tabular-nums text-[#A1A1AA] md:table-cell">
                        {n.sN.toFixed(1)}
                      </td>
                      <td className="hidden py-3 text-right lg:table-cell">
                        <Sparkline
                          values={(recentSeries?.[n.narrativeId] ?? []).slice(-24).map((p) => p.iBps)}
                          color={isPos ? "#4ADE80" : "#EF4444"}
                          width={84}
                          height={22}
                          className="ml-auto"
                        />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Link
                          href={`/narratives/${n.narrativeId}`}
                          className="inline-flex items-center gap-1 border border-[#26262A] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA] transition-colors hover:border-[#CCFF00] hover:text-[#F5F5F7]"
                        >
                          <span>OPEN</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
