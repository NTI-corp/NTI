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
import { sectorColor } from "@/lib/sectors";
import { CopyContractPill } from "./TacticalFrame";
import { SegmentedTabs } from "./ui/SegmentedTabs";

type SideTab = "sectors" | "radar" | "actions";
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
  const [sideTab, setSideTab] = useState<SideTab>("sectors");
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
    <div className="flex flex-col gap-3">
      {/* Header: title, epoch, filters and oracle on one line */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="!text-[1.9rem]">Mindshare</h1>
          {activeEpoch && <EpochBadge epochId={activeEpoch.epochId} status={activeEpoch.status} />}
          {pendingFinalization && (
            <span className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[11px] font-medium text-[#F59E0B]">
              2h dispute active
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedTabs
            value={windowChip}
            onChange={setWindowChip}
            options={[
              { value: "4H", label: "4H" },
              { value: "24H", label: "24H" },
              { value: "7D", label: "7D" },
              { value: "ALL", label: "All" },
            ]}
            buttonClassName="px-2.5 py-1 text-xs"
          />
          <SegmentedTabs
            value={category}
            onChange={setCategory}
            options={[
              { value: "all", label: "All sectors", tone: "lime" },
              { value: "defi", label: "DeFi", tone: "lime" },
              { value: "ai", label: "AI", tone: "lime" },
              { value: "infra", label: "Infra", tone: "lime" },
              { value: "consumer", label: "Consumer", tone: "lime" },
            ]}
            className="gap-0.5"
            buttonClassName="px-2.5 py-1 text-xs"
          />
          {oracleAddress && <CopyContractPill label="Oracle" address={oracleAddress} />}
        </div>
      </div>

      {/* Headline figures */}
      <div className="stat-strip stat-strip-compact">
        <div>
          <div className="stat-label">Leader sector</div>
          <div className="stat-value truncate">{leader?.label ?? "-"}</div>
          <div className="stat-caption">{leader ? formatBpsPercent(leader.iBps) : "-"} of total mindshare</div>
        </div>
        <div>
          <div className="stat-label">Total weight</div>
          <div className="stat-value tabular-nums">
            {totalBps.toLocaleString("en-US")}
            <span className="ml-1 font-sans text-xs font-medium text-[#8A8A93]">bps</span>
          </div>
          <div className="stat-caption">Always sums to 10,000</div>
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
          <div className="stat-value truncate !font-mono !text-base !leading-[2.1rem]">
            {activeEpoch?.datasetHash ? truncateHex(activeEpoch.datasetHash, 6, 4) : "Pending"}
          </div>
          <div className="stat-caption">Committed on-chain</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Left: share mosaic and trajectory */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <div className="rounded-xl border border-[#232325] bg-[#0A0A0B] p-1.5">
            <div className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-5">
              {sortedByShare.map((n) => {
                const color = sectorColor(n.narrativeId);
                const rising = (n.vBps ?? 0) >= 0;
                return (
                  <Link
                    key={n.narrativeId}
                    href={`/narratives/${n.narrativeId}`}
                    style={{
                      background: "#0F0F11",
                      borderColor: "#26262A",
                      borderTopColor: color,
                      borderTopWidth: 2,
                    }}
                    title={`${n.label}: ${formatBpsPercent(n.iBps)}`}
                    className="relative flex min-h-[78px] min-w-0 flex-col justify-between overflow-hidden rounded-md border px-3 py-2.5 hover:bg-[#131315]"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-[#C9C9CF]">{n.label}</span>
                      <span
                        className={`shrink-0 font-mono text-[10px] ${
                          n.vBps === null ? "text-[#62626B]" : rising ? "text-[#22C55E]" : "text-[#EF4444]"
                        }`}
                      >
                        {n.vBps !== null ? formatSignedBps(n.vBps, n.vFlag) : "warming"}
                      </span>
                    </span>
                    <span>
                      <span className="block font-serif text-lg leading-none tabular-nums text-white">
                        {(n.iBps / 100).toFixed(2)}
                        <span className="text-[11px] text-[#8A8A93]">%</span>
                      </span>
                      <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-[#1B1B1E]">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${(n.iBps / (sortedByShare[0]?.iBps || 1)) * 100}%`, background: color }}
                        />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="h-[400px] xl:h-[460px]">
            <IndexChart
              fill
              series={windowedChartSeries}
              title={`Top 5 sectors, ${windowChip === "ALL" ? "all epochs" : windowChip}`}
              subtitle="Share of mindshare per 4h epoch; bars show velocity of the first selected sector"
              showVelocityBars
            />
          </div>
        </div>

        {/* Right: sectors, radar and actions in one panel */}
        <aside className="flex min-w-0 flex-col rounded-xl border border-[#232325] bg-[#0E0E0F] xl:col-span-4">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#232325] px-3 py-2.5">
            <SegmentedTabs
              value={sideTab}
              onChange={setSideTab}
              options={[
                { value: "sectors", label: "Sectors" },
                { value: "radar", label: "Radar" },
                { value: "actions", label: "Actions" },
              ]}
              buttonClassName="px-3 py-1 text-xs"
            />
            {sideTab === "radar" && (
              <Link href="/radar" className="text-[11px] font-medium text-[#CCFF00] hover:underline">
                View all
              </Link>
            )}
          </div>

          <div>
            {sideTab === "sectors" && (
              <table key="sectors" className="tab-panel-enter w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0E0E0F] text-[11px] text-[#71717A]">
                  <tr className="border-b border-[#232325]">
                    <th className="w-8 py-2 pl-3 font-medium">#</th>
                    <th className="py-2 font-medium">Sector</th>
                    <th className="py-2 text-right font-medium">
                      <button type="button" onClick={() => handleSort("iBps")} className="cursor-pointer hover:text-white">
                        Share {renderSortIcon("iBps")}
                      </button>
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      <button type="button" onClick={() => handleSort("vBps")} className="cursor-pointer hover:text-white">
                        Change {renderSortIcon("vBps")}
                      </button>
                    </th>
                    <th className="hidden py-2 pr-3 text-right font-medium 2xl:table-cell">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B1B1E]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-[#71717A]">
                        No sectors match this filter.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((n, idx) => {
                      const delta = windowDeltaById.get(n.narrativeId) ?? null;
                      const isPos = (delta ?? 0) >= 0;
                      return (
                        <tr key={n.narrativeId}>
                          <td className="py-2 pl-3 font-mono text-[11px] tabular-nums text-[#62626B]">{idx + 1}</td>
                          <td className="py-2">
                            <Link href={`/narratives/${n.narrativeId}`} className="group flex items-center gap-2">
                              <span style={{ color: sectorColor(n.narrativeId) }}>
                                <SectorIcon slug={n.slug} className="h-3.5 w-3.5" />
                              </span>
                              <span className="truncate font-medium text-[#E4E4E7] group-hover:text-[#CCFF00]">
                                {n.label}
                              </span>
                            </Link>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-white">
                            {formatBpsPercent(n.iBps)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums">
                            {delta !== null ? (
                              <span className={isPos ? "text-[#22C55E]" : "text-[#EF4444]"}>
                                {formatSignedBps(delta, windowChip === "4H" ? n.vFlag : null)}
                              </span>
                            ) : (
                              <span className="text-[#62626B]">warming</span>
                            )}
                          </td>
                          <td className="hidden py-2 pr-3 text-right 2xl:table-cell">
                            <Sparkline
                              values={(recentSeries?.[n.narrativeId] ?? []).slice(-24).map((p) => p.iBps)}
                              color={sectorColor(n.narrativeId)}
                              width={64}
                              height={20}
                              className="ml-auto"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {sideTab === "radar" && (
              <div key="radar" className="tab-panel-enter space-y-4 p-3">
                <RadarFeed
                  alerts={radar.alerts}
                  realtimeUnlocked={radar.realtimeUnlocked}
                  maxItems={5}
                  compact
                />
                {!radar.realtimeUnlocked && (
                  <div className="rounded-lg border border-[#232325] bg-[#0B0B0C] p-4">
                    <div className="text-sm font-medium text-white">Real-time radar</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#9A9AA3]">
                      Public feeds are delayed by 60 minutes. Stake 100k $NTI to see velocity breakouts as they
                      happen.
                    </p>
                    <Link
                      href="/stake"
                      className="mt-3 inline-flex items-center justify-center rounded-md bg-[#CCFF00] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#B8E600]"
                    >
                      Stake $NTI
                    </Link>
                  </div>
                )}
              </div>
            )}

            {sideTab === "actions" && (
              <ul key="actions" className="tab-panel-enter divide-y divide-[#1B1B1E]">
                {[
                  { href: "/markets", title: "Pair markets", sub: "Parimutuel pools, 0.1% fee", icon: Activity },
                  { href: "/baskets", title: "Narrative baskets", sub: "Uniswap V3 vaults, 30m TWAP NAV", icon: Layers },
                  { href: "/stake", title: "Stake $NTI", sub: "Fee discounts and instant radar", icon: Coins },
                  { href: "/grants", title: "Ecosystem grants", sub: "Vote on funding rounds", icon: Sparkles },
                  {
                    href: "/oracle",
                    title: "Oracle and disputes",
                    sub: "Attestations and 2h challenge window",
                    icon: ShieldCheck,
                  },
                ].map((act) => {
                  const Icon = act.icon;
                  return (
                    <li key={act.href}>
                      <Link
                        href={act.href}
                        className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-white/[0.03]"
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-[#8A8A93]" />
                          <span>
                            <span className="block text-[13px] font-medium text-white">{act.title}</span>
                            <span className="block text-[11px] text-[#71717A]">{act.sub}</span>
                          </span>
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-[#62626B]" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
