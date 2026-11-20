"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const ASCII_PHRASE = "NTI // MINDSHARE // 4H EPOCH // ";
const COLS = 88;
const ROWS = 62;

interface MaskCell {
  col: number;
  row: number;
  ch: string;
  isBeacon: boolean;
  seed: number;
}

function buildNtiAsciiCells(): MaskCell[] {
  if (typeof document === "undefined") return [];
  const MASK_SIZE = 256;
  const off = document.createElement("canvas");
  off.width = MASK_SIZE;
  off.height = MASK_SIZE;
  const ctx = off.getContext("2d");
  if (!ctx) return [];

  ctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = MASK_SIZE * 0.5;
  const cy = MASK_SIZE * 0.52;
  const r = MASK_SIZE * 0.37;

  // 1. Thick architectural orbital C-ring open toward top-right breakout
  ctx.lineWidth = MASK_SIZE * 0.125;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.06, Math.PI * 1.56, false);
  ctx.stroke();

  // 2. Bold NTI ascending pulse / monogram chevron cutting cleanly across center
  ctx.lineWidth = MASK_SIZE * 0.11;
  ctx.beginPath();
  ctx.moveTo(MASK_SIZE * 0.30, MASK_SIZE * 0.67);
  ctx.lineTo(MASK_SIZE * 0.30, MASK_SIZE * 0.37);
  ctx.lineTo(MASK_SIZE * 0.49, MASK_SIZE * 0.59);
  ctx.lineTo(MASK_SIZE * 0.66, MASK_SIZE * 0.36);
  ctx.stroke();

  const imgData = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;

  // Separate beacon orb hit mask at top-right breakout
  const beaconCanvas = document.createElement("canvas");
  beaconCanvas.width = MASK_SIZE;
  beaconCanvas.height = MASK_SIZE;
  const bCtx = beaconCanvas.getContext("2d");
  let beaconData: Uint8ClampedArray | null = null;
  if (bCtx) {
    bCtx.fillStyle = "#ffffff";
    bCtx.beginPath();
    bCtx.arc(MASK_SIZE * 0.77, MASK_SIZE * 0.24, MASK_SIZE * 0.078, 0, Math.PI * 2);
    bCtx.fill();
    beaconData = bCtx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
  }

  const cells: MaskCell[] = [];
  for (let row = 0; row < ROWS; row++) {
    const rowOffset = (row * 7) % ASCII_PHRASE.length;
    const py = Math.min(MASK_SIZE - 1, Math.floor(((row + 0.5) / ROWS) * MASK_SIZE));
    for (let col = 0; col < COLS; col++) {
      const px = Math.min(MASK_SIZE - 1, Math.floor(((col + 0.5) / COLS) * MASK_SIZE));
      const idx = (py * MASK_SIZE + px) * 4;
      const inMain = (imgData[idx + 3] ?? 0) > 100;
      const inBeacon = (beaconData?.[idx + 3] ?? 0) > 100;
      if (!inMain && !inBeacon) continue;

      const ch = ASCII_PHRASE[(col + rowOffset) % ASCII_PHRASE.length] ?? " ";
      if (ch === " ") continue;

      const seed = Math.abs(Math.sin(row * 127.1 + col * 311.7) * 43758.5453) % 1;
      cells.push({ col, row, ch, isBeacon: inBeacon, seed });
    }
  }

  return cells;
}

