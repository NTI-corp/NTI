"use client";

import React, { useEffect, useRef, useState } from "react";
import { HOME_CONTENT } from "@/content/home";
import { DottedDivider } from "@/components/ui/DottedDivider";
import { PolicyEditIcon } from "@/components/ui/Icons";
import { LottieIcon } from "@/components/ui/LottieIcon";

const FLASH_PALETTES = [
  { bg: "#CCFF00", color: "#000000" },
  { bg: "#ABB2B9", color: "#000103" },
  { bg: "#000000", color: "#FEFEFE" },
];
const SCRAMBLE_GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!$^*()-_=+[]{}";

function HighlightScrambleTitle({ text }: { text: string }) {
  const hostRef = useRef<HTMLHeadingElement>(null);
  const words = text.split(" ");
  const hasPlayedRef = useRef(false);

  const [charStates, setCharStates] = useState<
    Array<
      Array<{
        ch: string;
        visible: boolean;
        bg: string;
        color: string;
      }>
    >
  >(() =>
    words.map((w) =>
      w.split("").map((ch) => ({
        ch,
        visible: true,
        bg: "transparent",
        color: "#000000",
      }))
    )
  );

  const runFlashScramble = () => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Initial hidden state
    setCharStates(
      words.map((w) =>
        w.split("").map((ch) => ({
          ch,
          visible: false,
          bg: "transparent",
          color: "#000000",
        }))
      )
    );

    let globalIdx = 0;
    words.forEach((word, wIdx) => {
      const palette = FLASH_PALETTES[wIdx % FLASH_PALETTES.length] ?? FLASH_PALETTES[0]!;
      word.split("").forEach((origCh, cIdx) => {
        const delay = globalIdx * 24;
        globalIdx++;

        // Step 1: Flash colored block + random glyph
        const t1 = setTimeout(() => {
          const randCh =
            SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)] ?? origCh;
          setCharStates((prev) =>
            prev.map((wArr, wi) =>
              wi === wIdx
                ? wArr.map((cell, ci) =>
                    ci === cIdx
                      ? {
                          ch: randCh,
                          visible: true,
                          bg: palette.bg,
                          color: palette.color,
                        }
                      : cell
                  )
                : wArr
            )
          );
        }, delay);

        // Step 2: Settle to crisp black final character
        const t2 = setTimeout(() => {
          setCharStates((prev) =>
            prev.map((wArr, wi) =>
              wi === wIdx
                ? wArr.map((cell, ci) =>
                    ci === cIdx
                      ? {
                          ch: origCh,
                          visible: true,
                          bg: "transparent",
                          color: "#000000",
                        }
                      : cell
                  )
                : wArr
            )
          );
        }, delay + 85);

        timers.push(t1, t2);
      });
    });

    return () => timers.forEach(clearTimeout);
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cleanupTimers: (() => void) | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasPlayedRef.current) {
          hasPlayedRef.current = true;
          cleanupTimers = runFlashScramble();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cleanupTimers?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <h3
      ref={hostRef}
      onMouseEnter={() => {
        runFlashScramble();
      }}
      className="text-[1.875em] sm:text-[2.65em] md:text-[3.75em] font-normal leading-[1.06] tracking-[-0.035em] text-black select-none"
    >
      {words.map((word, wIdx) => (
        <span key={`${word}-${wIdx}`} className="inline-block mr-[0.25em]">
          {(charStates[wIdx] ?? []).map((cell, cIdx) => (
            <span
              key={`${wIdx}-${cIdx}`}
              style={{
                opacity: cell.visible ? 1 : 0,
                backgroundColor: cell.bg,
                color: cell.color,
                display: "inline-block",
              }}
            >
              {cell.ch}
            </span>
          ))}
        </span>
      ))}
    </h3>
  );
}

export function SuiIsSection() {
  const { suiIs } = HOME_CONTENT;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <section className="w-full bg-white text-black pt-[1em] pb-0">
      {/* Section Header */}
      <div className="sui-padding-global pb-[2em]">
        <div className="sui-container-1400 flex items-center gap-[0.85em]">
          <span className="font-mono text-[0.875em] text-[#4b515b] tracking-[-0.02em]">
            {suiIs.prefix}
          </span>
          <span className="inline-block bg-[#e0e2e6] text-[#131518] font-mono text-[0.75em] leading-[1.2] px-[0.75em] py-[0.4em]">
            {suiIs.badge}
          </span>
        </div>
      </div>

      {/* Capability Rows (.home-tabs_layout bg-[#f4f5f7]) */}
      <div className="w-full bg-[#f4f5f7] pb-[3.5em]">
        <DottedDivider color="#a1a7b2" />
        {suiIs.items.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <React.Fragment key={item.title}>
              <div
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group transition-colors duration-200 hover:bg-[#e9ecf0]"
              >
                <div className="sui-padding-global">
                  <div className="sui-container-1400 grid grid-cols-1 md:grid-cols-[0.22fr_1fr_auto] items-center gap-[1.25em] py-[2em] md:py-[2.65em]">
                    <div className="hidden md:block font-mono text-[0.75em] tracking-wider text-[#6c7584]">
                      {item.tag}
                    </div>

                    <HighlightScrambleTitle text={item.title} />

                    <div className="w-[3.25em] h-[3.25em] md:w-[4em] md:h-[4em] bg-[#CCFF00] text-black flex items-center justify-center shrink-0 justify-self-start md:justify-self-end transition-transform duration-200 group-hover:scale-[1.04]">
                      {item.kind === "svg" ? (
                        <PolicyEditIcon className="w-[1.65em] h-[1.65em]" />
                      ) : (
                        item.lottieSrc && (
                          <LottieIcon
                            src={item.lottieSrc}
                            playOnScroll
                            isHovered={isHovered}
                            className="w-[2.4em] h-[2.4em] brightness-0"
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <DottedDivider color="#a1a7b2" />
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
