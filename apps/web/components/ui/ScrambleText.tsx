"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!$^*()-_=+[]{}";

export function ScrambleText({
  text,
  className = "",
  trigger = "hover",
  hoverColor,
  externalTrigger = 0,
}: {
  text: string;
  className?: string;
  trigger?: "hover" | "scroll";
  hoverColor?: string;
  externalTrigger?: number;
}) {
  const [scrambled, setScrambled] = useState<{
    base: string;
    value: string;
  } | null>(null);
  const display = scrambled?.base === text ? scrambled.value : text;
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);
  const elRef = useRef<HTMLSpanElement>(null);
  const playedRef = useRef(false);
  const [lockedWidth, setLockedWidth] = useState<number | null>(null);

  const runScramble = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (elRef.current && !lockedWidth) {
      setLockedWidth(elRef.current.getBoundingClientRect().width);
    }
    const start = performance.now();
    const duration = Math.min(600, Math.max(260, text.length * 18));

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const settledCount = Math.floor(progress * text.length);
      const next = text
        .split("")
        .map((ch, idx) => {
          if (ch === " ") return " ";
          if (idx < settledCount) return ch;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      if (progress < 1) {
        setScrambled({ base: text, value: next });
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setScrambled(null);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [text, lockedWidth]);

  useEffect(() => {
    if (externalTrigger > 0) {
      runScramble();
    }
  }, [externalTrigger, runScramble]);

  useEffect(() => {
    if (trigger !== "scroll" || !elRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !playedRef.current) {
            playedRef.current = true;
            runScramble();
          }
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(elRef.current);
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [trigger, runScramble]);

  return (
    <span
      ref={elRef}
      className={className}
      style={{
        ...(active && hoverColor ? { color: hoverColor } : {}),
        ...(lockedWidth && scrambled
          ? {
              display: "inline-block",
              minWidth: `${lockedWidth}px`,
              whiteSpace: "nowrap",
            }
          : {}),
      }}
      onMouseEnter={
        trigger === "hover"
          ? () => {
              setActive(true);
              runScramble();
            }
          : undefined
      }
      onMouseLeave={
        trigger === "hover"
          ? () => {
              setActive(false);
            }
          : undefined
      }
    >
      {display}
    </span>
  );
}
