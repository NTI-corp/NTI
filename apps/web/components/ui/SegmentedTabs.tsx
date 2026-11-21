"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

export type SegmentedTone = "neutral" | "lime" | "green" | "amber";

export interface SegmentedTabOption<T extends string> {
  value: T;
  label: React.ReactNode;
  tone?: SegmentedTone;
}

const TONE_INDICATOR: Record<SegmentedTone, string> = {
  neutral: "bg-[#25252E] border-[#3A3A46]/80",
  lime: "bg-[#CCFF00]/15 border-[#CCFF00]/50",
  green: "bg-[#22C55E]/15 border-[#22C55E]/45",
  amber: "bg-[#F59E0B]/15 border-[#F59E0B]/45",
};

const TONE_TEXT: Record<SegmentedTone, string> = {
  neutral: "text-white",
  lime: "text-[#CCFF00]",
  green: "text-[#22C55E]",
  amber: "text-[#F59E0B]",
};

interface IndicatorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  fullWidth = false,
  className = "",
  buttonClassName = "",
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedTabOption<T>[];
  fullWidth?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mountedRef = useRef(false);
  const [animateSlide, setAnimateSlide] = useState(false);
  const [rect, setRect] = useState<IndicatorRect>({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    visible: false,
  });

  const measure = useCallback(() => {
    const activeBtn = btnRefs.current[value];
    if (!activeBtn) {
      setRect((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const next: IndicatorRect = {
      x: activeBtn.offsetLeft,
      y: activeBtn.offsetTop,
      w: activeBtn.offsetWidth,
      h: activeBtn.offsetHeight,
      visible: true,
    };
    setRect(next);
    if (!mountedRef.current) {
      mountedRef.current = true;
      requestAnimationFrame(() => setAnimateSlide(true));
    }
  }, [value]);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [measure, options.length]);

  const activeOption = options.find((o) => o.value === value);
  const activeTone: SegmentedTone = activeOption?.tone ?? "neutral";

  return (
    <div
      ref={rootRef}
      role="tablist"
      className={`relative rounded-lg border border-[#232325] bg-[#0D0D10] p-0.5 ${
        fullWidth ? "grid" : "inline-flex flex-wrap items-center"
      } ${className}`}
      style={
        fullWidth
          ? { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {/* Sliding pill indicator */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 rounded-md border ${
          TONE_INDICATOR[activeTone]
        } ${
          animateSlide
            ? "transition-[transform,width,height,background-color,border-color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            : ""
        }`}
        style={{
          width: `${rect.w}px`,
          height: `${rect.h}px`,
          transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
          opacity: rect.visible ? 1 : 0,
        }}
      />

      {options.map((opt) => {
        const active = opt.value === value;
        const tone = opt.tone ?? "neutral";
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[opt.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-[1] cursor-pointer rounded-md font-medium transition-colors duration-200 ${
              fullWidth ? "py-2 text-center" : "px-3 py-1"
            } ${
              active
                ? TONE_TEXT[tone]
                : "text-[#8A8A93] hover:text-white"
            } ${buttonClassName}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
