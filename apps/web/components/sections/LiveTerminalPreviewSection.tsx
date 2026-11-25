"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT, type SectorTickerItem } from "@/content/home";
import { DottedDivider } from "@/components/ui/DottedDivider";
import { ExternalArrowIcon, SectorIcon, SlideArrow } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

type FilterMode = "all" | "gaining" | "cooling";

interface LiveNarrativeRow extends SectorTickerItem {
  rank: number;
}

export function LiveTerminalPreviewSection() {
  const { marquee } = HOME_CONTENT;
  const sectionRef = useRef<HTMLElement>(null);
  const [sectors, setSectors] = useState<SectorTickerItem[]>(marquee.sectors);
  const [epochId, setEpochId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedId, setSelectedId] = useState<number>(2);

  useEffect(() => {
    let cancelled = false;
    fetch(marquee.apiUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          snapshot: {
            epochId?: number | null;
            dataSource?: string;
            narratives?: Array<{
              narrativeId?: number;
              slug?: string;
              label?: string;
              iBps?: number;
              vBps?: number | null;
            }>;
          } | null
        ) => {
          if (
            cancelled ||
            !snapshot ||
            !Array.isArray(snapshot.narratives) ||
            snapshot.narratives.length === 0
          ) {
            return;
          }
          const next: SectorTickerItem[] = snapshot.narratives
            .filter(
              (
                n
              ): n is {
                narrativeId: number;
                slug: string;
                label: string;
                iBps: number;
                vBps?: number | null;
              } =>
                typeof n.narrativeId === "number" &&
                typeof n.slug === "string" &&
                typeof n.label === "string" &&
                typeof n.iBps === "number"
            )
            .map((n) => ({
              narrativeId: n.narrativeId,
              slug: n.slug,
              label: n.label,
              iBps: n.iBps,
              vBps: typeof n.vBps === "number" ? n.vBps : null,
            }));

          if (next.length > 0) {
            setSectors(next);
            if (typeof snapshot.epochId === "number") {
              setEpochId(snapshot.epochId);
            }
            const top = [...next].sort((a, b) => b.iBps - a.iBps)[0];
            if (top) setSelectedId(top.narrativeId);
          }
        }
      )
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [marquee.apiUrl]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const blocks = el.querySelectorAll("[data-terminal-reveal]");
      if (blocks.length) {
        gsap.fromTo(
          blocks,
          { y: 22, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.08,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 78%",
              once: true,
            },
          }
        );
      }
    }, el);

    return () => ctx.revert();
  }, []);

  const rankedAll = useMemo<LiveNarrativeRow[]>(() => {
    return [...sectors]
      .sort((a, b) => b.iBps - a.iBps)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [sectors]);

  const filtered = useMemo(() => {
    if (filter === "gaining") {
      return rankedAll.filter((r) => (r.vBps ?? 0) > 0);
    }
    if (filter === "cooling") {
      return rankedAll.filter((r) => (r.vBps ?? 0) < 0);
    }
    return rankedAll;
  }, [rankedAll, filter]);

  const selected =
    rankedAll.find((r) => r.narrativeId === selectedId) ?? rankedAll[0];

  const maxBps = useMemo(
    () => Math.max(1, ...rankedAll.map((r) => r.iBps)),
    [rankedAll]
  );

  const totalBps = useMemo(
    () => Math.max(1, rankedAll.reduce((acc, r) => acc + r.iBps, 0)),
    [rankedAll]
  );

  const gainingCount = useMemo(
    () => rankedAll.filter((r) => (r.vBps ?? 0) > 0).length,
    [rankedAll]
  );

  return (
    <section
      ref={sectionRef}
      id="live-terminal"
      className="relative z-20 w-full bg-[#090B0E] text-white pt-[5em] pb-[5.5em] md:pt-[7em] md:pb-[7.5em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Header Row */}
          <div
            data-terminal-reveal=""
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-[1.5em] mb-[2.25em]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-x-[0.9em] gap-y-[0.35em] mb-[0.9em] font-mono text-[0.75em] tracking-[0.04em] uppercase">
                <span className="text-[#CCFF00]">
                  {epochId ? `EPOCH #${epochId}` : "4H EPOCH SNAPSHOT"}
                </span>
                <span className="text-[#4b515b]">/</span>
                <span className="text-[#89919f]">
                  {totalBps.toLocaleString()} BPS HAMILTON SUM
                </span>
              </div>

              <h2 className="text-[2.25em] sm:text-[3.5em] md:text-[4.5em] font-normal leading-[1] tracking-[-0.045em] text-white max-w-[14em]">
                Inspect live crypto{" "}
                <span className="text-[#CCFF00]">mindshare</span> before you trade
              </h2>
            </div>

            <div className="flex items-center gap-[0.85em]">
              <PixelOwlMascot
                variant="owl"
                size={38}
                label="8-bit Live Telemetry Owl"
              />
              <a
                href="/terminal"
                className="inline-flex items-center gap-[0.6em] bg-[#CCFF00] hover:bg-[#B8E600] text-black text-[0.875em] font-medium px-[1.35em] py-[0.85em] transition-colors whitespace-nowrap"
              >
                <ScrambleText text="Open full terminal" trigger="hover" />
                <SlideArrow className="w-[0.8em] h-[0.7em]" />
              </a>
            </div>
          </div>

          <DottedDivider color="#343940" />

          {/* Interactive 10,000 BPS Hamilton Equilibrium Bar */}
          <div data-terminal-reveal="" className="mt-[2em]">
            <div className="flex items-center justify-between gap-[1em] font-mono text-[0.7em] uppercase tracking-[0.06em] text-[#89919f] mb-[0.65em]">
              <span>10-Sector Hamilton Allocation (100.00%)</span>
              {selected && (
                <span className="text-white">
                  {selected.label}:{" "}
                  <span className="text-[#CCFF00]">
                    {(selected.iBps / 100).toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
            <div className="flex w-full h-[1.15em] gap-[2px] bg-[#090B0E]">
              {rankedAll.map((row, idx) => {
                const isSelected = selected?.narrativeId === row.narrativeId;
                const widthPct = (row.iBps / totalBps) * 100;
                const shade = Math.max(0.18, 0.72 - idx * 0.055);
                return (
                  <button
                    key={row.narrativeId}
                    type="button"
                    title={`${row.label} (${(row.iBps / 100).toFixed(2)}%)`}
                    aria-label={`Select ${row.label} (${(row.iBps / 100).toFixed(2)}%)`}
                    onClick={() => setSelectedId(row.narrativeId)}
                    onMouseEnter={() => setSelectedId(row.narrativeId)}
                    className="h-full transition-all duration-200 cursor-pointer"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: isSelected
                        ? "#CCFF00"
                        : `rgba(137, 145, 159, ${shade.toFixed(2)})`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Interactive Terminal Frame */}
          <div
            data-terminal-reveal=""
            className="mt-[1.5em] grid grid-cols-1 lg:grid-cols-[1.45fr_0.95fr] gap-[1.5em] items-stretch"
          >
            {/* Left: Live Ranked Narrative Matrix */}
            <div className="bg-[#131518] border border-[#343940] flex flex-col">
              {/* Toolbar */}
              <div className="px-[1.25em] py-[0.85em] border-b border-[#222529] bg-[#0e1013] flex flex-wrap items-center justify-between gap-[0.75em]">
                <div className="flex items-center gap-[0.4em]">
                  {(
                    [
                      { id: "all", label: `All (${rankedAll.length})` },
                      { id: "gaining", label: `Gaining (${gainingCount})` },
                      {
                        id: "cooling",
                        label: `Cooling (${rankedAll.length - gainingCount})`,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = filter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilter(tab.id)}
                        className={`font-mono text-[0.72em] uppercase tracking-wider px-[0.75em] py-[0.4em] transition-colors cursor-pointer ${
                          active
                            ? "bg-[#CCFF00] text-black font-medium"
                            : "bg-[#1a1d22] text-[#a1a7b2] hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <span className="font-mono text-[0.7em] text-[#6c7584]">
                  SELECT ROW TO INSPECT
                </span>
              </div>

              {/* Column Headers */}
              <div className="grid grid-cols-[2.2em_1fr_5.5em_5.5em] sm:grid-cols-[2.5em_1fr_8em_5.5em_5.5em] gap-[0.75em] px-[1.25em] py-[0.65em] border-b border-[#222529] font-mono text-[0.68em] uppercase tracking-wider text-[#6c7584]">
                <span>#</span>
                <span>Narrative</span>
                <span className="hidden sm:block">Share Bar</span>
                <span className="text-right">Share</span>
                <span className="text-right">4H Vel</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-[#1e2228]">
                {filtered.map((row) => {
                  const isSelected = selected?.narrativeId === row.narrativeId;
                  const sharePct = (row.iBps / 100).toFixed(2);
                  const barPct = Math.max(4, Math.round((row.iBps / maxBps) * 100));
                  const vBps = row.vBps ?? 0;
                  const vPositive = vBps > 0;
                  const vNegative = vBps < 0;

                  return (
                    <button
                      key={row.narrativeId}
                      type="button"
                      onClick={() => setSelectedId(row.narrativeId)}
                      className={`w-full text-left grid grid-cols-[2.2em_1fr_5.5em_5.5em] sm:grid-cols-[2.5em_1fr_8em_5.5em_5.5em] gap-[0.75em] items-center px-[1.25em] py-[0.82em] transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#1c2026] border-l-2 border-l-[#CCFF00]"
                          : "hover:bg-[#171a1f] border-l-2 border-l-transparent"
                      }`}
                    >
                      <span className="font-mono text-[0.75em] text-[#6c7584] tabular-nums">
                        {String(row.rank).padStart(2, "0")}
                      </span>

                      <span className="flex items-center gap-[0.6em] min-w-0">
                        <span
                          className={`w-[1.65em] h-[1.65em] flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[#CCFF00] text-black"
                              : "bg-[#222529] text-[#c2c6cd]"
                          }`}
                        >
                          <SectorIcon
                            slug={row.slug}
                            className="w-[0.95em] h-[0.95em]"
                          />
                        </span>
                        <span className="text-[0.9375em] text-white truncate">
                          {row.label}
                        </span>
                      </span>

                      <span className="hidden sm:block h-[0.42em] bg-[#222529] overflow-hidden">
                        <span
                          className="block h-full transition-all duration-300"
                          style={{
                            width: `${barPct}%`,
                            backgroundColor: isSelected ? "#CCFF00" : "#6c7584",
                          }}
                        />
                      </span>

                      <span className="font-mono text-[0.8125em] text-white text-right tabular-nums">
                        {sharePct}%
                      </span>

                      <span
                        className={`font-mono text-[0.8125em] text-right tabular-nums ${
                          vPositive
                            ? "text-[#CCFF00]"
                            : vNegative
                              ? "text-[#ef4444]"
                              : "text-[#89919f]"
                        }`}
                      >
                        {vPositive ? `+${vBps}` : vBps} bps
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Narrative AI Signal Inspector */}
            {selected && (
              <div className="bg-[#131518] border border-[#343940] p-[1.5em] md:p-[2em] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-[1em] pb-[1.25em] border-b border-dashed border-[#343940]">
                    <div className="flex items-center gap-[0.75em]">
                      <div className="w-[2.75em] h-[2.75em] bg-[#CCFF00] text-black flex items-center justify-center shrink-0">
                        <SectorIcon
                          slug={selected.slug}
                          className="w-[1.45em] h-[1.45em]"
                        />
                      </div>
                      <div>
                        <div className="font-mono text-[0.7em] uppercase tracking-wider text-[#89919f]">
                          RANK #{selected.rank} · NARRATIVE ID #{selected.narrativeId}
                        </div>
                        <h3 className="text-[1.625em] md:text-[1.875em] font-normal leading-[1.1] tracking-[-0.03em] text-white">
                          {selected.label}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Key Telemetry Grid */}
                  <div className="grid grid-cols-2 gap-[0.85em] my-[1.5em]">
                    <div className="bg-[#0b0d10] border border-[#222529] p-[1em]">
                      <div className="font-mono text-[0.68em] uppercase tracking-wider text-[#89919f]">
                        Mindshare Share
                      </div>
                      <div className="mt-[0.35em] font-mono text-[1.75em] text-white leading-none tabular-nums">
                        {(selected.iBps / 100).toFixed(2)}%
                      </div>
                      <div className="mt-[0.35em] font-mono text-[0.72em] text-[#6c7584] tabular-nums">
                        {selected.iBps.toLocaleString()} / 10,000 bps
                      </div>
                    </div>

                    <div className="bg-[#0b0d10] border border-[#222529] p-[1em]">
                      <div className="font-mono text-[0.68em] uppercase tracking-wider text-[#89919f]">
                        4H Velocity
                      </div>
                      <div
                        className={`mt-[0.35em] font-mono text-[1.75em] leading-none tabular-nums ${
                          (selected.vBps ?? 0) > 0
                            ? "text-[#CCFF00]"
                            : (selected.vBps ?? 0) < 0
                              ? "text-[#ef4444]"
                              : "text-white"
                        }`}
                      >
                        {(selected.vBps ?? 0) > 0
                          ? `+${selected.vBps}`
                          : (selected.vBps ?? 0)}{" "}
                        <span className="text-[0.55em]">bps</span>
                      </div>
                      <div className="mt-[0.35em] font-mono text-[0.72em] text-[#6c7584]">
                        {(selected.vBps ?? 0) > 0
                          ? "Accelerating attention"
                          : (selected.vBps ?? 0) < 0
                            ? "Cooling attention"
                            : "Steady attention"}
                      </div>
                    </div>
                  </div>

                  {/* Verification Specs */}
                  <div className="space-y-[0.65em] font-mono text-[0.78em] text-[#c2c6cd]">
                    <div className="flex items-center justify-between py-[0.5em] border-b border-[#222529]">
                      <span className="text-[#89919f]">Classification</span>
                      <span>Deterministic AI · 1,500+ KOLs</span>
                    </div>
                    <div className="flex items-center justify-between py-[0.5em] border-b border-[#222529]">
                      <span className="text-[#89919f]">Oracle Settlement</span>
                      <span>EIP-712 2/3 Quorum · 4H Epoch</span>
                    </div>
                    <div className="flex items-center justify-between py-[0.5em] border-b border-[#222529]">
                      <span className="text-[#89919f]">Onchain Read</span>
                      <span className="text-[#CCFF00]">
                        latestScore({selected.narrativeId})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Actions */}
                <div className="mt-[1.75em] grid grid-cols-1 sm:grid-cols-2 gap-[0.75em]">
                  <a
                    href={`/narratives/${selected.narrativeId}`}
                    className="inline-flex items-center justify-center gap-[0.5em] bg-[#CCFF00] hover:bg-[#B8E600] text-black font-medium text-[0.875em] py-[0.85em] px-[1em] transition-colors"
                  >
                    <ScrambleText text="Inspect Narrative" trigger="hover" />
                    <ExternalArrowIcon className="w-[0.7em] h-[0.7em]" />
                  </a>
                  <a
                    href="/markets"
                    className="inline-flex items-center justify-center gap-[0.5em] bg-[#222529] hover:bg-[#2d3239] border border-[#343940] text-white text-[0.875em] py-[0.85em] px-[1em] transition-colors"
                  >
                    <ScrambleText text="Trade Pair Spread" trigger="hover" />
                    <SlideArrow className="w-[0.75em] h-[0.65em]" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
