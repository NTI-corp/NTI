"use client";

import React from "react";

/**
 * Static, monumental full-opacity transparent Cyber Owl backdrop layered over
 * the live 3D obsidian silk wave. Dark cinematic vignette sits above it in
 * HeroSection so the owl stays solid (never washed out) while foreground text pops.
 */
export function HeroOwl3D() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-[2] pointer-events-none overflow-hidden flex items-start justify-center"
    >
      {/* Subtle circular HUD reticles behind the owl */}
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[40em] h-[40em] rounded-full border border-[#CCFF00]/[0.08]" />
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[27em] h-[27em] rounded-full border border-[#CCFF00]/[0.13]" />

      {/* Focused #CCFF00 lime bloom glow behind eyes & upper crown */}
      <div
        className="absolute left-1/2 top-[28%] -translate-x-1/2 -translate-y-1/2 w-[34em] h-[24em] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(204,255,0,0.34) 0%, rgba(204,255,0,0.1) 42%, transparent 72%)",
        }}
      />

      {/* Monumental solid animated Cyber Owl WebP with lower-body dark shading clipped strictly to owl silhouette */}
      <div className="relative mt-[1.8svh] h-[122svh] flex items-start justify-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/images/nti-cyber-owl.webp"
          alt="NTI Cybernetic Owl"
          width={569}
          height={1055}
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className="h-full w-auto max-w-none object-contain opacity-100 brightness-[0.94] contrast-[1.1] saturate-[1.18] drop-shadow-[0_0_28px_rgba(204,255,0,0.2)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 46%, rgba(9,11,14,0.35) 62%, rgba(9,11,14,0.75) 74%, #090B0E 84%)",
            WebkitMaskImage: "url('/assets/images/nti-cyber-owl-mask.webp')",
            WebkitMaskSize: "contain",
            WebkitMaskPosition: "center",
            WebkitMaskRepeat: "no-repeat",
            maskImage: "url('/assets/images/nti-cyber-owl-mask.webp')",
            maskSize: "contain",
            maskPosition: "center",
            maskRepeat: "no-repeat",
          }}
        />
      </div>

      {/* Subtle bottom floor blend only at the very bottom edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[18svh]"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(9,11,14,0.38) 55%, #090B0E 100%)",
        }}
      />
    </div>
  );
}
