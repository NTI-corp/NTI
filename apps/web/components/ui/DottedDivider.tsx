import React from "react";

export function DottedDivider({
  color = "#4B515B",
  className = "w-full h-[2px]",
  withCornerSquares = false,
}: {
  color?: string;
  className?: string;
  withCornerSquares?: boolean;
}) {
  if (withCornerSquares) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="8"
        viewBox="0 0 1401 8"
        fill="none"
        className={className}
      >
        <path d="M4.10547 3.73438H1400.3" stroke={color} strokeWidth="2" strokeDasharray="2 10" />
        <rect x="0.722656" y="0.335938" width="6.79492" height="6.79492" fill="#CCFF00" />
        <rect x="1393.51" y="0.335938" width="6.79492" height="6.79492" fill="#CCFF00" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      viewBox="0 0 1440 2"
      fill="none"
      preserveAspectRatio="none"
      className={className}
    >
      <path
        d="M0 1L1440 0.999878"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="2 8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function DottedFrame({ color = "#C2C6CD" }: { color?: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `
          radial-gradient(circle, ${color} 1px, transparent 1px),
          radial-gradient(circle, ${color} 1px, transparent 1px),
          radial-gradient(circle, ${color} 1px, transparent 1px),
          radial-gradient(circle, ${color} 1px, transparent 1px)
        `,
        backgroundSize: "12px 2px, 12px 2px, 2px 12px, 2px 12px",
        backgroundPosition: "top left, bottom left, top left, top right",
        backgroundRepeat: "repeat-x, repeat-x, repeat-y, repeat-y",
      }}
    />
  );
}
