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
  NarrativeIndexItem,
  RadarResponse,
} from "@/lib/types";
import { formatBpsPercent, formatSignedBps, truncateHex } from "@/lib/format";
import { IndexChart, type IndexChartSeries } from "./IndexChart";
import { RadarFeed } from "./RadarFeed";
import { SectorIcon } from "./landing/NtiLogos";
import { EpochBadge } from "./EpochBadge";
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
  combinedSeries,
  radar,
  activeEpoch,
  oracleAddress,
  pendingFinalization,
}: {
  narratives: NarrativeIndexItem[];
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

  const filtered = useMemo(() => {
    const slugs = CATEGORY_GROUPS[category];
    const base = slugs
      ? narratives.filter((n) => slugs.includes(n.slug))
      : narratives;

    return [...base].sort((a, b) => {
      const valA =
        sortCol === "vBps"
          ? (a.vBps ?? -999999)
          : sortCol === "mBps"
            ? a.mBps
            : sortCol === "sN"
              ? a.sN
              : sortCol === "weightedPosts"
                ? a.weightedPosts
                : a.iBps;
      const valB =
        sortCol === "vBps"
          ? (b.vBps ?? -999999)
          : sortCol === "mBps"
            ? b.mBps
            : sortCol === "sN"
              ? b.sN
              : sortCol === "weightedPosts"
                ? b.weightedPosts
                : b.iBps;
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [narratives, category, sortCol, sortAsc]);

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
      <ArrowUp className="inline h-3 w-3 text-[#818CF8]" />
    ) : (
      <ArrowDown className="inline h-3 w-3 text-[#818CF8]" />
    );
  };

  return (
    <div className="space-y-5">
      {/* Blockworks Analytics Mindshare Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
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
              className="inline-flex items-center gap-1 rounded-lg border border-[#24242C] bg-[#141418] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:border-[#3A3A46] hover:text-white"
            >
              <span>API &amp; Methodology</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Timeframe + Category Filter Strip (Blockworks style) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#24242C] bg-[#131317] p-0.5">
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

          <div className="h-5 w-px bg-[#24242C]" />

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
                    ? "border-[#3D3D4A] bg-[#22222A] text-white"
                    : "border-[#22222A] bg-[#131317] text-[#A1A1AA] hover:border-[#32323D] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 12-Col Blockworks Grid: 8 Left (Arena + Screener) | 4 Right (Overview + Signals) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 8 Columns */}
        <div className="space-y-4 xl:col-span-8">
          {/* Sub-Tabs Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-[#24242C] bg-[#131317] p-0.5">
              {(
                [
                  { id: "arena", label: "Sectors & Screener" },
                  { id: "chart", label: "Trajectory Chart" },
                  { id: "combined", label: "Combined View" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewTab(tab.id)}
                  className={`cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    viewTab === tab.id
                      ? "bg-[#25252E] text-white"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="font-mono text-[11px] tabular-nums text-[#71717A]">
              {windowChip} CADENCE · Σ I_n = {totalBps.toLocaleString("en-US")} BPS
            </div>
          </div>

          {/* Blockworks Proportional Mindshare Mosaic */}
          {(viewTab === "arena" || viewTab === "combined") && (
            <div className="rounded-xl border border-[#24242C] bg-[#131317] p-3">
              <div className="flex min-h-[88px] w-full flex-wrap gap-1.5 sm:flex-nowrap">
                {sortedByShare.map((n) => {
                  const pct = (n.iBps / (sortedByShare.reduce((s, x) => s + x.iBps, 0) || 1)) * 100;
                  const tone =
                    n.vBps === null
                      ? "border-[#2A2A35] bg-[#1A1A21] text-[#F4F4F5] hover:border-[#3F3F4E]"
                      : n.vBps >= 0
                        ? "border-[#1F4A37] bg-[#11271D] text-[#ECFDF5] hover:border-[#22C55E]/70"
                        : "border-[#52232B] bg-[#291317] text-[#FEF2F2] hover:border-[#EF4444]/70";

                  return (
                    <Link
                      key={n.narrativeId}
                      href={`/narratives/${n.narrativeId}`}
                      style={{ flexGrow: Math.max(8, Math.round(pct * 10)), flexBasis: 0 }}
                      title={`${n.label}: ${formatBpsPercent(n.iBps)}`}
                      className={`flex min-w-[54px] flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-center transition-colors ${tone}`}
                    >
                      <span className="max-w-full truncate text-[11px] font-semibold">
                        {pct >= 9 ? n.label : n.label.split(" ")[0]}
                      </span>
                      <span className="mt-0.5 font-mono text-[11px] tabular-nums opacity-85">
                        {pct >= 7 ? formatBpsPercent(n.iBps) : `${(n.iBps / 100).toFixed(1)}%`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trajectory Chart */}
          {(viewTab === "chart" || viewTab === "combined") && (
            <div className="rounded-xl border border-[#24242C] bg-[#131317] p-4">
              <IndexChart
                series={combinedSeries}
                title="Top 5 Narratives · Mindshare Trajectory (I_n)"
                subtitle="Toggle sectors below · Velocity bars track selected primary series"
                showVelocityBars
              />
            </div>
          )}

          {/* Blockworks-Style Sortable Screener Table */}
          {(viewTab === "arena" || viewTab === "combined") && (
            <div className="overflow-hidden rounded-xl border border-[#24242C] bg-[#131317]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#24242C] bg-[#101014] text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
                      <th className="w-10 px-4 py-3 text-center">#</th>
                      <th className="px-4 py-3">Narrative</th>
                      <th
                        className={`px-4 py-3 text-right ${
                          sortCol === "iBps" ? "border-t-2 border-t-[#6366F1] text-white" : ""
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
                        className={`px-4 py-3 text-right ${
                          sortCol === "vBps" ? "border-t-2 border-t-[#6366F1] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("vBps")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          Change 4h {renderSortIcon("vBps")}
                        </button>
                      </th>
                      <th
                        className={`hidden px-4 py-3 text-right sm:table-cell ${
                          sortCol === "mBps" ? "border-t-2 border-t-[#6366F1] text-white" : ""
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
                        className={`hidden px-4 py-3 text-right md:table-cell ${
                          sortCol === "sN" ? "border-t-2 border-t-[#6366F1] text-white" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("sN")}
                          className="cursor-pointer uppercase hover:text-white"
                        >
                          Decay S_n {renderSortIcon("sN")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E1E26]">
                    {filtered.map((n, idx) => {
                      const isPos = (n.vBps ?? 0) >= 0;
                      return (
                        <tr
                          key={n.narrativeId}
                          className="transition-colors hover:bg-[#191920]"
                        >
                          <td className="px-4 py-3 text-center font-mono text-[11px] tabular-nums text-[#71717A]">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/narratives/${n.narrativeId}`}
                              className="flex items-center gap-2.5 group"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#282832] bg-[#0D0D10] text-[#D4D4D8] group-hover:text-white">
                                <SectorIcon slug={n.slug} className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <div className="font-semibold text-[#F4F4F5] group-hover:text-[#818CF8]">
                                  {n.label}
                                </div>
                                <div className="hidden max-w-[260px] truncate text-[11px] text-[#71717A] lg:block">
                                  {n.description}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-white">
                            {formatBpsPercent(n.iBps)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {n.vBps !== null ? (
                              <span
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                  isPos
                                    ? "bg-[#22C55E]/12 text-[#22C55E]"
                                    : "bg-[#EF4444]/12 text-[#EF4444]"
                                }`}
                              >
                                {isPos ? "↑" : "↓"} {formatSignedBps(n.vBps, n.vFlag)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#71717A]">
                                {n.vFlag ? n.vFlag.replace("_", " ") : "Warming"}
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-[#A1A1AA] sm:table-cell">
                            {formatBpsPercent(n.mBps)}
                          </td>
                          <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-[#A1A1AA] md:table-cell">
                            {n.sN.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/narratives/${n.narrativeId}`}
                              className="inline-flex items-center gap-1 rounded-md border border-[#26262F] bg-[#16161C] px-2.5 py-1 text-[11px] font-medium text-[#D4D4D8] hover:border-[#6366F1] hover:text-white"
                            >
                              <span>Deep Dive</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Overview Card + Tabbed Radar/Actions */}
        <aside className="space-y-4 xl:col-span-4">
          {/* Index Overview Card (Blockworks Market Overview clone) */}
          <div className="rounded-xl border border-[#24242C] bg-[#131317] p-4">
            <div className="text-xs font-semibold text-white">Index Overview</div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-[#71717A]">Total Weight</div>
                <div className="mt-0.5 flex items-baseline gap-1.5 font-mono">
                  <span className="text-base font-bold tabular-nums text-white">
                    {totalBps.toLocaleString("en-US")}
                  </span>
                  <span className="text-[11px] text-[#22C55E]">bps</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[#71717A]">Leader Mindshare</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-white">
                    {leader?.label ?? "—"}
                  </span>
                  <span className="rounded bg-[#22C55E]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#22C55E]">
                    {leader ? formatBpsPercent(leader.iBps) : "—"}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[#71717A]">Fastest Mover</div>
                <div className="mt-0.5 text-xs font-medium text-[#D4D4D8]">
                  {fastest ? `${fastest.label} (${formatSignedBps(fastest.vBps, fastest.vFlag)})` : "Warming EMA"}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[#71717A]">Dataset Root</div>
                <div className="mt-0.5 font-mono text-xs text-[#A1A1AA]">
                  {activeEpoch?.datasetHash ? truncateHex(activeEpoch.datasetHash, 6, 4) : "Pending"}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel Tabs: Radar Signals vs On-Chain Execution */}
          <div className="rounded-xl border border-[#24242C] bg-[#131317] p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-[#24242C] bg-[#0D0D10] p-0.5">
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
                className="text-[11px] font-medium text-[#818CF8] hover:underline"
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
                  <div className="rounded-xl border border-[#2D2D3B] bg-gradient-to-b from-[#171722] to-[#111116] p-5 text-center">
                    <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-[#2F2F3D] bg-[#0B0B0F] text-[#818CF8]">
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
                      className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#818CF8]"
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
                      className="flex items-center justify-between rounded-lg border border-[#22222A] bg-[#0E0E12] px-3.5 py-3 transition-colors hover:border-[#6366F1]/60 hover:bg-[#16161D]"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-[#818CF8]" />
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
