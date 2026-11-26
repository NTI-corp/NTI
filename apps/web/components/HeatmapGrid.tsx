"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { HeatmapPoint } from "@/lib/types";

interface HeatmapGridProps {
  points: HeatmapPoint[];
}

const NO_DATA_BADGE = {
  label: "NO PROJECT DATA",
  color: "#71717A",
  bg: "border-[#3A3A40] bg-[#1A1A1D] text-[#8A8A93]",
};

const QUADRANT_BADGE: Record<
  HeatmapPoint["quadrant"],
  { label: string; color: string; bg: string }
> = {
  opportunity: {
    label: "OPPORTUNITY",
    color: "#4ADE80",
    bg: "border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]",
  },
  crowded: {
    label: "CROWDED LEADER",
    color: "#CCFF00",
    bg: "border-[#CCFF00]/40 bg-[#CCFF00]/10 text-[#CCFF00]",
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
  const height = 400;
  const padL = 58;
  const padR = 28;
  const padT = 26;
  const padB = 42;
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
      <div className="border border-[#26262A] bg-[#161618] p-8 text-center text-xs text-[#71717A]">
        No mindshare or active builder telemetry available yet. Heatmap populates automatically once Epoch #1 commits.
      </div>
    );
  }

  const xOf = (mBps: number) => padL + (mBps / maxM) * plotW;
  const yOf = (activeProjects: number) => padT + plotH - (activeProjects / maxP) * plotH;

  const selected = points.find((p) => p.narrativeId === selectedId) ?? points[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* Quadrant Matrix Canvas */}
      <div className="border border-[#26262A] bg-[#161618] xl:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
          <div>
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
              Mindshare vs. Builder Competition
            </h2>
            <p className="mt-0.5 text-[11px] text-[#71717A]">
              X: Mindshare M_n (%) · Y: Active Projects · Bottom-right = highest opportunity
            </p>
          </div>
          {selected && (
            <span className="border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 font-mono text-[10.5px] text-[#F5F5F7] tabular-nums">
              {selected.label}:{" "}
              {selected.noProjectData ? (
                <span className="text-[#71717A]">no project data</span>
              ) : (
                <span className="text-[#CCFF00]">{selected.opportunityScore.toFixed(2)}</span>
              )}
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto bg-[#0D0D0E] p-2">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full min-w-[520px] select-none"
            role="img"
            aria-label="Builder Heatmap Quadrant Chart"
          >
            {/* Opportunity Quadrant Tint */}
            <rect
              x={xOf(medM)}
              y={yOf(medP)}
              width={padL + plotW - xOf(medM)}
              height={padT + plotH - yOf(medP)}
              fill="#4ADE80"
              fillOpacity="0.06"
            />

            {[0.25, 0.5, 0.75, 1].map((t) => {
              const x = padL + t * plotW;
              const y = padT + (1 - t) * plotH;
              return (
                <g key={t}>
                  <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke="#1F1F23" strokeDasharray="2 3" />
                  <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#1F1F23" strokeDasharray="2 3" />
                </g>
              );
            })}

            {/* Median Dividers */}
            <line
              x1={xOf(medM)}
              x2={xOf(medM)}
              y1={padT}
              y2={padT + plotH}
              stroke="#3A3A40"
              strokeDasharray="3 3"
            />
            <line
              x1={padL}
              x2={padL + plotW}
              y1={yOf(medP)}
              y2={yOf(medP)}
              stroke="#3A3A40"
              strokeDasharray="3 3"
            />

            <text
              x={padL + plotW - 8}
              y={padT + plotH - 10}
              textAnchor="end"
              fill="#4ADE80"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              OPPORTUNITY · HIGH MINDSHARE / LOW COMP
            </text>
            <text
              x={padL + plotW - 8}
              y={padT + 15}
              textAnchor="end"
              fill="#CCFF00"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              CROWDED LEADERS
            </text>
            <text
              x={padL + 8}
              y={padT + 15}
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
              fill="#71717A"
              fontSize="9.5"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              EARLY / QUIET
            </text>

            <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="#26262A" />
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#26262A" />

            <text
              x={padL + plotW / 2}
              y={height - 10}
              textAnchor="middle"
              fill="#71717A"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              MINDSHARE M_n (% OF TOTAL ATTENTION) →
            </text>
            <text
              x={16}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#71717A"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono), monospace"
              transform={`rotate(-90 16 ${padT + plotH / 2})`}
            >
              ACTIVE PROJECTS →
            </text>

            {points.map((pt) => {
              const cx = xOf(pt.mBps);
              const cy = yOf(pt.activeProjects);
              const q = pt.noProjectData ? NO_DATA_BADGE : QUADRANT_BADGE[pt.quadrant];
              const isSelected = selected?.narrativeId === pt.narrativeId;
              const r = isSelected ? 7.5 : 5.5;
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
                    <>
                      <line
                        x1={cx}
                        x2={cx}
                        y1={padT}
                        y2={padT + plotH}
                        stroke={q.color}
                        strokeOpacity="0.22"
                        strokeDasharray="2 2"
                      />
                      <line
                        x1={padL}
                        x2={padL + plotW}
                        y1={cy}
                        y2={cy}
                        stroke={q.color}
                        strokeOpacity="0.22"
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 5}
                        fill={q.color}
                        fillOpacity="0.16"
                      />
                    </>
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={q.color}
                    fillOpacity={isSelected ? 1 : 0.85}
                    stroke="#0D0D0E"
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy - r - 6}
                    textAnchor="middle"
                    fill={isSelected ? "#F5F5F7" : "#A1A1AA"}
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

      {/* Ranked Opportunity Table */}
      <div className="border border-[#26262A] bg-[#161618] xl:col-span-5">
        <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
            Ranked Opportunity Score
          </h3>
          <p className="mt-0.5 text-[11px] text-[#71717A]">
            M_n / Active Projects · High mindshare with thin builder density
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1F1F23] bg-[#0D0D0E] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#71717A]">
                <th className="px-3.5 py-2 font-medium">Narrative</th>
                <th className="px-3.5 py-2 text-right font-medium">M_n</th>
                <th className="px-3.5 py-2 text-right font-medium">Projects</th>
                <th className="px-3.5 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F23] font-mono tabular-nums">
              {points.map((pt, i) => {
                const badge = pt.noProjectData ? NO_DATA_BADGE : QUADRANT_BADGE[pt.quadrant];
                const isSel = selected?.narrativeId === pt.narrativeId;
                return (
                  <tr
                    key={pt.narrativeId}
                    onClick={() => setSelectedId(pt.narrativeId)}
                    onMouseEnter={() => setSelectedId(pt.narrativeId)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? "bg-[#1E1E21]" : "hover:bg-[#1E1E21]/60"
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#52525B]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <Link
                            href={`/narratives/${pt.narrativeId}`}
                            className="font-sans text-xs font-medium text-[#F5F5F7] hover:text-[#CCFF00]"
                          >
                            {pt.label}
                          </Link>
                          <div className="mt-0.5">
                            <span
                              className={`inline-block border px-1.5 py-0.5 text-[8.5px] tracking-[0.06em] ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#F5F5F7]">
                      {formatBpsPercent(pt.mBps, 1)}
                      <div className="text-[10px] text-[#71717A]">
                        {formatSignedBps(pt.vBps)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#A1A1AA]">
                      {pt.activeProjects}
                      <div className="text-[10px] text-[#52525B]">
                        {pt.activeTokens}T + {pt.curatedProjects}C
                      </div>
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-medium ${
                        pt.noProjectData ? "text-[#52525B]" : "text-[#4ADE80]"
                      }`}
                    >
                      {pt.noProjectData ? "—" : pt.opportunityScore.toFixed(2)}
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
