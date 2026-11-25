"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
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
  fill?: boolean;
}

export const NARRATIVE_CHART_COLORS = [
  "#CCFF00",
  "#38BDF8",
  "#F59E0B",
  "#EF4444",
  "#A78BFA",
  "#4ADE80",
  "#FB923C",
  "#2DD4BF",
  "#F472B6",
  "#A1A1AA",
] as const;

const EPOCH_SECONDS = 14_400; // 4h cadence

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(204, 255, 0, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatEpochTimeUtc(epochId: number): string {
  const ms = epochId * EPOCH_SECONDS * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return `E#${epochId}`;
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hr = String(d.getUTCHours()).padStart(2, "0");
  return `${mon} ${day} · ${hr}:00 UTC`;
}

interface HoverData {
  epochId: number;
  rows: Array<{
    id: number;
    label: string;
    color: string;
    iBps: number;
    vBps: number | null;
    vFlag: VFlag;
  }>;
}

export function IndexChart({
  series,
  title = "Mindshare trajectory",
  subtitle = "Finalized 4h epochs · Hamilton bps share",
  showVelocityBars = false,
  height: heightProp = 360,
  fill = false,
}: IndexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lastEpochRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 960, h: heightProp });
  const posRef = useRef({
    visible: false,
    initialized: false,
    curX: 16,
    curY: 12,
    targetX: 16,
    targetY: 12,
  });

  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [curved, setCurved] = useState(true);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const coloredSeries = useMemo(
    () =>
      series.map((s, idx) => ({
        ...s,
        color: NARRATIVE_CHART_COLORS[idx % NARRATIVE_CHART_COLORS.length]!,
      })),
    [series],
  );

  const visibleSeries = useMemo(
    () => coloredSeries.filter((s) => !hiddenIds.has(s.id) && s.points.length > 0),
    [coloredSeries, hiddenIds],
  );

  // Lookup map: timestamp -> seriesId -> point
  const pointLookup = useMemo(() => {
    const byTime = new Map<
      number,
      Map<
        number,
        {
          epochId: number;
          iBps: number;
          vBps: number | null;
          vFlag: VFlag;
          seriesId: number;
        }
      >
    >();
    for (const s of coloredSeries) {
      for (const p of s.points) {
        if (p.incomplete) continue;
        const ts = p.epochId * EPOCH_SECONDS;
        let inner = byTime.get(ts);
        if (!inner) {
          inner = new Map();
          byTime.set(ts, inner);
        }
        inner.set(s.id, {
          epochId: p.epochId,
          iBps: p.iBps,
          vBps: p.vBps,
          vFlag: p.vFlag,
          seriesId: p.seriesId,
        });
      }
    }
    return byTime;
  }, [coloredSeries]);

  const latestEpochId = useMemo(() => {
    let maxEp = 0;
    for (const s of visibleSeries) {
      const last = s.points[s.points.length - 1];
      if (last && last.epochId > maxEp) maxEp = last.epochId;
    }
    return maxEp || null;
  }, [visibleSeries]);

  const toggleSeries = (id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (coloredSeries.length - next.size > 1) {
        next.add(id);
      }
      return next;
    });
  };

  const handleResetView = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialW = Math.max(320, el.clientWidth || 960);
    const initialH = fill ? Math.max(220, el.clientHeight || heightProp) : heightProp;
    sizeRef.current = { w: initialW, h: initialH };

    const chart = createChart(el, {
      width: initialW,
      height: initialH,
      layout: {
        background: { type: ColorType.Solid, color: "#0D0D0E" },
        textColor: "#71717A",
        fontFamily:
          "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 10.5,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          color: "rgba(38, 38, 42, 0.26)",
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: "rgba(38, 38, 42, 0.42)",
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(245, 245, 247, 0.34)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E1E21",
        },
        horzLine: {
          color: "rgba(245, 245, 247, 0.22)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E1E21",
        },
      },
      rightPriceScale: {
        borderColor: "#1F1F23",
        scaleMargins: {
          top: 0.1,
          bottom: showVelocityBars ? 0.22 : 0.1,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: "#1F1F23",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 1,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(1)}%`,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    const addedSeries: ISeriesApi<SeriesType>[] = [];
    const primary = visibleSeries[0];
    const lineType = curved ? LineType.Curved : LineType.Simple;

    // Optional bottom velocity histogram for primary sector
    if (showVelocityBars && primary) {
      const velData = primary.points
        .filter((p) => !p.incomplete && p.vBps !== null)
        .map((p) => ({
          time: (p.epochId * EPOCH_SECONDS) as UTCTimestamp,
          value: p.vBps! / 100,
          color:
            p.vBps! >= 0
              ? "rgba(74, 222, 128, 0.34)"
              : "rgba(239, 68, 68, 0.34)",
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      // Deduplicate by timestamp
      const dedupVel = velData.filter(
        (pt, i, arr) => i === 0 || pt.time !== arr[i - 1]!.time,
      );

      if (dedupVel.length > 0) {
        const hist = chart.addSeries(HistogramSeries, {
          priceScaleId: "velocity",
          priceLineVisible: false,
          lastValueVisible: false,
          base: 0,
        });
        chart.priceScale("velocity").applyOptions({
          scaleMargins: { top: 0.84, bottom: 0 },
          visible: false,
        });
        hist.setData(dedupVel);
        addedSeries.push(hist);
      }
    }

    // Add visible sector curves (primary as AreaSeries, others as LineSeries)
    visibleSeries.forEach((s, idx) => {
      const sorted = s.points
        .filter((p) => !p.incomplete)
        .map((p) => ({
          time: (p.epochId * EPOCH_SECONDS) as UTCTimestamp,
          value: Number((p.iBps / 100).toFixed(2)),
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      const dedup = sorted.filter(
        (pt, i, arr) => i === 0 || pt.time !== arr[i - 1]!.time,
      );
      if (dedup.length === 0) return;

      if (idx === 0) {
        const area = chart.addSeries(AreaSeries, {
          lineColor: s.color,
          topColor: hexToRgba(s.color, 0.2),
          bottomColor: hexToRgba(s.color, 0.0),
          lineWidth: 2,
          lineType,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: "#0D0D0E",
          crosshairMarkerBorderWidth: 1.5,
          crosshairMarkerBackgroundColor: s.color,
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: hexToRgba(s.color, 0.45),
          priceLineStyle: LineStyle.Dotted,
        });
        area.setData(dedup);
        addedSeries.push(area);
      } else {
        const line = chart.addSeries(LineSeries, {
          color: s.color,
          lineWidth: 2,
          lineType,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 3.5,
          crosshairMarkerBorderColor: "#0D0D0E",
          crosshairMarkerBorderWidth: 1.5,
          crosshairMarkerBackgroundColor: s.color,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        line.setData(dedup);
        addedSeries.push(line);
      }
    });

    chart.timeScale().fitContent();

    // GPU-composited silky lerp loop for floating tooltip (zero React re-renders per pixel)
    let rafId = 0;
    const tick = () => {
      const p = posRef.current;
      const tip = tooltipRef.current;
      if (tip && p.visible) {
        p.curX += (p.targetX - p.curX) * 0.24;
        p.curY += (p.targetY - p.curY) * 0.24;
        tip.style.transform = `translate3d(${p.curX.toFixed(1)}px, ${p.curY.toFixed(1)}px, 0)`;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    // Smooth crosshair subscription: React state updates ONLY when hovered epoch changes
    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (
        !param.point ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        typeof param.time !== "number"
      ) {
        if (posRef.current.visible) {
          posRef.current.visible = false;
          posRef.current.initialized = false;
          lastEpochRef.current = null;
          setTooltipVisible(false);
          setHoverData(null);
        }
        return;
      }

      const ts = param.time as number;
      const bucket = pointLookup.get(ts);
      if (!bucket) {
        if (posRef.current.visible) {
          posRef.current.visible = false;
          posRef.current.initialized = false;
          lastEpochRef.current = null;
          setTooltipVisible(false);
          setHoverData(null);
        }
        return;
      }

      const { w, h } = sizeRef.current;
      const tipW = 240;
      const tipH = 176;
      const flipLeft = param.point.x > w - tipW - 76;
      const nextX = flipLeft
        ? Math.max(12, param.point.x - tipW - 18)
        : Math.min(w - tipW - 60, param.point.x + 18);
      const nextY = Math.max(12, Math.min(h - tipH - 36, param.point.y - 28));

      const p = posRef.current;
      p.targetX = nextX;
      p.targetY = nextY;
      if (!p.initialized) {
        p.curX = nextX;
        p.curY = nextY;
        p.initialized = true;
        if (tooltipRef.current) {
          tooltipRef.current.style.transform = `translate3d(${nextX.toFixed(1)}px, ${nextY.toFixed(1)}px, 0)`;
        }
      }
      if (!p.visible) {
        p.visible = true;
        setTooltipVisible(true);
      }

      const epochId = Math.round(ts / EPOCH_SECONDS);
      if (lastEpochRef.current === epochId) return;
      lastEpochRef.current = epochId;

      const rows = visibleSeries
        .map((s) => {
          const pt = bucket.get(s.id);
          if (!pt) return null;
          return {
            id: s.id,
            label: s.label,
            color: s.color,
            iBps: pt.iBps,
            vBps: pt.vBps,
            vFlag: pt.vFlag,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => b.iBps - a.iBps);

      if (rows.length > 0) {
        setHoverData({ epochId, rows });
      }
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(300, Math.round(entry.contentRect.width));
      const h = fill
        ? Math.max(220, Math.round(entry.contentRect.height))
        : heightProp;
      sizeRef.current = { w, h };
      chart.applyOptions({ width: w, height: h });
      chart.timeScale().fitContent();
    });
    ro.observe(el);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      posRef.current.visible = false;
      posRef.current.initialized = false;
      lastEpochRef.current = null;
      void addedSeries;
    };
  }, [visibleSeries, showVelocityBars, curved, fill, heightProp, pointLookup]);

  const activeEpochDisplay = hoverData?.epochId ?? latestEpochId;

  return (
    <div
      className={`border border-[#26262A] bg-[#161618] ${
        fill ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      {/* Crisp Terminal Chart Header + Controls + Live Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
              {title}
            </h2>
            {activeEpochDisplay && (
              <span className="font-mono text-[10px] tabular-nums text-[#71717A]">
                E#{activeEpochDisplay} · {formatEpochTimeUtc(activeEpochDisplay)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[#71717A]">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {/* Interactive Sector Legend */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {coloredSeries.map((s) => {
              const hidden = hiddenIds.has(s.id);
              const hoveredRow = hoverData?.rows.find((r) => r.id === s.id);
              const fallbackPt = s.points[s.points.length - 1];
              const displayBps =
                hoveredRow?.iBps ??
                (fallbackPt && !fallbackPt.incomplete ? fallbackPt.iBps : null);

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSeries(s.id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 text-[11px] transition-opacity ${
                    hidden
                      ? "text-[#52525B] line-through opacity-45"
                      : "text-[#F5F5F7] hover:opacity-85"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-[2.5px] w-3 shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-medium">{s.label}</span>
                  {displayBps !== null && (
                    <span className="font-mono text-[10.5px] tabular-nums text-[#A1A1AA]">
                      {formatBpsPercent(displayBps, 1)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Minimal Chart Controls */}
          <div className="flex items-center gap-1 border-l border-[#1F1F23] pl-3">
            <button
              type="button"
              onClick={() => setCurved((v) => !v)}
              title="Toggle smooth curve vs linear"
              className={`cursor-pointer border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
                curved
                  ? "border-[#3A3A40] bg-[#1E1E21] text-[#F5F5F7]"
                  : "border-[#1F1F23] bg-transparent text-[#71717A] hover:text-[#F5F5F7]"
              }`}
            >
              {curved ? "Smooth" : "Linear"}
            </button>
            <button
              type="button"
              onClick={handleResetView}
              title="Reset zoom and fit all epochs"
              className="cursor-pointer border border-[#1F1F23] bg-transparent px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#71717A] transition-colors hover:border-[#3A3A40] hover:text-[#F5F5F7]"
            >
              Fit
            </button>
          </div>
        </div>
      </div>

      {/* TradingView Lightweight-Charts HTML5 Canvas Container */}
      <div
        className={`relative w-full bg-[#0D0D0E] ${
          fill ? "min-h-0 flex-1 overflow-hidden" : ""
        }`}
      >
        <div
          ref={containerRef}
          className="h-full w-full"
          style={fill ? undefined : { height: `${heightProp}px` }}
        />

        {pointLookup.size > 0 && pointLookup.size < 4 && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[19rem] border border-[#26262A] bg-[#111113]/90 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#A1A1AA]">
            <span className="text-[#CCFF00]">{pointLookup.size} EPOCH{pointLookup.size === 1 ? "" : "S"} ON MAINNET SO FAR</span>
            <br />
            The chart gains one point every 4 hours; the 24h velocity V_n needs 7 epochs in the same series.
          </div>
        )}

        {/* Floating Bloomberg Crosshair Tooltip (GPU-composited lerp) */}
        <div
          ref={tooltipRef}
          className={`pointer-events-none absolute left-0 top-0 z-20 w-60 border border-[#3A3A40] bg-[#161618]/95 p-2.5 shadow-xl backdrop-blur-sm will-change-transform transition-opacity duration-150 ${
            tooltipVisible && hoverData ? "opacity-100" : "opacity-0"
          }`}
        >
          {hoverData && (
            <>
              <div className="mb-1.5 flex items-center justify-between border-b border-[#1F1F23] pb-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#71717A]">
                <span>Epoch #{hoverData.epochId}</span>
                <span>{formatEpochTimeUtc(hoverData.epochId)}</span>
              </div>
              <div className="space-y-1 font-mono text-[10.5px] tabular-nums">
                {hoverData.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[#F5F5F7]">
                      <span
                        className="h-[2.5px] w-2.5 shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="truncate font-sans text-[11px]">
                        {row.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[#F5F5F7]">
                        {formatBpsPercent(row.iBps, 2)}
                      </span>
                      {row.vBps !== null && (
                        <span
                          className={`text-[9.5px] ${
                            row.vBps >= 0 ? "text-[#4ADE80]" : "text-[#EF4444]"
                          }`}
                        >
                          {formatSignedBps(row.vBps, row.vFlag)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
