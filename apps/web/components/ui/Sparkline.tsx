import React from "react";

interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  /** Fill the area under the line with a soft gradient. */
  area?: boolean;
  className?: string;
}

/** Tiny dependency-free SVG trend line. Renders a flat dashed baseline when there is not enough history. */
export function Sparkline({
  values,
  color = "#CCFF00",
  width = 96,
  height = 28,
  area = true,
  className,
}: SparklineProps) {
  const id = React.useId().replace(/[:]/g, "");
  const pad = 2;
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <line
          x1={pad}
          x2={width - pad}
          y1={height / 2}
          y2={height / 2}
          stroke="#3A3A3D"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const areaPath = `${line} L${last[0].toFixed(1)},${height} L${pts[0]![0].toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#sp-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  );
}
