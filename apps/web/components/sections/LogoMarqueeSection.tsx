"use client";

import React, { useEffect, useState } from "react";
import { HOME_CONTENT, type SectorTickerItem } from "@/content/home";
import { SectorIcon } from "@/components/ui/Icons";

export function LogoMarqueeSection() {
  const { marquee } = HOME_CONTENT;
  const [sectors, setSectors] = useState<SectorTickerItem[]>(marquee.sectors);

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

  return (
    <section className="marquee-portal-section relative z-[5] w-full bg-white text-black">
      <div className="marquee-portal-sticky sticky top-0 h-[100svh] w-full overflow-hidden flex flex-col justify-center pt-[4.5em] pb-[2em]">
        {/* Driven synchronously by HeroSection's zoom portal (--marquee-scale, --marquee-opacity, --marquee-y) */}
        <div
          data-marquee-portal=""
          className="marquee-portal-stage w-full flex flex-col will-change-transform origin-center"
        >
          {/* Editorial Top Hairline Metadata */}
          <div className="sui-padding-global">
            <div className="sui-container-1400 border-t border-b border-black/10 py-[0.85em] flex items-center justify-between gap-[1em] font-mono text-[0.7em] tracking-[0.08em] uppercase text-[#4b515b]">
              <span>01 / MINDSHARE INDEX</span>
              <span className="hidden sm:inline">10 SECTORS · 4H EPOCHS</span>
              <span>ROBINHOOD CHAIN · 46630</span>
            </div>
          </div>

          {/* Primary Reveal Heading */}
          <div className="sui-padding-global mt-[2.25em] mb-[2.25em] md:mt-[3em] md:mb-[3em]">
            <div className="sui-container-1400">
              <h2 className="text-[2em] sm:text-[2.75em] md:text-[3.5em] font-normal leading-[1.06] tracking-[-0.04em] text-black text-center max-w-[16em] mx-auto">
                {marquee.heading}
              </h2>
            </div>
          </div>

          {/* Infinite Continuous Sector Marquee */}
          <div className="relative w-full overflow-hidden border-y border-black/10 py-[1.75em] md:py-[2.25em]">
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
                    className="group flex items-center gap-[0.65em] shrink-0 px-[1.6em] md:px-[2.4em] text-[#7a808a] hover:text-black transition-colors duration-200 select-none"
                  >
                    <SectorIcon
                      slug={sector.slug}
                      className="w-[1.85em] h-[1.85em] md:w-[2.2em] md:h-[2.2em] shrink-0 text-[#8b919c] group-hover:text-black transition-colors duration-200"
                    />

                    <span className="text-[1.45em] md:text-[1.95em] font-medium leading-none tracking-[-0.03em] whitespace-nowrap">
                      {sector.label}
                    </span>

                    <span className="font-mono text-[0.82em] md:text-[0.92em] tracking-[-0.015em] text-[#9aa0ab] group-hover:text-[#4b515b] tabular-nums whitespace-nowrap transition-colors duration-200">
                      {sector.iBps.toLocaleString("en-US")} bps
                    </span>

                    {sector.vBps !== null && (
                      <span
                        className={`font-mono text-[0.78em] md:text-[0.86em] font-medium tabular-nums whitespace-nowrap transition-colors duration-200 ${
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

          {/* Bottom Deterministic Settlement Spec Row */}
          <div className="sui-padding-global mt-[2em] md:mt-[2.5em]">
            <div className="sui-container-1400 flex flex-wrap items-center justify-between gap-[0.75em] font-mono text-[0.68em] tracking-[0.07em] uppercase text-[#6c7584]">
              <span>HAMILTON EQUILIBRIUM · 10,000 BPS SUM</span>
              <span>EMA SMOOTHED · 2-OF-3 EIP-712 QUORUM</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
