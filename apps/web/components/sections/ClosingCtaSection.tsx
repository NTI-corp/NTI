"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DottedFrame } from "@/components/ui/DottedDivider";
import { RobinhoodMark, SlideArrow } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

export function ClosingCtaSection() {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.65,
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
    <section className="w-full bg-[#090B0E] text-white pt-[1em] pb-[4.5em] md:pb-[6em]">
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          <div
            ref={cardRef}
            className="relative bg-[#131518] px-[1.75em] py-[3.25em] sm:px-[3em] md:px-[4.5em] md:py-[4.75em] overflow-hidden"
          >
            <DottedFrame color="#4b515b" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-[2.5em]">
              <div className="max-w-[42em]">
                <div className="inline-flex items-center gap-[0.7em] mb-[1.25em] font-mono text-[0.75em] tracking-[0.04em] text-[#c2c6cd]">
                  <PixelOwlMascot
                    variant="rocket"
                    size={30}
                    label="8-bit Narrative Rocket"
                  />
                  <RobinhoodMark className="h-[1.05em] w-auto inline-block -mt-[0.05em]" />
                  <span>ROBINHOOD CHAIN TESTNET · 46630</span>
                </div>

                <h2 className="text-[2.25em] sm:text-[3.5em] md:text-[4.5em] font-normal leading-[1] tracking-[-0.045em] text-white">
                  Price attention before the{" "}
                  <span className="text-[#CCFF00]">chart moves</span>
                </h2>

                <p className="mt-[1.15em] text-[0.95em] md:text-[1.1em] leading-[1.45] text-[#c2c6cd] max-w-[34em]">
                  Track 10 AI-scored crypto narratives every 4 hours, trade relative mindshare spreads, or wire verifiable oracle roots directly into your agent.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-[0.75em] shrink-0">
                <a
                  href="/terminal"
                  className="inline-flex items-center gap-[0.65em] bg-[#CCFF00] hover:bg-[#B8E600] text-black font-medium text-[0.9375em] px-[1.6em] py-[0.95em] transition-colors whitespace-nowrap"
                >
                  <ScrambleText text="Launch AI Terminal" trigger="hover" />
                  <SlideArrow className="w-[0.8em] h-[0.7em]" />
                </a>
                <a
                  href="/markets"
                  className="inline-flex items-center gap-[0.55em] bg-white hover:bg-[#e0e2e6] text-black font-normal text-[0.9375em] px-[1.5em] py-[0.95em] transition-colors whitespace-nowrap"
                >
                  <ScrambleText text="Explore Markets" trigger="hover" />
                </a>
                <a
                  href="/docs"
                  className="inline-flex items-center gap-[0.5em] bg-[#222529] hover:bg-[#2d3239] border border-[#343940] text-white font-mono text-[0.8125em] px-[1.25em] py-[1.05em] transition-colors whitespace-nowrap"
                >
                  <ScrambleText text="Docs" trigger="hover" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
