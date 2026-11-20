"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";
import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import { SectorIcon } from "./NtiLogos";

gsap.registerPlugin(ScrollTrigger);

const CARD_ACCENTS = [
  "#38BDF8",
  "#F59E0B",
  "#10B981",
  "#818CF8",
  "#2DD4BF",
  "#FB7185",
  "#60A5FA",
  "#FBBF24",
  "#A78BFA",
  "#94A3B8",
] as const;

export function PinnedNarrativeDeck({
  narratives,
  epochId,
}: {
  narratives: NarrativeIndexItem[];
  epochId: number | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const sorted = [...narratives].sort((a, b) => b.iBps - a.iBps);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const bar = barRef.current;
    if (!section || !track) return;

    const mm = gsap.matchMedia();
    mm.add(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
      () => {
        const getScrollDistance = () =>
          Math.max(0, track.scrollWidth - window.innerWidth + 96);

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${Math.max(900, getScrollDistance() * 1.15)}`,
            pin: true,
            scrub: 0.65,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.to(
          track,
          {
            x: () => -getScrollDistance(),
            ease: "none",
          },
          0,
        );

        if (bar) {
          tl.fromTo(
            bar,
            { scaleX: 0.08 },
            { scaleX: 1, ease: "none" },
            0,
          );
        }
      },
    );

    return () => mm.revert();
  }, []);

  return (
    <section
      id="narratives"
      ref={sectionRef}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden border-y border-[#1D2230] bg-[#0B0D13] py-16 lg:py-0"
    >
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-[#242B3D] bg-[#121622] px-3 py-1 text-[11px] font-medium text-[#38BDF8]"
              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
            >
              <Flame className="h-3.5 w-3.5 text-[#F59E0B]" />
              <span>Tracked Sectors · Scroll Deck</span>
            </span>
            <h2
              className="mt-3 text-3xl font-bold tracking-tight text-[#F4F6FA] sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              Ten Narratives. One Distribution.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#94A0B8] sm:text-base">
              Scroll across all ten crypto sectors normalized to exactly 10,000 basis points
              {epochId ? ` in Epoch #${epochId}.` : "."}
            </p>
          </div>

          <Link
            href="/terminal"
            className="inline-flex items-center gap-2 rounded-xl border border-[#2B3345] bg-[#121622] px-4 py-2.5 text-xs font-semibold text-[#F4F6FA] transition-colors hover:border-[#38BDF8]"
          >
            <span>Inspect Matrix</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#38BDF8]" />
          </Link>
        </div>

        {/* Horizontal Scroll-Driven Progress Rail */}
        <div className="mt-6 h-[2px] w-full overflow-hidden rounded-full bg-[#1C2130]">
          <div
            ref={barRef}
            className="h-full w-full origin-left bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#F59E0B]"
          />
        </div>
      </div>

      {/* Horizontal Card Track (Pinned on lg+, swipeable overflow on smaller screens) */}
      <div className="mt-8 w-full overflow-x-auto px-4 pb-4 sm:px-8 lg:overflow-visible lg:pb-0">
        <div
          ref={trackRef}
          className="flex w-max gap-4 will-change-transform lg:pl-[max(2rem,calc((100vw-1440px)/2+2rem))]"
        >
          {sorted.map((n, idx) => {
            const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length] ?? "#38BDF8";
            const barWidth = Math.min(100, Math.max(6, (n.iBps / 2600) * 100));
            const isPos = (n.vBps ?? 0) >= 0;

            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                className="group flex w-[290px] shrink-0 flex-col justify-between rounded-2xl border border-[#222836] bg-[#10131C] p-6 transition-colors hover:border-[#38BDF8]/60 hover:bg-[#141824] sm:w-[320px]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#252D40] bg-[#0B0D13]"
                      style={{ color: accent }}
                    >
                      <SectorIcon slug={n.slug} className="h-5 w-5" />
                    </div>
                    <span
                      className="rounded-full border border-[#242B3D] bg-[#0B0D13] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-[#94A0B8]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      Rank #{idx + 1}
                    </span>
                  </div>

                  <h3
                    className="mt-5 text-xl font-bold text-[#F4F6FA] group-hover:text-[#38BDF8]"
                    style={{ fontFamily: "var(--font-syne), sans-serif" }}
                  >
                    {n.label}
                  </h3>
                  <p className="mt-1.5 min-h-[40px] text-xs leading-relaxed text-[#94A0B8]">
                    {n.description}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-3xl font-bold tabular-nums text-[#F4F6FA]"
                        style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                      >
                        {formatBpsPercent(n.iBps)}
                      </span>
                      <span
                        className="text-xs tabular-nums text-[#64748B]"
                        style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                      >
                        {n.iBps.toLocaleString("en-US")} bps
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1C2130]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${barWidth}%`, backgroundColor: accent }}
                      />
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between border-t border-[#1D2230] pt-3 text-[11px]"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    <span
                      className={
                        n.vBps === null
                          ? "text-[#64748B]"
                          : isPos
                            ? "text-[#10B981]"
                            : "text-[#FB7185]"
                      }
                    >
                      {n.vBps !== null ? `Vel ${formatSignedBps(n.vBps)}` : `Decay ${n.sN.toFixed(1)}`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#CBD5E1] group-hover:text-[#38BDF8]">
                      <span>Inspect</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
