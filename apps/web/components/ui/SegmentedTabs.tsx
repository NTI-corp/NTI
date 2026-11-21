"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

export type SegmentedTone = "neutral" | "lime" | "green" | "amber";

export interface SegmentedTabOption<T extends string> {
  value: T;
  label: React.ReactNode;
  tone?: SegmentedTone;
}

const TONE_INDICATOR: Record<SegmentedTone, string> = {
  neutral: "bg-[#1F1F23] border-[#3A3A40]",
  lime: "bg-[#1E1E21] border-[#CCFF00]/65",
  green: "bg-[#22C55E]/15 border-[#4ADE80]/50",
  amber: "bg-[#E2A856]/15 border-[#E2A856]/50",
};

const TONE_TEXT: Record<SegmentedTone, string> = {
  neutral: "text-[#F5F5F7]",
  lime: "text-[#CCFF00]",
  green: "text-[#4ADE80]",
  amber: "text-[#E2A856]",
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
    setRect({
      x: activeBtn.offsetLeft,
      y: activeBtn.offsetTop,
      w: activeBtn.offsetWidth,
      h: activeBtn.offsetHeight,
      visible: true,
    });
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
      className={`relative rounded-[2px] border border-[#26262A] bg-[#0D0D0E] p-0.5 ${
        fullWidth ? "grid" : "inline-flex flex-wrap items-center"
      } ${className}`}
      style={
        fullWidth
          ? { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 rounded-[1px] border ${
          TONE_INDICATOR[activeTone]
        } ${
          animateSlide
            ? "transition-[transform,width,height,background-color,border-color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
            className={`relative z-[1] cursor-pointer rounded-[1px] font-mono text-[11px] font-medium transition-colors duration-150 ${
              fullWidth ? "py-1.5 text-center" : "px-2.5 py-1"
            } ${
              active
                ? TONE_TEXT[tone]
                : "text-[#71717A] hover:text-[#F5F5F7]"
            } ${buttonClassName}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
