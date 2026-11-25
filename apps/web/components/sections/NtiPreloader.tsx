"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const REEL_ITEMS = [
  "PRIVACY / ZK",
  "AI AGENTS",
  "PREDICTION MARKETS",
  "PERP DEX",
  "REAL-WORLD ASSETS",
  "STABLECOINS",
  "NARRATIVE TOKEN INDEX",
] as const;

const PILLAR_COUNT = 5;

export function NtiPreloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inkFillRef = useRef<HTMLDivElement>(null);
  const reelTrackRef = useRef<HTMLDivElement>(null);
  const bpsRef = useRef<HTMLSpanElement>(null);
  const pillarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) {
      window.dispatchEvent(new Event("nti:intro"));
      setUnmounted(true);
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setUnmounted(true);
    };

    const ctx = gsap.context(() => {
      const state = { fill: 0, bps: 0 };
      const pillars = pillarRefs.current.filter(
        (el): el is HTMLDivElement => el !== null
      );

      const tl = gsap.timeline({
        onComplete: finish,
      });

      // 1. Liquid-solid bottom-to-top ink fill + monumental 10,000 BPS ramp
      tl.to(
        state,
        {
          fill: 1,
          bps: 10000,
          duration: 1.05,
          ease: "power3.inOut",
          onUpdate: () => {
            if (inkFillRef.current) {
              const topPct = ((1 - state.fill) * 100).toFixed(2);
              inkFillRef.current.style.clipPath = `inset(${topPct}% 0 0 0)`;
            }
            if (bpsRef.current) {
              bpsRef.current.textContent = Math.round(state.bps).toLocaleString(
                "en-US"
              );
            }
          },
        },
        0.05
      );

      // 2. Kinetic vertical narrative slot-reel snapping onto canonical title
      if (reelTrackRef.current) {
        const targetPct = ((REEL_ITEMS.length - 1) / REEL_ITEMS.length) * 100;
        tl.to(
          reelTrackRef.current,
          {
            yPercent: -targetPct,
            duration: 1.05,
            ease: "expo.inOut",
          },
          0.08
        );
      }

      // 3. Quick compression of monumental lockup right before curtain shear
      if (stageRef.current) {
        tl.to(
          stageRef.current,
          {
            scale: 0.93,
            opacity: 0,
            duration: 0.24,
            ease: "power2.in",
          },
          1.22
        );
      }

      // 4. Fire Hero entrance right as 5 alternating Volt pillars shear open
      tl.call(
        () => {
          window.dispatchEvent(new Event("nti:intro"));
        },
        [],
        1.32
      );

      if (pillars.length > 0) {
        tl.to(
          pillars,
          {
            yPercent: (idx: number) => (idx % 2 === 0 ? -104 : 104),
            duration: 0.68,
            stagger: {
              amount: 0.22,
              from: "center",
            },
            ease: "power4.inOut",
          },
          1.32
        );
      }
    }, root);

    const failsafe = window.setTimeout(() => {
      window.dispatchEvent(new Event("nti:intro"));
      finish();
    }, 3200);

    return () => {
      clearTimeout(failsafe);
      ctx.revert();
    };
  }, []);

  if (unmounted) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="fixed inset-0 z-[90] overflow-hidden pointer-events-none select-none"
    >
      {/* 5 Alternating Architectural Volt Columns */}
      <div className="absolute inset-0 grid grid-cols-5">
        {Array.from({ length: PILLAR_COUNT }).map((_, idx) => (
          <div
            key={idx}
            ref={(el) => {
              pillarRefs.current[idx] = el;
            }}
            className={`h-full w-full bg-[#CCFF00] will-change-transform ${
              idx < PILLAR_COUNT - 1 ? "border-r border-black/10" : ""
            }`}
          />
        ))}
      </div>

      {/* Monumental Swiss Brutalist Typography Lockup */}
      <div
        ref={stageRef}
        className="relative z-10 flex h-full w-full flex-col justify-between p-[clamp(1.25em,4vw,3.25em)] text-black"
      >
        {/* Top Sparse Eyebrow */}
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-black/75">
          <span>ROBINHOOD CHAIN · 4663</span>
          <span>4H MINDSHARE EPOCH</span>
        </div>

        {/* Centerpiece Oversized Monogram + Fill Sweep + Narrative Reel */}
        <div className="flex flex-col items-center justify-center text-center my-auto">
          <div className="relative inline-block leading-[0.82] font-bold tracking-[-0.065em] text-[clamp(5.2rem,19vw,15.5rem)]">
            {/* Ghost Outline Layer */}
            <span
              className="block select-none text-transparent"
              style={{
                WebkitTextStroke: "1.5px rgba(9, 11, 14, 0.28)",
              }}
            >
              NTI
            </span>

            {/* Bottom-to-Top Solid Black Ink Sweep Layer */}
            <div
              ref={inkFillRef}
              className="absolute inset-0 text-[#090B0E]"
              style={{ clipPath: "inset(100% 0 0 0)" }}
            >
              <span>NTI</span>
            </div>
          </div>

          {/* Rapid Narrative Slot-Reel snapping onto NARRATIVE TOKEN INDEX */}
          <div className="mt-[clamp(0.75em,2vh,1.5em)] h-[1.4em] overflow-hidden font-mono text-[clamp(0.72rem,1.25vw,0.95rem)] font-medium uppercase tracking-[0.22em] text-black">
            <div ref={reelTrackRef} className="will-change-transform">
              {REEL_ITEMS.map((item) => (
                <div
                  key={item}
                  className="flex h-[1.4em] items-center justify-center whitespace-nowrap"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Oversized Raw BPS Weight Counter (zero border/box) */}
        <div className="flex items-baseline justify-between border-t border-black/15 pt-[0.9em]">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">
            HAMILTON EQUILIBRIUM
          </span>
          <div className="font-mono text-[clamp(1.35rem,3vw,2.5rem)] font-semibold tracking-[-0.03em] tabular-nums leading-none text-[#090B0E]">
            <span ref={bpsRef}>0</span>
            <span className="ml-[0.3em] text-[0.42em] font-medium tracking-[0.12em] text-black/65">
              BPS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
