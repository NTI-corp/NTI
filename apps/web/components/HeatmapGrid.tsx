"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { HeatmapPoint } from "@/lib/types";

interface HeatmapGridProps {
  points: HeatmapPoint[];
}

const QUADRANT_BADGE: Record<
  HeatmapPoint["quadrant"],
  { label: string; color: string; bg: string }
> = {
  opportunity: {
    label: "HIGH MINDSHARE / LOW COMP",
    color: "#10B981",
    bg: "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]",
  },
  crowded: {
    label: "CROWDED LEADER",
    color: "#38BDF8",
    bg: "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]",
  },
  emerging: {
    label: "EARLY / QUIET",
    color: "#F59E0B",
    bg: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
  },
  quiet: {
    label: "OVERSUPPLIED",
    color: "#EF4444",
    bg: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]",
  },
};

export function HeatmapGrid({ points }: HeatmapGridProps) {
  const [selectedId, setSelectedId] = useState<number | null>(
    points[0]?.narrativeId ?? null,
  );

  const width = 820;
  const height = 380;
  const padL = 62;
  const padR = 32;
  const padT = 30;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { maxM, maxP, medM, medP } = useMemo(() => {
    const ms = points.map((p) => p.mBps);
    const ps = points.map((p) => p.activeProjects);
    const sortedM = [...ms].sort((a, b) => a - b);
    const sortedP = [...ps].sort((a, b) => a - b);
    return {
      maxM: Math.max(2200, ...(ms.length ? ms : [2000])) * 1.12,
      maxP: Math.max(20, ...(ps.length ? ps : [20])) * 1.15,
      medM: sortedM[Math.floor(sortedM.length / 2)] ?? 1000,
      medP: sortedP[Math.floor(sortedP.length / 2)] ?? 10,
    };
  }, [points]);

  const xOf = (mBps: number) => padL + (mBps / maxM) * plotW;
  const yOf = (activeProjects: number) => padT + plotH - (activeProjects / maxP) * plotH;

  const selected = points.find((p) => p.narrativeId === selectedId) ?? points[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="panel-surface rounded-md p-4 xl:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Mindshare vs. Active Builder Competition
            </h2>
            <p className="font-mono text-[11px] text-[#8A96A8]">
              X: Mindshare M_n (%) · Y: Active Projects (≥1 ETH liq &amp; ≥10 txs/7d + curated) · Bottom-right = highest opportunity
            </p>
          </div>
          {selected && (
            <span className="rounded border border-[#2A3342] bg-[#131820] px-2.5 py-1 font-mono text-[11px] text-[#EDF1F7] tabular-nums">
              {selected.label}: Score {selected.opportunityScore.toFixed(2)}
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full min-w-[520px]"
            role="img"
            aria-label="Builder Heatmap Quadrant Chart"
          >
            <rect
              x={xOf(medM)}
              y={yOf(medP)}
              width={padL + plotW - xOf(medM)}
              height={padT + plotH - yOf(medP)}
              fill="#10B981"
              fillOpacity="0.06"
            />

            {[0.25, 0.5, 0.75, 1].map((t) => {
              const x = padL + t * plotW;
              const y = padT + (1 - t) * plotH;
              return (
                <g key={t}>
                  <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke="#1B2028" />
                  <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#1B2028" />
                </g>
              );
            })}

            <line
              x1={xOf(medM)}
              x2={xOf(medM)}
              y1={padT}
              y2={padT + plotH}
              stroke="#2A3342"
              strokeDasharray="4 4"
            />
            <line
              x1={padL}
              x2={padL + plotW}
              y1={yOf(medP)}
              y2={yOf(medP)}
              stroke="#2A3342"
              strokeDasharray="4 4"
            />

            <text
              x={padL + plotW - 8}
              y={padT + plotH - 10}
              textAnchor="end"
              fill="#10B981"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              OPPORTUNITY · HIGH MINDSHARE / LOW COMPETITION
            </text>
            <text
              x={padL + plotW - 8}
              y={padT + 16}
              textAnchor="end"
              fill="#38BDF8"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              CROWDED LEADERS
            </text>
            <text
              x={padL + 8}
              y={padT + 16}
              textAnchor="start"
              fill="#EF4444"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              OVERSUPPLIED
            </text>
            <text
              x={padL + 8}
              y={padT + plotH - 10}
              textAnchor="start"
              fill="#556173"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              EARLY / QUIET
            </text>

            <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="#2A3342" />
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#2A3342" />

            <text
              x={padL + plotW / 2}
              y={height - 10}
              textAnchor="middle"
              fill="#8A96A8"
              fontSize="10.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              MINDSHARE M_n (% OF TOTAL NARRATIVE ATTENTION) →
            </text>
            <text
              x={16}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#8A96A8"
              fontSize="10.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
              transform={`rotate(-90 16 ${padT + plotH / 2})`}
            >
              ACTIVE PROJECTS →
            </text>

            {points.map((pt) => {
              const cx = xOf(pt.mBps);
              const cy = yOf(pt.activeProjects);
              const q = QUADRANT_BADGE[pt.quadrant];
              const isSelected = selected?.narrativeId === pt.narrativeId;
              const radius = isSelected ? 10 : 7.5;
              return (
                <g
                  key={pt.narrativeId}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(pt.narrativeId)}
                  onMouseEnter={() => setSelectedId(pt.narrativeId)}
                >
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 6}
                      fill={q.color}
                      fillOpacity="0.18"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={q.color}
                    fillOpacity={isSelected ? 0.95 : 0.78}
                    stroke="#090B0E"
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy - radius - 6}
                    textAnchor="middle"
                    fill={isSelected ? "#EDF1F7" : "#8A96A8"}
                    fontSize={isSelected ? "10.5" : "9.5"}
                    fontWeight={isSelected ? "600" : "400"}
                    fontFamily="var(--font-jetbrains-mono), monospace"
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="panel-surface rounded-md xl:col-span-5">
        <div className="border-b border-[#1B2028] px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-[#EDF1F7]">
            Ranked Opportunity Score (M_n / Active Projects)
          </h3>
          <p className="font-mono text-[11px] text-[#8A96A8]">
            Sorted descending · High mindshare with thin builder density
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1B2028] bg-[#0B0E13] font-mono text-[10px] uppercase tracking-wider text-[#556173]">
                <th className="px-3.5 py-2.5">Narrative</th>
                <th className="px-3.5 py-2.5 text-right">M_n</th>
                <th className="px-3.5 py-2.5 text-right">Projects</th>
                <th className="px-3.5 py-2.5 text-right">Opp. Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B2028] font-mono tabular-nums">
              {points.map((pt, i) => {
                const badge = QUADRANT_BADGE[pt.quadrant];
                const isSel = selected?.narrativeId === pt.narrativeId;
                return (
                  <tr
                    key={pt.narrativeId}
                    onMouseEnter={() => setSelectedId(pt.narrativeId)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? "bg-[#131820]" : "hover:bg-[#131820]/50"
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#556173]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <Link
                            href={`/narratives/${pt.narrativeId}`}
                            className="font-sans text-xs font-medium text-[#EDF1F7] hover:text-[#38BDF8]"
                          >
                            {pt.label}
                          </Link>
                          <div className="mt-0.5">
                            <span
                              className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#EDF1F7]">
                      {formatBpsPercent(pt.mBps, 1)}
                      <div className="text-[10px] text-[#556173]">
                        {formatSignedBps(pt.vBps)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#8A96A8]">
                      {pt.activeProjects}
                      <div className="text-[10px] text-[#556173]">
                        {pt.activeTokens}T + {pt.curatedProjects}C
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-semibold text-[#10B981]">
                      {pt.opportunityScore.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
