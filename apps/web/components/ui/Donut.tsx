"use client";

import React, { useState } from "react";

export interface DonutSlice {
  id: number | string;
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

/** SVG donut with hover highlight; the center shows the hovered slice or the supplied summary. */
export function Donut({ slices, size = 220, thickness = 26, centerLabel, centerValue }: DonutProps) {
  const [hover, setHover] = useState<number | string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2.5;
  let offset = 0;
  const active = slices.find((s) => s.id === hover) ?? null;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Mindshare distribution">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#151516" strokeWidth={thickness} />
        {slices.map((s) => {
          const len = Math.max(0, (s.value / total) * c - gap);
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.id ? thickness + 5 : thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              opacity={hover && hover !== s.id ? 0.35 : 1}
              style={{ transition: "stroke-width 150ms, opacity 150ms", cursor: "pointer" }}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
            />
          );
          offset += (s.value / total) * c;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-mono uppercase tracking-[0.16em] text-[#71717A]"
          style={{ fontSize: size < 140 ? 8 : 10 }}
        >
          {active ? active.label : centerLabel}
        </span>
        <span
          className="mt-0.5 font-display font-extrabold tracking-tight text-white"
          style={{ fontSize: Math.max(16, Math.round(size * 0.16)) }}
        >
          {active ? `${((active.value / total) * 100).toFixed(1)}%` : centerValue}
        </span>
      </div>
    </div>
  );
}
