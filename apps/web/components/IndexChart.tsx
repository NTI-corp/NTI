"use client";

import React, { useMemo, useState } from "react";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import type { VFlag } from "@/lib/types";

export interface IndexChartSeries {
  id: number;
  label: string;
  color: string;
  points: Array<{
    epochId: number;
    iBps: number;
    vBps: number | null;
    vFlag: VFlag;
    seriesId: number;
    incomplete: boolean;
    seriesBreak?: boolean;
  }>;
}

interface IndexChartProps {
  series: IndexChartSeries[];
  title?: string;
  subtitle?: string;
  showVelocityBars?: boolean;
  height?: number;
}

export const NARRATIVE_CHART_COLORS = [
  "#22C55E",
  "#6366F1",
  "#F59E0B",
  "#A78BFA",
  "#EF4444",
  "#38BDF8",
  "#FB923C",
  "#F4F4F5",
  "#34D399",
  "#EC4899",
] as const;

export function IndexChart({
  series,
  title = "Narrative Index Trajectory (I_n) & Velocity (V_n)",
  subtitle = "Finalized 4h epochs · Hamilton bps (Σ I_n = 10,000)",
  showVelocityBars = true,
  height = 290,
}: IndexChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenIds.has(s.id) && s.points.length > 0),
    [series, hiddenIds],
  );

  const primary = visibleSeries[0] ?? series[0];
  const epochs = useMemo(() => {
    if (!primary) return [];
    return primary.points.map((p) => p.epochId);
  }, [primary]);

  const width = 920;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 24;
  const indexPlotH = showVelocityBars ? Math.round(height * 0.62) : height - 56;
  const velGap = showVelocityBars ? 26 : 0;
  const velPlotH = showVelocityBars ? height - indexPlotH - velGap - padTop - 28 : 0;
  const plotW = width - padLeft - padRight;

  const { minI, maxI } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const s of visibleSeries) {
      for (const p of s.points) {
        if (p.incomplete) continue;
        if (p.iBps < min) min = p.iBps;
        if (p.iBps > max) max = p.iBps;
      }
    }
    if (!Number.isFinite(min) || max === 0) return { minI: 0, maxI: 2500 };
    const pad = Math.max(120, Math.round((max - min) * 0.15));
    return { minI: Math.max(0, min - pad), maxI: max + pad };
  }, [visibleSeries]);

  const maxAbsV = useMemo(() => {
    if (!primary) return 2000;
    let m = 1000;
    for (const p of primary.points) {
      if (p.vBps !== null) m = Math.max(m, Math.abs(p.vBps));
    }
    return m;
  }, [primary]);

  const xAt = (idx: number) => {
    if (epochs.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (epochs.length - 1)) * plotW;
  };

  const yAtI = (iBps: number) => {
    const ratio = (iBps - minI) / Math.max(1, maxI - minI);
    return padTop + indexPlotH - ratio * indexPlotH;
  };

  const velTop = padTop + indexPlotH + velGap;
  const velMid = velTop + velPlotH / 2;

  const toggleSeries = (id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (series.length - next.size > 1) {
        next.add(id);
      }
      return next;
    });
  };

  const markers = useMemo(() => {
    if (!primary) return [];
    const out: Array<{ idx: number; kind: "series_break" | "incomplete"; epochId: number }> = [];
    for (let i = 0; i < primary.points.length; i++) {
      const pt = primary.points[i]!;
      const prev = i > 0 ? primary.points[i - 1] : null;
      if (pt.incomplete) {
        out.push({ idx: i, kind: "incomplete", epochId: pt.epochId });
      } else if (pt.seriesBreak || (prev && prev.seriesId !== pt.seriesId)) {
        out.push({ idx: i, kind: "series_break", epochId: pt.epochId });
      }
    }
    return out;
  }, [primary]);

  const activeIdx =
    hoveredIdx !== null && hoveredIdx < epochs.length ? hoveredIdx : epochs.length - 1;

  return (
    <div className="rounded-lg border border-[#24242C] bg-[#131317] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[#F4F4F5]">
            {title}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-[#A1A1AA]">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {series.map((s) => {
            const hidden = hiddenIds.has(s.id);
            const pt = s.points[activeIdx];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSeries(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] transition-opacity ${
                  hidden
                    ? "border-[#24242C] text-[#71717A] opacity-45"
                    : "border-[#24242C] bg-[#19191F] text-[#F4F4F5]"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
                {pt && !pt.incomplete && (
                  <span className="text-[#A1A1AA] tabular-nums">
                    {formatBpsPercent(pt.iBps, 1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {primary && primary.points[activeIdx] && (
        <div className="mb-2 flex flex-wrap items-center gap-4 rounded-md border border-[#24242C] bg-[#0B0B0E] px-3 py-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-[#A1A1AA]">
            EPOCH <strong className="text-[#F4F4F5]">#{primary.points[activeIdx]!.epochId}</strong>
          </span>
          <span className="text-[#A1A1AA]">
            SERIES <strong className="text-[#F4F4F5]">S{primary.points[activeIdx]!.seriesId}</strong>
          </span>
          {primary.points[activeIdx]!.incomplete ? (
            <span className="text-[#F59E0B]">INCOMPLETE EPOCH · EXCLUDED FROM EMA</span>
          ) : (
            <>
              <span className="text-[#A1A1AA]">
                I_n{" "}
                <strong className="text-[#F4F4F5]">
                  {primary.points[activeIdx]!.iBps.toLocaleString("en-US")} bps (
                  {formatBpsPercent(primary.points[activeIdx]!.iBps)})
                </strong>
              </span>
              <span className="text-[#A1A1AA]">
                V_n{" "}
                <strong
                  className={
                    primary.points[activeIdx]!.vBps === null
                      ? "text-[#F59E0B]"
                      : (primary.points[activeIdx]!.vBps ?? 0) >= 0
                        ? "text-[#22C55E]"
                        : "text-[#EF4444]"
                  }
                >
                  {formatSignedBps(
                    primary.points[activeIdx]!.vBps,
                    primary.points[activeIdx]!.vFlag,
                  )}
                </strong>
              </span>
            </>
          )}
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[540px] select-none"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <pattern
              id="incompleteHatch"
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#F59E0B" strokeOpacity="0.35" strokeWidth="2" />
            </pattern>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const val = Math.round(minI + t * (maxI - minI));
            const y = yAtI(val);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="#24242C"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#71717A"
                  fontSize="10"
                  fontFamily="var(--font-ibm-plex-mono), monospace"
                >
                  {(val / 100).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {markers.map((m) => {
            const cx = xAt(m.idx);
            if (m.kind === "incomplete") {
              const colW = epochs.length > 1 ? Math.max(14, plotW / epochs.length) : 20;
              return (
                <g key={`inc-${m.epochId}`}>
                  <rect
                    x={cx - colW / 2}
                    y={padTop}
                    width={colW}
                    height={indexPlotH}
                    fill="url(#incompleteHatch)"
                  />
                  <text
                    x={cx}
                    y={padTop + 11}
                    textAnchor="middle"
                    fill="#F59E0B"
                    fontSize="9"
                    fontFamily="var(--font-jetbrains-mono), monospace"
                  >
                    INCOMPLETE
                  </text>
                </g>
              );
            }
            return (
              <g key={`brk-${m.epochId}`}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={padTop}
                  y2={padTop + indexPlotH}
                  stroke="#6366F1"
                  strokeDasharray="3 3"
                  strokeWidth="1.25"
                />
                <rect
                  x={cx - 34}
                  y={padTop - 16}
                  width="68"
                  height="14"
                  rx="2"
                  fill="#131317"
                  stroke="#6366F1"
                  strokeOpacity="0.6"
                />
                <text
                  x={cx}
                  y={padTop - 6}
                  textAnchor="middle"
                  fill="#A5B4FC"
                  fontSize="8.5"
                  fontFamily="var(--font-ibm-plex-mono), monospace"
                >
                  NEW SERIES
                </text>
              </g>
            );
          })}

          {visibleSeries.map((s) => {
            const segments: string[] = [];
            let current: string[] = [];

            s.points.forEach((p, idx) => {
              const prev = idx > 0 ? s.points[idx - 1] : null;
              const isBreak = p.seriesBreak || (prev && prev.seriesId !== p.seriesId);
              if (p.incomplete) {
                if (current.length > 0) {
                  segments.push(current.join(" "));
                  current = [];
                }
                return;
              }
              if (isBreak && current.length > 0) {
                segments.push(current.join(" "));
                current = [];
              }
              current.push(`${current.length === 0 ? "M" : "L"} ${xAt(idx).toFixed(1)} ${yAtI(p.iBps).toFixed(1)}`);
            });
            if (current.length > 0) segments.push(current.join(" "));

            return (
              <g key={s.id}>
                {segments.map((d, segIdx) => (
                  <path
                    key={segIdx}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={visibleSeries.length === 1 ? 2.2 : 1.7}
                    strokeLinejoin="round"
                  />
                ))}
                {s.points[activeIdx] && !s.points[activeIdx]!.incomplete && (
                  <circle
                    cx={xAt(activeIdx)}
                    cy={yAtI(s.points[activeIdx]!.iBps)}
                    r="3.8"
                    fill={s.color}
                    stroke="#0B0B0E"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}

          {showVelocityBars && primary && (
            <g>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={velMid}
                y2={velMid}
                stroke="#32323D"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={velMid + 3}
                textAnchor="end"
                fill="#71717A"
                fontSize="9"
                fontFamily="var(--font-ibm-plex-mono), monospace"
              >
                V_n 0
              </text>

              {primary.points.map((p, idx) => {
                const cx = xAt(idx);
                const barW = Math.max(6, Math.min(20, (plotW / Math.max(1, epochs.length)) * 0.55));
                if (p.vBps === null) {
                  if (p.vFlag === "too_small") {
                    return (
                      <text
                        key={p.epochId}
                        x={cx}
                        y={velMid - 4}
                        textAnchor="middle"
                        fill="#F59E0B"
                        fontSize="7.5"
                        fontFamily="var(--font-ibm-plex-mono), monospace"
                      >
                        too small
                      </text>
                    );
                  }
                  return null;
                }
                const barH = Math.max(2, (Math.abs(p.vBps) / maxAbsV) * (velPlotH / 2 - 4));
                const isUp = p.vBps >= 0;
                return (
                  <rect
                    key={p.epochId}
                    x={cx - barW / 2}
                    y={isUp ? velMid - barH : velMid}
                    width={barW}
                    height={barH}
                    rx="1"
                    fill={isUp ? "#22C55E" : "#EF4444"}
                    fillOpacity={idx === activeIdx ? 0.95 : 0.6}
                  />
                );
              })}
            </g>
          )}

          {epochs.map((ep, idx) => {
            const cx = xAt(idx);
            const showLabel =
              epochs.length <= 10 || idx % Math.ceil(epochs.length / 8) === 0 || idx === epochs.length - 1;
            const hitW = epochs.length > 1 ? plotW / (epochs.length - 1) : plotW;
            return (
              <g key={ep}>
                {idx === activeIdx && (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={padTop}
                    y2={height - 20}
                    stroke="#F4F4F5"
                    strokeOpacity="0.2"
                    strokeDasharray="2 2"
                  />
                )}
                {showLabel && (
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    fill="#71717A"
                    fontSize="9.5"
                    fontFamily="var(--font-ibm-plex-mono), monospace"
                  >
                    E{ep}
                  </text>
                )}
                <rect
                  x={cx - hitW / 2}
                  y={padTop}
                  width={hitW}
                  height={height - padTop - 16}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredIdx(idx)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
