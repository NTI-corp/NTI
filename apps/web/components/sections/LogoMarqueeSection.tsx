"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT, type SectorTickerItem } from "@/content/home";
import { SectorIcon } from "@/components/ui/Icons";

export function LogoMarqueeSection() {
  const { marquee } = HOME_CONTENT;
  const headingWrapRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [sectors, setSectors] = useState<SectorTickerItem[]>(marquee.sectors);

  const words = marquee.heading.split(" ");
  const trackItems = [...sectors, ...sectors];

  useEffect(() => {
    let cancelled = false;
    fetch(marquee.apiUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          snapshot: {
            narratives?: Array<{
              narrativeId?: number;
              slug?: string;
              label?: string;
              iBps?: number;
              vBps?: number | null;
            }>;
          } | null
        ) => {
          if (cancelled || !snapshot || !Array.isArray(snapshot.narratives) || snapshot.narratives.length === 0) {
            return;
          }
          const next: SectorTickerItem[] = snapshot.narratives
            .filter(
              (n): n is { narrativeId: number; slug: string; label: string; iBps: number; vBps?: number | null } =>
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
    const el = headingWrapRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const spans = wordsRef.current.filter(Boolean);
      if (!spans.length) return;
      gsap.fromTo(
        spans,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.05,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section className="w-full bg-white text-black pt-[4.5em] pb-[4.5em] md:pt-[5.5em] md:pb-[5.5em] overflow-hidden">
      <div ref={headingWrapRef} className="sui-padding-global mb-[3em]">
        <div className="sui-container-1400 overflow-hidden">
          <h2 className="text-[1.25em] md:text-[1.688em] font-normal leading-[1.2] tracking-[-0.025em] text-black text-center">
            {words.map((word, idx) => (
              <span
                key={`${word}-${idx}`}
                ref={(node) => {
                  wordsRef.current[idx] = node;
                }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </span>
            ))}
          </h2>
        </div>
      </div>

      {/* Infinite Continuous Unboxed Sector Marquee */}
      <div className="relative w-full overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[6em] z-10 bg-gradient-to-r from-white to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[6em] z-10 bg-gradient-to-l from-white to-transparent"
        />

        <div className="sui-marquee-track items-center">
          {trackItems.map((sector, idx) => {
            const positive = (sector.vBps ?? 0) >= 0;
            return (
              <a
                key={`${sector.slug}-${idx}`}
                href={`/narratives/${sector.narrativeId}`}
                className="group flex items-center gap-[0.65em] shrink-0 px-[1.6em] md:px-[2.2em] text-[#7a808a] hover:text-black transition-colors duration-200 select-none"
              >
                <SectorIcon
                  slug={sector.slug}
                  className="w-[1.8em] h-[1.8em] md:w-[2.1em] md:h-[2.1em] shrink-0 text-[#8b919c] group-hover:text-black transition-colors duration-200"
                />

                <span className="text-[1.4em] md:text-[1.8em] font-medium leading-none tracking-[-0.03em] whitespace-nowrap">
                  {sector.label}
                </span>

                <span className="font-mono text-[0.82em] md:text-[0.9em] tracking-[-0.015em] text-[#9aa0ab] group-hover:text-[#4b515b] tabular-nums whitespace-nowrap transition-colors duration-200">
                  {sector.iBps.toLocaleString("en-US")} bps
                </span>

                {sector.vBps !== null && (
                  <span
                    className={`font-mono text-[0.78em] md:text-[0.85em] font-medium tabular-nums whitespace-nowrap transition-colors duration-200 ${
                      positive
                        ? "text-[#4c7a00] group-hover:text-[#2e4d00]"
                        : "text-[#b0b5bf] group-hover:text-[#666d78]"
                    }`}
                  >
                    {positive ? `+${sector.vBps}` : sector.vBps}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
