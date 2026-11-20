"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent, formatSignedBps } from "@/lib/format";
import { SectorIcon } from "./NtiLogos";

gsap.registerPlugin(ScrollTrigger);

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
          Math.max(0, track.scrollWidth - window.innerWidth + 112);

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
          tl.fromTo(bar, { scaleX: 0.08 }, { scaleX: 1, ease: "none" }, 0);
        }
      },
    );

    return () => mm.revert();
  }, []);

  return (
    <section
      id="narratives"
      ref={sectionRef}
      className="relative flex min-h-screen w-full flex-col justify-center overflow-hidden border-y border-[#1B1F27] bg-[#0A0C10] py-16 lg:py-0"
    >
      <div className="mx-auto w-full max-w-[1680px] px-5 sm:px-8 lg:px-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span
              className="text-xs font-medium uppercase tracking-wider text-[#34D399]"
              style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
            >
              Tracked Sectors
            </span>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight text-[#F5F6F8] sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "var(--font-outfit), sans-serif" }}
            >
              Ten Narratives. One Distribution.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#9CA3AF] sm:text-base">
              All ten crypto verticals normalized to 10,000 basis points
              {epochId ? ` in Epoch #${epochId}.` : "."}
            </p>
          </div>

          <Link
            href="/terminal"
            className="inline-flex items-center gap-2 rounded-xl border border-[#272C36] bg-[#11141B] px-4 py-2.5 text-xs font-semibold text-[#F5F6F8] transition-colors hover:border-[#34D399]"
          >
            <span>Inspect Matrix</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#34D399]" />
          </Link>
        </div>

        {/* Single-Tone Progress Rail */}
        <div className="mt-6 h-[2px] w-full overflow-hidden rounded-full bg-[#1A1E26]">
          <div
            ref={barRef}
            className="h-full w-full origin-left bg-[#34D399]"
          />
        </div>
      </div>

      {/* Edge-to-Edge Horizontal Card Track */}
      <div className="mt-8 w-full overflow-x-auto px-5 pb-4 sm:px-8 lg:overflow-visible lg:px-0 lg:pb-0">
        <div
          ref={trackRef}
          className="flex w-max gap-4 will-change-transform lg:pl-14 xl:pl-[max(3.5rem,calc((100vw-1680px)/2+3.5rem))]"
        >
          {sorted.map((n, idx) => {
            const barWidth = Math.min(100, Math.max(6, (n.iBps / 2600) * 100));
            const isLeader = idx === 0;
            const isPos = (n.vBps ?? 0) >= 0;

            return (
              <Link
                key={n.narrativeId}
                href={`/narratives/${n.narrativeId}`}
                className={`group flex w-[290px] shrink-0 flex-col justify-between rounded-2xl border p-6 transition-colors sm:w-[325px] ${
                  isLeader
                    ? "border-[#34D399]/40 bg-[#10141A] hover:border-[#34D399]"
                    : "border-[#1E222B] bg-[#0E1015] hover:border-[#363D4D] hover:bg-[#12151C]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[#232833] bg-[#08090C] ${
                        isLeader ? "text-[#34D399]" : "text-[#D1D5DB]"
                      }`}
                    >
                      <SectorIcon slug={n.slug} className="h-5 w-5" />
                    </div>
                    <span
                      className="rounded-full border border-[#232833] bg-[#08090C] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-[#9CA3AF]"
                      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                    >
                      Rank #{idx + 1}
                    </span>
                  </div>

                  <h3
                    className="mt-5 text-xl font-bold text-[#F5F6F8] group-hover:text-[#34D399]"
                    style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                  >
                    {n.label}
                  </h3>
                  <p className="mt-1.5 min-h-[40px] text-xs leading-relaxed text-[#9CA3AF]">
                    {n.description}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-3xl font-bold tabular-nums text-[#F5F6F8]"
                        style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                      >
                        {formatBpsPercent(n.iBps)}
                      </span>
                      <span
                        className="text-xs tabular-nums text-[#6B7280]"
                        style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                      >
                        {n.iBps.toLocaleString("en-US")} bps
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1A1E26]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: isLeader ? "#34D399" : "#9CA3AF",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between border-t border-[#1A1E26] pt-3 text-[11px]"
                    style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
                  >
                    <span
                      className={
                        n.vBps === null
                          ? "text-[#6B7280]"
                          : isPos
                            ? "text-[#34D399]"
                            : "text-[#FB7185]"
                      }
                    >
                      {n.vBps !== null ? `Vel ${formatSignedBps(n.vBps)}` : `Decay ${n.sN.toFixed(1)}`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#D1D5DB] group-hover:text-[#34D399]">
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
