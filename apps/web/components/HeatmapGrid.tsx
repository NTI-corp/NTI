"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { HeatmapPoint } from "@/lib/types";
import { SectorIcon } from "@/components/ui/Icons";

interface HeatmapGridProps {
  points: HeatmapPoint[];
}

const QUADRANT_BADGE: Record<
  HeatmapPoint["quadrant"],
  { label: string; color: string; bg: string }
> = {
  opportunity: {
    label: "HIGH MINDSHARE / LOW COMP",
    color: "#22C55E",
    bg: "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]",
  },
  crowded: {
    label: "CROWDED LEADER",
    color: "#CCFF00",
    bg: "border-[#CCFF00]/40 bg-[#CCFF00]/12 text-[#CCFF00]",
  },
  emerging: {
    label: "EARLY / QUIET",
    color: "#F59E0B",
    bg: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
  },
  quiet: {
    label: "OVERSUPPLIED",
    color: "#EF4444",
    bg: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F87171]",
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

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-8 text-center text-xs text-[#A1A1AA]">
        No mindshare or active builder telemetry available yet. Heatmap populates automatically once Epoch #1 commits.
      </div>
    );
  }

  const xOf = (mBps: number) => padL + (mBps / maxM) * plotW;
  const yOf = (activeProjects: number) => padT + plotH - (activeProjects / maxP) * plotH;

  const selected = points.find((p) => p.narrativeId === selectedId) ?? points[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 xl:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#F4F4F5]">
              Mindshare vs. Active Builder Competition
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              X: Mindshare M_n (%) · Y: Active Projects (≥1 ETH liq &amp; ≥10 txs/7d + curated) · Bottom-right = highest opportunity
            </p>
          </div>
          {selected && (
            <span className="rounded border border-[#232325] bg-[#131314] px-2.5 py-1 font-mono text-[11px] text-[#F4F4F5] tabular-nums">
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
              fill="#22C55E"
              fillOpacity="0.06"
            />

            {[0.25, 0.5, 0.75, 1].map((t) => {
              const x = padL + t * plotW;
              const y = padT + (1 - t) * plotH;
              return (
                <g key={t}>
                  <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke="#232325" />
                  <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#232325" />
                </g>
              );
            })}

            <line
              x1={xOf(medM)}
              x2={xOf(medM)}
              y1={padT}
              y2={padT + plotH}
              stroke="#3A3A3D"
              strokeDasharray="4 4"
            />
            <line
              x1={padL}
              x2={padL + plotW}
              y1={yOf(medP)}
              y2={yOf(medP)}
              stroke="#3A3A3D"
              strokeDasharray="4 4"
            />

            <text
              x={padL + plotW - 8}
              y={padT + plotH - 10}
              textAnchor="end"
              fill="#22C55E"
              fontSize="10"
              fontFamily="var(--font-ibm-plex-mono), monospace"
            >
              OPPORTUNITY · HIGH MINDSHARE / LOW COMPETITION
            </text>
            <text
              x={padL + plotW - 8}
              y={padT + 16}
              textAnchor="end"
              fill="#CCFF00"
              fontSize="9.5"
              fontFamily="var(--font-ibm-plex-mono), monospace"
            >
              CROWDED LEADERS
            </text>
            <text
              x={padL + 8}
              y={padT + 16}
              textAnchor="start"
              fill="#F87171"
              fontSize="9.5"
              fontFamily="var(--font-ibm-plex-mono), monospace"
            >
              OVERSUPPLIED
            </text>
            <text
              x={padL + 8}
              y={padT + plotH - 10}
              textAnchor="start"
              fill="#71717A"
              fontSize="9.5"
              fontFamily="var(--font-ibm-plex-mono), monospace"
            >
              EARLY / QUIET
            </text>

            <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="#3A3A3D" />
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#3A3A3D" />

            <text
              x={padL + plotW / 2}
              y={height - 10}
              textAnchor="middle"
              fill="#A1A1AA"
              fontSize="10.5"
              fontFamily="var(--font-ibm-plex-mono), monospace"
            >
              MINDSHARE M_n (% OF TOTAL NARRATIVE ATTENTION) →
            </text>
            <text
              x={16}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#A1A1AA"
              fontSize="10.5"
              fontFamily="var(--font-ibm-plex-mono), monospace"
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
                  tabIndex={0}
                  role="button"
                  aria-label={`${pt.label}: mindshare ${(pt.mBps / 100).toFixed(1)}%, ${pt.activeProjects} active projects`}
                  className="cursor-pointer focus:outline-none"
                  onClick={() => setSelectedId(pt.narrativeId)}
                  onMouseEnter={() => setSelectedId(pt.narrativeId)}
                  onFocus={() => setSelectedId(pt.narrativeId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(pt.narrativeId);
                    }
                  }}
                >
                  {isSelected && (
                    <rect
                      x={cx - radius - 5}
                      y={cy - radius - 5}
                      width={(radius + 5) * 2}
                      height={(radius + 5) * 2}
                      rx={10}
                      fill={q.color}
                      fillOpacity="0.18"
                    />
                  )}
                  <rect
                    x={cx - radius}
                    y={cy - radius}
                    width={radius * 2}
                    height={radius * 2}
                    rx={7}
                    fill={q.color}
                    fillOpacity={isSelected ? 0.95 : 0.8}
                    stroke="#090909"
                    strokeWidth="2"
                  />
                  <svg
                    x={cx - radius * 0.55}
                    y={cy - radius * 0.55}
                    width={radius * 1.1}
                    height={radius * 1.1}
                    viewBox="0 0 20 20"
                    overflow="visible"
                    style={{ color: "#090909" }}
                  >
                    <SectorIcon slug={pt.slug ?? ""} className="h-full w-full" />
                  </svg>
                  <text
                    x={cx}
                    y={cy - radius - 6}
                    textAnchor="middle"
                    fill={isSelected ? "#F4F4F5" : "#A1A1AA"}
                    fontSize={isSelected ? "10.5" : "9.5"}
                    fontWeight={isSelected ? "600" : "400"}
                    fontFamily="var(--font-ibm-plex-mono), monospace"
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] xl:col-span-5">
        <div className="border-b border-[#232325] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#F4F4F5]">
            Ranked Opportunity Score (M_n / Active Projects)
          </h3>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Sorted descending · High mindshare with thin builder density
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232325] bg-[#131314] font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                <th className="px-3.5 py-2.5">Narrative</th>
                <th className="px-3.5 py-2.5 text-right">M_n</th>
                <th className="px-3.5 py-2.5 text-right">Projects</th>
                <th className="px-3.5 py-2.5 text-right">Opp. Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232325] font-mono tabular-nums">
              {points.map((pt, i) => {
                const badge = QUADRANT_BADGE[pt.quadrant];
                const isSel = selected?.narrativeId === pt.narrativeId;
                return (
                  <tr
                    key={pt.narrativeId}
                    onClick={() => setSelectedId(pt.narrativeId)}
                    onMouseEnter={() => setSelectedId(pt.narrativeId)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? "bg-[#131314]" : "hover:bg-[#131314]/60"
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#71717A]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <Link
                            href={`/narratives/${pt.narrativeId}`}
                            className="font-sans text-xs font-medium text-[#F4F4F5] hover:text-[#CCFF00]"
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
                    <td className="px-3.5 py-2.5 text-right text-[#F4F4F5]">
                      {formatBpsPercent(pt.mBps, 1)}
                      <div className="text-[10px] text-[#71717A]">
                        {formatSignedBps(pt.vBps)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#A1A1AA]">
                      {pt.activeProjects}
                      <div className="text-[10px] text-[#71717A]">
                        {pt.activeTokens}T + {pt.curatedProjects}C
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-semibold text-[#22C55E]">
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
