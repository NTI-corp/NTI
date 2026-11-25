"use client";

import React from "react";

export type PixelMascotKind =
  | "owl"
  | "bull"
  | "bot"
  | "whale"
  | "rocket"
  | "sentinel";

interface PixelOwlMascotProps {
  /** Which 8-bit character sprite to render. */
  variant?: PixelMascotKind | "default" | "trader" | "builder" | "perched";
  size?: number;
  className?: string;
  label?: string;
}

function normalizeKind(variant: PixelOwlMascotProps["variant"]): PixelMascotKind {
  if (variant === "trader") return "bull";
  if (variant === "builder") return "bot";
  if (variant === "default" || variant === "perched" || !variant) return "owl";
  return variant;
}

/**
 * Collection of 6 distinct hand-crafted 20x20 8-bit pixel-art NTI mascots
 * (`owl`, `bull`, `bot`, `whale`, `rocket`, `sentinel`) rendered on an integer
 * pixel grid with `shapeRendering="crispEdges"`.
 */
export function PixelOwlMascot({
  variant = "owl",
  size = 36,
  className = "",
  label,
}: PixelOwlMascotProps) {
  const kind = normalizeKind(variant);

  return (
    <span
      className={`group inline-flex items-center gap-2 select-none ${className}`}
      title={label ?? `NTI 8-bit ${kind}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="shrink-0 transition-transform duration-200 group-hover:-translate-y-1"
      >
        {kind === "owl" && (
          <>
            {/* 01: 8-bit Cyber Owl with Candlestick Eyes */}
            <rect x="4" y="1" width="1" height="1" fill="#9CA3AF" />
            <rect x="5" y="2" width="1" height="1" fill="#CCFF00" />
            <rect x="4" y="2" width="1" height="2" fill="#525B69" />
            <rect x="5" y="3" width="2" height="1" fill="#6B7280" />
            <rect x="15" y="1" width="1" height="1" fill="#9CA3AF" />
            <rect x="14" y="2" width="1" height="1" fill="#CCFF00" />
            <rect x="15" y="2" width="1" height="2" fill="#525B69" />
            <rect x="13" y="3" width="2" height="1" fill="#6B7280" />
            <rect x="6" y="3" width="8" height="1" fill="#9CA3AF" />
            <rect x="5" y="4" width="10" height="5" fill="#3F4652" />
            <rect x="4" y="5" width="12" height="3" fill="#2A2F38" />
            <rect x="5" y="4" width="3" height="1" fill="#CCFF00" />
            <rect x="12" y="4" width="3" height="1" fill="#CCFF00" />
            <rect x="5" y="5" width="4" height="3" fill="#06070A" />
            <rect x="11" y="5" width="4" height="3" fill="#06070A" />
            <rect x="6" y="6" width="1" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="7" y="5" width="1" height="2" fill="#EF4444" />
            <rect x="8" y="5" width="1" height="3" fill="#CCFF00" className="animate-pulse" />
            <rect x="11" y="6" width="1" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="12" y="5" width="1" height="2" fill="#EF4444" />
            <rect x="13" y="5" width="1" height="3" fill="#CCFF00" className="animate-pulse" />
            <rect x="9" y="7" width="2" height="2" fill="#CCFF00" />
            <rect x="9" y="9" width="2" height="1" fill="#84CC16" />
            <rect x="4" y="9" width="12" height="6" fill="#2A2F38" />
            <rect x="5" y="10" width="10" height="5" fill="#4B5563" />
            <rect x="3" y="10" width="2" height="5" fill="#6B7280" />
            <rect x="3" y="11" width="1" height="3" fill="#CCFF00" />
            <rect x="15" y="10" width="2" height="5" fill="#6B7280" />
            <rect x="16" y="11" width="1" height="3" fill="#CCFF00" />
            <rect x="8" y="11" width="4" height="3" fill="#111318" />
            <rect x="9" y="11" width="2" height="1" fill="#CCFF00" />
            <rect x="9" y="13" width="2" height="1" fill="#CCFF00" />
            <rect x="8" y="12" width="1" height="1" fill="#CCFF00" />
            <rect x="11" y="12" width="1" height="1" fill="#CCFF00" />
            <rect x="6" y="15" width="8" height="1" fill="#374151" />
            <rect x="6" y="16" width="2" height="2" fill="#6B7280" />
            <rect x="12" y="16" width="2" height="2" fill="#6B7280" />
            <rect x="5" y="18" width="4" height="1" fill="#9CA3AF" />
            <rect x="11" y="18" width="4" height="1" fill="#9CA3AF" />
            <rect x="6" y="18" width="1" height="1" fill="#CCFF00" />
            <rect x="13" y="18" width="1" height="1" fill="#CCFF00" />
          </>
        )}

        {kind === "bull" && (
          <>
            {/* 02: 8-bit Cyber Bull with Neon #CCFF00 Horns */}
            <rect x="2" y="2" width="2" height="2" fill="#CCFF00" />
            <rect x="3" y="4" width="2" height="2" fill="#A3E635" />
            <rect x="4" y="5" width="2" height="2" fill="#6B7280" />
            <rect x="16" y="2" width="2" height="2" fill="#CCFF00" />
            <rect x="15" y="4" width="2" height="2" fill="#A3E635" />
            <rect x="14" y="5" width="2" height="2" fill="#6B7280" />
            {/* Armored bull head */}
            <rect x="6" y="5" width="8" height="2" fill="#525B69" />
            <rect x="5" y="7" width="10" height="6" fill="#2A2F38" />
            <rect x="6" y="7" width="8" height="5" fill="#3F4652" />
            {/* Visor & glowing #CCFF00 eyes */}
            <rect x="6" y="8" width="8" height="2" fill="#06070A" />
            <rect x="7" y="8" width="2" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="11" y="8" width="2" height="2" fill="#CCFF00" className="animate-pulse" />
            {/* Snout & golden/lime nose ring */}
            <rect x="7" y="12" width="6" height="3" fill="#6B7280" />
            <rect x="8" y="13" width="1" height="1" fill="#111318" />
            <rect x="11" y="13" width="1" height="1" fill="#111318" />
            <rect x="9" y="15" width="2" height="2" fill="#CCFF00" />
            <rect x="8" y="15" width="1" height="1" fill="#CCFF00" />
            <rect x="11" y="15" width="1" height="1" fill="#CCFF00" />
            {/* Cyber shoulders */}
            <rect x="4" y="15" width="3" height="3" fill="#2A2F38" />
            <rect x="13" y="15" width="3" height="3" fill="#2A2F38" />
            <rect x="7" y="16" width="6" height="2" fill="#3F4652" />
          </>
        )}

        {kind === "bot" && (
          <>
            {/* 03: 8-bit AI Agent Droid with Antenna & Visor */}
            <rect x="9" y="1" width="2" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="9" y="3" width="2" height="2" fill="#6B7280" />
            {/* Droid head */}
            <rect x="4" y="5" width="12" height="7" fill="#3F4652" />
            <rect x="5" y="4" width="10" height="1" fill="#9CA3AF" />
            <rect x="3" y="7" width="1" height="3" fill="#CCFF00" />
            <rect x="16" y="7" width="1" height="3" fill="#CCFF00" />
            {/* Dark visor + 8-bit scanner eyes */}
            <rect x="5" y="6" width="10" height="4" fill="#06070A" />
            <rect x="6" y="7" width="3" height="2" fill="#CCFF00" />
            <rect x="11" y="7" width="3" height="2" fill="#CCFF00" />
            <rect x="7" y="7" width="1" height="1" fill="#FFFFFF" />
            <rect x="12" y="7" width="1" height="1" fill="#FFFFFF" />
            {/* Body + glowing core */}
            <rect x="6" y="12" width="8" height="5" fill="#2A2F38" />
            <rect x="7" y="13" width="6" height="3" fill="#525B69" />
            <rect x="9" y="14" width="2" height="1" fill="#CCFF00" className="animate-pulse" />
            {/* Arms & feet */}
            <rect x="4" y="13" width="2" height="3" fill="#6B7280" />
            <rect x="14" y="13" width="2" height="3" fill="#6B7280" />
            <rect x="6" y="17" width="3" height="2" fill="#9CA3AF" />
            <rect x="11" y="17" width="3" height="2" fill="#9CA3AF" />
          </>
        )}

        {kind === "whale" && (
          <>
            {/* 04: 8-bit Cyber Whale spouting #CCFF00 alpha pixels */}
            <rect x="9" y="1" width="2" height="1" fill="#CCFF00" className="animate-pulse" />
            <rect x="7" y="2" width="2" height="1" fill="#CCFF00" />
            <rect x="11" y="2" width="2" height="1" fill="#CCFF00" />
            <rect x="9" y="3" width="2" height="3" fill="#A3E635" />
            {/* Armored whale body */}
            <rect x="4" y="6" width="11" height="2" fill="#6B7280" />
            <rect x="2" y="8" width="14" height="6" fill="#3F4652" />
            <rect x="3" y="7" width="12" height="2" fill="#525B69" />
            {/* Tail fin */}
            <rect x="16" y="9" width="2" height="2" fill="#525B69" />
            <rect x="17" y="7" width="2" height="2" fill="#CCFF00" />
            <rect x="17" y="11" width="2" height="2" fill="#9CA3AF" />
            {/* Cyber eye + belly lines */}
            <rect x="4" y="9" width="3" height="2" fill="#06070A" />
            <rect x="5" y="9" width="2" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="3" y="13" width="11" height="2" fill="#9CA3AF" />
            <rect x="5" y="14" width="2" height="1" fill="#2A2F38" />
            <rect x="9" y="14" width="2" height="1" fill="#2A2F38" />
            {/* Waterline */}
            <rect x="2" y="17" width="4" height="1" fill="#CCFF00" />
            <rect x="8" y="17" width="5" height="1" fill="#CCFF00" />
            <rect x="15" y="17" width="3" height="1" fill="#CCFF00" />
          </>
        )}

        {kind === "rocket" && (
          <>
            {/* 05: 8-bit Narrative Velocity Rocket */}
            <rect x="9" y="1" width="2" height="2" fill="#CCFF00" />
            <rect x="8" y="3" width="4" height="2" fill="#E5E7EB" />
            <rect x="7" y="5" width="6" height="8" fill="#9CA3AF" />
            <rect x="8" y="5" width="4" height="8" fill="#D1D5DB" />
            {/* Cockpit window */}
            <rect x="8" y="6" width="4" height="3" fill="#06070A" />
            <rect x="9" y="7" width="2" height="1" fill="#CCFF00" className="animate-pulse" />
            {/* Side fins */}
            <rect x="5" y="10" width="2" height="4" fill="#3F4652" />
            <rect x="4" y="12" width="1" height="2" fill="#CCFF00" />
            <rect x="13" y="10" width="2" height="4" fill="#3F4652" />
            <rect x="15" y="12" width="1" height="2" fill="#CCFF00" />
            {/* Thruster & #CCFF00 plasma flame */}
            <rect x="8" y="13" width="4" height="2" fill="#2A2F38" />
            <rect x="8" y="15" width="4" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="9" y="17" width="2" height="2" fill="#EF4444" className="animate-pulse" />
          </>
        )}

        {kind === "sentinel" && (
          <>
            {/* 06: 8-bit Onchain Validator Shield / Knight Helmet */}
            <rect x="6" y="2" width="8" height="2" fill="#9CA3AF" />
            <rect x="5" y="4" width="10" height="8" fill="#3F4652" />
            <rect x="6" y="4" width="8" height="2" fill="#6B7280" />
            {/* Glowing #CCFF00 T-visor */}
            <rect x="6" y="6" width="8" height="2" fill="#06070A" />
            <rect x="7" y="6" width="6" height="2" fill="#CCFF00" className="animate-pulse" />
            <rect x="9" y="8" width="2" height="3" fill="#CCFF00" />
            {/* Lower shield plate */}
            <rect x="6" y="12" width="8" height="4" fill="#2A2F38" />
            <rect x="7" y="16" width="6" height="2" fill="#525B69" />
            <rect x="9" y="18" width="2" height="1" fill="#CCFF00" />
            {/* Edge trim */}
            <rect x="4" y="5" width="1" height="6" fill="#CCFF00" />
            <rect x="15" y="5" width="1" height="6" fill="#CCFF00" />
          </>
        )}
      </svg>
    </span>
  );
}