export function SuiDropletParallax() {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Kinetic NTI ASCII mosaic flicker matching sui.io initMasking (0.08s..0.15s intervals)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cells = buildNtiAsciiCells();
    if (!cells.length) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let frameIdx = 0;
    let timerA: ReturnType<typeof setTimeout> | null = null;
    let timerB: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    let isVisible = true;

    const renderAscii = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;

      const w = Math.floor(cssW * dpr);
      const h = Math.floor(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      const cellW = w / COLS;
      const cellH = h / ROWS;
      const fontSize = Math.max(8, Math.floor(Math.min(cellW * 1.45, cellH * 0.92)));
      ctx.font = `500 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const bucketCount = 6;
      const activeBucket = frameIdx % bucketCount;

      for (const cell of cells) {
        const x = (cell.col + 0.5) * cellW;
        const y = (cell.row + 0.5) * cellH;
        const bucket = Math.floor(cell.seed * bucketCount);
        const isSpark = ((cell.col * 13 + cell.row * 29 + frameIdx) % 37) === 0;

        if (cell.isBeacon) {
          ctx.fillStyle = isSpark ? "#FFFFFF" : "#CCFF00";
        } else if (isSpark && bucket === activeBucket) {
          ctx.fillStyle = "#CCFF00";
        } else if (bucket === activeBucket && cell.seed > 0.62) {
          ctx.fillStyle = "rgba(204, 255, 0, 0.85)";
        } else {
          ctx.fillStyle = "#4B515B";
        }

        ctx.fillText(cell.ch, x, y);
      }
    };

    const cycle = () => {
      if (!mounted || reducedMotion) return;
      timerA = setTimeout(() => {
        if (!mounted) return;
        if (isVisible) {
          frameIdx = (frameIdx + 1) % 60;
          renderAscii();
        }
        const holdMs = 85 + Math.random() * 65;
        timerB = setTimeout(cycle, holdMs);
      }, 50);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = Boolean(entries[0]?.isIntersecting);
        if (isVisible) renderAscii();
      },
      { threshold: 0.01 }
    );
    observer.observe(canvas);
    window.addEventListener("resize", renderAscii);

    renderAscii();
    if (!reducedMotion) {
      timerB = setTimeout(cycle, 100);
    }

    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener("resize", renderAscii);
      if (timerA) clearTimeout(timerA);
      if (timerB) clearTimeout(timerB);
    };
  }, []);

  // Exact initParalaxLogo lerped Y + scale (1.5 -> 0.8) + opacity (1 -> 0.3)
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const outer = outerRef.current;
    const wrap = wrapRef.current;
    if (!outer || !wrap) return;

    const startY = window.innerHeight * 0.25;
    const target = {
      y: startY,
      scale: 1.5,
      opacity: 1,
    };
    const curr = { ...target };

    const update = () => {
      curr.y += (target.y - curr.y) * 0.1;
      curr.scale += (target.scale - curr.scale) * 0.1;
      curr.opacity += (target.opacity - curr.opacity) * 0.1;
      wrap.style.transform = `translate3d(0, ${curr.y.toFixed(1)}px, 0) scale(${curr.scale.toFixed(4)})`;
      wrap.style.opacity = curr.opacity.toFixed(3);
    };

    gsap.ticker.add(update);

    const ctx = gsap.context(() => {
      gsap.to(target, {
        y: window.innerWidth <= 768 ? 0 : -window.innerHeight * 0.35,
        scale: 0.8,
        opacity: 0.3,
        ease: "none",
        scrollTrigger: {
          trigger: outer,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, outer);

    return () => {
      gsap.ticker.remove(update);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={outerRef}
      aria-hidden="true"
      className="relative w-full h-[110vh] bg-black z-[1]"
    >
      {/* `.sticky_overlap.home-page` (sticky top 20vh..35vh, overflow hidden on pure #000) */}
      <div className="sticky top-[14vh] md:top-[22vh] h-[80vh] w-full flex justify-center items-start overflow-hidden">
        <div className="sui-padding-global w-full flex justify-center">
          <div className="sui-container-1400 flex justify-center">
            <div
              ref={wrapRef}
              className="will-change-transform flex items-center justify-center"
              style={{
                transform: "translate3d(0, 220px, 0) scale(1.5)",
                opacity: 1,
              }}
            >
              {/* `.sui_logo.home-page` aspect-ratio: 1, height: 100vh */}
              <div className="relative h-[78vh] md:h-[95vh] aspect-square max-w-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full block"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
