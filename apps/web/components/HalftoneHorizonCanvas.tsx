"use client";

import React, { useEffect, useRef } from "react";

/**
 * Dithered halftone rising horizon + meridian dot-matrix canvas
 * inspired by chainsightoracle.tech, squeez.tech & syndicate.io.
 * Respects prefers-reduced-motion and pauses when offscreen or tab hidden.
 */
export function HalftoneHorizonCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = 0;
    let visible = true;
    let startTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    observer.observe(canvas);

    const draw = (now: number) => {
      if (!visible || document.hidden) {
        if (!reducedMotion) rafId = requestAnimationFrame(draw);
        return;
      }

      const t = reducedMotion ? 0 : (now - startTime) * 0.001;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Subtle radial glow centered under the horizon orb
      const cx = w * 0.52;
      const cy = h * 0.78;
      const orbR = Math.min(w, h) * 0.44;
      const glow = ctx.createRadialGradient(cx, cy, orbR * 0.05, cx, cy, orbR * 1.45);
      glow.addColorStop(0, "rgba(184, 255, 46, 0.14)");
      glow.addColorStop(0.45, "rgba(35, 247, 221, 0.07)");
      glow.addColorStop(1, "rgba(6, 7, 10, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Halftone dot matrix grid shaped into an analytical wave + meridian sphere
      const step = w < 640 ? 11 : 10;
      for (let gx = 0; gx < w; gx += step) {
        for (let gy = 0; gy < h; gy += step) {
          const dx = gx - cx;
          const dy = gy - cy;
          const dist = Math.hypot(dx, dy);

          // Base subtle background micro-dots
          let alpha = 0.08;
          let size = 1.2;
          let color = "139, 148, 167";

          // Spherical dither field
          if (dist < orbR) {
            const norm = 1 - dist / orbR;
            const wave = Math.sin(dx * 0.025 + t * 1.1) * Math.cos(dy * 0.025 - t * 0.7);
            const ring = Math.sin(dist * 0.085 - t * 1.4);
            const intensity = Math.max(0, norm * 0.85 + wave * 0.18 + ring * 0.12);
            if (intensity > 0.14) {
              alpha = Math.min(0.92, intensity * 0.85);
              size = Math.min(step * 0.42, 1.3 + intensity * 2.5);
              if (intensity > 0.72) {
                color = "184, 255, 46"; // acid-lime highlights
              } else if (intensity > 0.48) {
                color = "243, 245, 248"; // alabaster crest
              } else {
                color = "35, 247, 221"; // teal meridian edge
              }
            }
          } else {
            // Subtle rising horizon sweep
            const sweepY =
              h * 0.76 - Math.sin((gx / Math.max(w, 1)) * Math.PI * 1.6 + t * 0.6) * (h * 0.12);
            const bandDist = Math.abs(gy - sweepY);
            if (bandDist < 42) {
              const band = 1 - bandDist / 42;
              alpha = 0.1 + band * 0.28;
              size = 1.2 + band * 1.4;
              color = band > 0.65 ? "184, 255, 46" : "139, 148, 167";
            }
          }

          ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
          ctx.fillRect(gx, gy, size, size);
        }
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(draw);
      }
    };

    if (reducedMotion) {
      draw(startTime);
    } else {
      rafId = requestAnimationFrame(draw);
    }

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  );
}
