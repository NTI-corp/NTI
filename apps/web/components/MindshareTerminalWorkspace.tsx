"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Coins,
  Layers,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  EpochSummary,
  IndexesSnapshot,
  NarrativeIndexItem,
  RadarResponse,
} from "@/lib/types";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { IndexChart, type IndexChartSeries } from "./IndexChart";
import { RadarFeed } from "./RadarFeed";
import { SectorIcon } from "./landing/NtiLogos";
import { EpochBadge } from "./EpochBadge";
import { Sparkline } from "./ui/Sparkline";
import { Donut } from "./ui/Donut";
import { sectorColor } from "@/lib/sectors";
import { CopyContractPill } from "./TacticalFrame";

type ViewTab = "arena" | "chart" | "combined";
type SideTab = "radar" | "actions";
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
  radar,
  activeEpoch,
  oracleAddress,
  pendingFinalization,
}: {
  narratives: NarrativeIndexItem[];
  recentSeries: IndexesSnapshot["recentSeries"];
  combinedSeries: IndexChartSeries[];
  radar: RadarResponse;
  activeEpoch: EpochSummary | null;
  oracleAddress: string | null;
  pendingFinalization: boolean;
}) {
  const [viewTab, setViewTab] = useState<ViewTab>("arena");
  const [sideTab, setSideTab] = useState<SideTab>("radar");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [windowChip, setWindowChip] = useState<"4H" | "24H" | "7D" | "ALL">("4H");
  const [sortCol, setSortCol] = useState<SortColumn>("iBps");
  const [sortAsc, setSortAsc] = useState(false);

  const totalBps = useMemo(
    () => narratives.reduce((sum, n) => sum + n.iBps, 0) || 10_000,
    [narratives],
  );

  const windowDeltaById = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const n of narratives) {
      if (windowChip === "4H") {
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
    const limit = windowChip === "4H" ? 6 : windowChip === "24H" ? 12 : 42;
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
      <ArrowUp className="inline h-3 w-3 text-[#CCFF00]" />
    ) : (
      <ArrowDown className="inline h-3 w-3 text-[#CCFF00]" />
    );
  };

  return (
    <div className="space-y-5">
      {/* Blockworks Analytics Mindshare Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="kicker">
              Analytics
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Mindshare
              </h1>
              {activeEpoch && (
                <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} />
              )}
              {pendingFinalization && (
                <span className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[11px] font-medium text-[#F59E0B]">
                  2h Dispute Active
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {oracleAddress && (
              <CopyContractPill label="Oracle" address={oracleAddress} />
            )}
            <Link
              href="/methodology"
              className="inline-flex items-center gap-1 rounded-lg border border-[#232325] bg-[#131314] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:border-[#3A3A46] hover:text-white"
            >
              <span>API &amp; Methodology</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Timeframe + Category Filter Strip (Blockworks style) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#232325] bg-[#0E0E0F] p-0.5">
            {(["4H", "24H", "7D", "ALL"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowChip(w)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  windowChip === w
                    ? "bg-[#25252E] text-white"
                    : "text-[#A1A1AA] hover:text-white"
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[#232325]" />

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Sectors" },
                { id: "defi", label: "DeFi & Perps" },
                { id: "ai", label: "AI & Compute" },
                { id: "infra", label: "Infra & Privacy" },
                { id: "consumer", label: "Consumer & Memes" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`cursor-pointer rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat.id
                    ? "border-[#3D3D4A] bg-[#1D1D1F] text-white"
                    : "border-[#1D1D1F] bg-[#0E0E0F] text-[#A1A1AA] hover:border-[#3A3A3D] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat strip: the four numbers that matter at a glance */}
      <div className="stat-strip">
        <div>
          <div className="stat-label">Leader sector</div>
          <div className="stat-value truncate">{leader?.label ?? "—"}</div>
          <div className="stat-caption">
            {leader ? formatBpsPercent(leader.iBps) : "—"} of total mindshare
          </div>
        </div>
        <div>
          <div className="stat-label">Total weight</div>
          <div className="stat-value tabular-nums">
            {totalBps.toLocaleString("en-US")}
            <span className="ml-1 text-sm font-semibold text-[#22C55E]">bps</span>
          </div>
          <div className="stat-caption">Hamilton-rounded, always sums to 10,000</div>
        </div>
        <div>
          <div className="stat-label">Fastest mover</div>
          <div className="stat-value truncate">{fastest ? fastest.label : "Warming"}</div>
          <div className="stat-caption">
            {fastest ? `${formatSignedBps(fastest.vBps, fastest.vFlag)} over 24h` : "EMA needs 6 epochs of history"}
          </div>
        </div>
        <div>
          <div className="stat-label">Dataset root</div>
          <div className="stat-value font-mono text-lg">
            {activeEpoch?.datasetHash ? truncateHex(activeEpoch.datasetHash, 6, 4) : "Pending"}
          </div>
          <div className="stat-caption">Committed on-chain, recomputable by anyone</div>
        </div>
      </div>

      {/* Mosaic: tile size = share of total mindshare, color = sector, line = recent trend */}
      <div className="rounded-xl border border-[#232325] bg-[#0A0A0B] p-2">
        <div className="flex min-h-[132px] w-full flex-wrap gap-1.5 sm:flex-nowrap">
          {sortedByShare.map((n) => {
            const total = sortedByShare.reduce((sum, x) => sum + x.iBps, 0) || 1;
            const pct = (n.iBps / total) * 100;
            const color = sectorColor(n.narrativeId);
            const trend = (recentSeries?.[n.narrativeId] ?? []).slice(-24).map((p) => p.iBps);
            const rising = (n.vBps ?? 0) >= 0;
            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                style={{
                  flexGrow: Math.max(8, Math.round(pct * 10)),
                  flexBasis: 0,
                  background: `linear-gradient(160deg, ${color}22 0%, #0E0E0F 62%)`,
                  borderColor: `${color}55`,
                }}
                title={`${n.label}: ${formatBpsPercent(n.iBps)}`}
                className="group relative flex min-w-[64px] flex-col justify-between overflow-hidden rounded-lg border p-2.5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={{ background: `${color}26`, color }}
                  >
                    <SectorIcon slug={n.slug} className="h-3 w-3" />
                  </span>
                  <span className="truncate text-[11px] font-semibold text-white">
                    {pct >= 9 ? n.label : n.label.split(" ")[0]}
                  </span>
                </div>
                <div>
                  <div className="font-display text-xl font-extrabold tabular-nums tracking-tight text-white">
                    {(n.iBps / 100).toFixed(pct >= 9 ? 2 : 1)}
                    <span className="text-xs font-semibold text-[#A1A1AA]">%</span>
                  </div>
                  <div className="mt-0.5 flex items-end justify-between gap-1">
                    <span
                      className={`font-mono text-[10px] ${rising ? "text-[#22C55E]" : "text-[#EF4444]"}`}
                    >
                      {n.vBps !== null ? formatSignedBps(n.vBps, n.vFlag) : "warming"}
                    </span>
                    {pct >= 7 && (
                      <Sparkline values={trend} color={color} width={64} height={22} className="opacity-90" />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Trajectory chart + distribution donut */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <IndexChart
            series={windowedChartSeries}
            title={`Top 5 narratives · mindshare trajectory (${windowChip})`}
            subtitle="Toggle sectors below · velocity bars follow the selected primary series"
            showVelocityBars
            height={330}
          />
        </div>
        <div className="rounded-xl border border-[#232325] bg-[#0E0E0F] p-4 xl:col-span-4">
          <div className="kicker">Distribution</div>
          <div className="mt-1 font-display text-lg font-extrabold uppercase tracking-tight text-white">
            Share of attention
          </div>
          <div className="mt-4">
            <Donut
              slices={sortedByShare.map((n) => ({
                id: n.narrativeId,
                label: n.label,
                value: n.iBps,
                color: sectorColor(n.narrativeId),
              }))}
              centerLabel="Total"
              centerValue="100%"
            />
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {sortedByShare.slice(0, 8).map((n) => (
              <li key={n.narrativeId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[#A1A1AA]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: sectorColor(n.narrativeId) }}
                  />
                  <span className="truncate">{n.label}</span>
                </span>
                <span className="font-mono tabular-nums text-white">{(n.iBps / 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main 12-Col Blockworks Grid: 8 Left (Arena + Screener) | 4 Right (Overview + Signals) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 8 Columns */}
        <div className="space-y-4 xl:col-span-8">
          {/* Blockworks-Style Sortable Screener Table */}
          {(
            <div className="overflow-hidden rounded-xl border border-[#232325] bg-[#0E0E0F]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#232325] bg-[#101014] text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
                      <th className="w-10 px-3 py-3 text-center">#</th>
                      <th className="px-3 py-3">Narrative</th>
                      <th
                        className={`px-3 py-3 text-right whitespace-nowrap ${
                          sortCol === "iBps" ? "border-t-2 border-t-[#CCFF00] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("iBps")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          Mindshare {renderSortIcon("iBps")}
                        </button>
                      </th>
                      <th
                        className={`px-3 py-3 text-right whitespace-nowrap ${
                          sortCol === "vBps" ? "border-t-2 border-t-[#CCFF00] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("vBps")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          {windowChip === "ALL" ? "Series" : windowChip} Chg {renderSortIcon("vBps")}
                        </button>
                      </th>
                      <th
                        className={`hidden px-3 py-3 text-right whitespace-nowrap sm:table-cell ${
                          sortCol === "mBps" ? "border-t-2 border-t-[#CCFF00] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("mBps")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          Raw M_n {renderSortIcon("mBps")}
                        </button>
                      </th>
                      <th
                        className={`hidden px-3 py-3 text-right whitespace-nowrap md:table-cell ${
                          sortCol === "sN" ? "border-t-2 border-t-[#CCFF00] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("sN")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          Decay {renderSortIcon("sN")}
                        </button>
                      </th>
                      <th className="hidden px-3 py-3 text-right whitespace-nowrap lg:table-cell">Trend</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Why?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E1E26]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#71717A]">
                          No narrative sectors match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((n, idx) => {
                        const delta = windowDeltaById.get(n.narrativeId) ?? null;
                        const isPos = (delta ?? 0) >= 0;
                        return (
                          <tr
                            key={n.narrativeId}
                            className="transition-colors hover:bg-[#191920]"
                          >
                            <td className="px-3 py-3 text-center font-mono text-[11px] tabular-nums text-[#71717A]">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-3">
                              <Link
                                href={`/narratives/${n.narrativeId}`}
                                className="group flex items-center gap-2.5"
                              >
                                <div
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                                  style={{
                                    borderColor: `${sectorColor(n.narrativeId)}55`,
                                    background: `${sectorColor(n.narrativeId)}1A`,
                                    color: sectorColor(n.narrativeId),
                                  }}
                                >
                                  <SectorIcon slug={n.slug} className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-[#F4F4F5] group-hover:text-[#CCFF00]">
                                    {n.label}
                                  </div>
                                  <div className="hidden max-w-[190px] truncate text-[11px] text-[#71717A] 2xl:block">
                                    {n.description}
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <div className="font-mono text-sm font-semibold tabular-nums text-white">
                                {formatBpsPercent(n.iBps)}
                              </div>
                              <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-[#1A1A1C]">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, (n.iBps / (sortedByShare[0]?.iBps || 1)) * 100)}%`,
                                    background: sectorColor(n.narrativeId),
                                  }}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {delta !== null ? (
                                <span
                                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                    isPos
                                      ? "bg-[#22C55E]/12 text-[#22C55E]"
                                      : "bg-[#EF4444]/12 text-[#EF4444]"
                                  }`}
                                >
                                  {isPos ? "↑" : "↓"} {formatSignedBps(delta, windowChip === "4H" ? n.vFlag : null)}
                                </span>
                              ) : (
                                <span className="text-[11px] text-[#71717A]">Warming</span>
                              )}
                            </td>
                            <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-[#A1A1AA] whitespace-nowrap sm:table-cell">
                              {formatBpsPercent(n.mBps)}
                            </td>
                            <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-[#A1A1AA] whitespace-nowrap md:table-cell">
                              {n.sN.toFixed(1)}
                            </td>
                            <td className="hidden px-3 py-3 text-right lg:table-cell">
                              <Sparkline
                                values={(recentSeries?.[n.narrativeId] ?? []).slice(-24).map((p) => p.iBps)}
                                color={sectorColor(n.narrativeId)}
                                width={92}
                                height={26}
                                className="ml-auto"
                              />
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <Link
                                href={`/narratives/${n.narrativeId}`}
                                className="inline-flex items-center gap-1 rounded-md border border-[#262A32] bg-[#131314] px-2.5 py-1 text-[11px] font-medium text-[#D4D4D8] hover:border-[#CCFF00] hover:text-[#CCFF00]"
                              >
                                <span>Open</span>
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
            </div>
          )}
        </div>

        {/* Right 4 Columns: Overview Card + Tabbed Radar/Actions */}
        <aside className="space-y-4 xl:col-span-4">

          {/* Right Panel Tabs: Radar Signals vs On-Chain Execution */}
          <div className="rounded-xl border border-[#232325] bg-[#0E0E0F] p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-[#232325] bg-[#0D0D10] p-0.5">
                <button
                  type="button"
                  onClick={() => setSideTab("radar")}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    sideTab === "radar"
                      ? "bg-[#24242E] text-white"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Radar Signals
                </button>
                <button
                  type="button"
                  onClick={() => setSideTab("actions")}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    sideTab === "actions"
                      ? "bg-[#24242E] text-white"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  On-Chain Actions
                </button>
              </div>
              <Link
                href="/radar"
                className="text-[11px] font-medium text-[#CCFF00] hover:underline"
              >
                View all
              </Link>
            </div>

            {sideTab === "radar" ? (
              <div className="space-y-4">
                <RadarFeed
                  alerts={radar.alerts}
                  realtimeUnlocked={radar.realtimeUnlocked}
                  maxItems={4}
                  compact
                />

                {!radar.realtimeUnlocked && (
                  <div className="rounded-xl border border-[#2A2F38] bg-gradient-to-b from-[#131314] to-[#101216] p-5 text-center">
                    <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-[#343940] bg-[#090909] text-[#CCFF00]">
                      <Radar className="h-4 w-4" />
                    </div>
                    <h3 className="mt-3 font-display text-sm font-bold text-white">
                      Unlock Real-Time Mindshare Radar
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#A1A1AA]">
                      Public feeds carry a 60-minute delay. Stake 100k $NTI to see velocity breakouts
                      instantly.
                    </p>
                    <Link
                      href="/stake"
                      className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#CCFF00] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#B8E600]"
                    >
                      Stake $NTI to Unlock
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  {
                    href: "/markets",
                    title: "Narrative Pair Markets",
                    sub: "24h & 7d parimutuel pools · 0.1% fee",
                    icon: Activity,
                  },
                  {
                    href: "/baskets",
                    title: "TWAP Narrative Baskets",
                    sub: "Uniswap V3 vaults · 30m TWAP NAV",
                    icon: Layers,
                  },
                  {
                    href: "/stake",
                    title: "Stake $NTI · 30% ETH Fees",
                    sub: "Up to 50% discount + instant Radar",
                    icon: Coins,
                  },
                  {
                    href: "/grants",
                    title: "Quadratic Ecosystem Grants",
                    sub: "Vote on mindshare-weighted funding",
                    icon: Sparkles,
                  },
                  {
                    href: "/oracle",
                    title: "Oracle Consensus & Disputes",
                    sub: "EIP-712 attestations & 2h challenges",
                    icon: ShieldCheck,
                  },
                ].map((act) => {
                  const Icon = act.icon;
                  return (
                    <Link
                      key={act.href}
                      href={act.href}
                      className="flex items-center justify-between rounded-lg border border-[#232325] bg-[#0E1014] px-3.5 py-3 transition-colors hover:border-[#CCFF00]/60 hover:bg-[#131314]"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-[#CCFF00]" />
                        <div>
                          <div className="text-xs font-semibold text-white">{act.title}</div>
                          <div className="text-[11px] text-[#71717A]">{act.sub}</div>
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-[#71717A]" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
