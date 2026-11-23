"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FOOTER_CONTENT } from "@/content/footer";
import { DottedDivider } from "@/components/ui/DottedDivider";
import { ExternalArrowIcon, RobinhoodMark, XIcon } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";

const PILLARS = [
  { x1: 634.196, x2: 846.378, opacity: "0.8" },
  { x1: 423, x2: 635, opacity: "0.8" },
  { x1: 211.583, x2: 423.765, opacity: "0.6" },
  { x1: 0.275879, x2: 212.458, opacity: "0.4" },
  { x1: 1058.23, x2: 846.052, opacity: "0.8" },
  { x1: 1269.54, x2: 1057.36, opacity: "0.6" },
  { x1: 1480.85, x2: 1268.67, opacity: "0.4" },
];

const DOT_LINES = [
  { x: 1269.54, grad: "url(#ntiFooterStroke3)" },
  { x: 1058.23, grad: "url(#ntiFooterStroke2)" },
  { x: 846.928, grad: "url(#ntiFooterStroke1)" },
  { x: 635.621, grad: "url(#ntiFooterStroke1)" },
  { x: 424.314, grad: "url(#ntiFooterStroke2)" },
  { x: 213.007, grad: "url(#ntiFooterStroke3)" },
];

export function SiteFooter() {
  const { brandSubtitle, columns, xUrl, xHandle, networkLabel, copyright } = FOOTER_CONTENT;
  const expanderRef = useRef<HTMLDivElement>(null);
  const blockPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const overlayPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotPathRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const wrap = expanderRef.current;
    if (!wrap) return;

    const yBottom = 535.131;
    const baseHeight = yBottom - 321.395;
    const dotBottom = 541.232;
    const dotFullH = dotBottom - 418.396;

    const applyProgress = (p: number) => {
      const clamped = Math.min(0.95, Math.max(0, p));
      const h = baseHeight * (0.72 + 0.32 * clamped);
      const yTop = yBottom - h;
      PILLARS.forEach((col, i) => {
        const d = `M${col.x1} ${yTop.toFixed(2)}H${col.x2}V${yBottom}H${col.x1}V${yTop.toFixed(2)}Z`;
        blockPathRefs.current[i]?.setAttribute("d", d);
        overlayPathRefs.current[i]?.setAttribute("d", d);
      });

      const dotH = dotFullH * (0.35 + 0.65 * clamped);
      const dotYTop = dotBottom - dotH;
      DOT_LINES.forEach((line, i) => {
        const d = `M${line.x} ${dotYTop.toFixed(2)}L${line.x} ${dotBottom}`;
        dotPathRefs.current[i]?.setAttribute("d", d);
      });
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrap,
        start: "top bottom",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => applyProgress(self.progress),
      });
    }, wrap);

    return () => ctx.revert();
  }, []);

  return (
    <footer className="relative w-full bg-[#090B0E] text-white pt-[2em] overflow-hidden">
      <div className="relative z-10 sui-padding-global">
        <div className="sui-container-1400">
          <DottedDivider color="#4B515B" />

          {/* Main Footer Content: Brand + 3 Clean Columns */}
          <div className="pt-[3em] pb-[2.5em]">
            <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr_1fr_1fr] gap-x-[2em] gap-y-[2.5em] items-start">
              {/* Brand Column */}
              <div className="flex flex-col gap-[0.9em]">
                <a href="/" className="inline-flex items-center gap-[0.6em] group w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/nti-logo.png"
                    alt="NTI"
                    className="h-[1.95em] w-[1.95em] shrink-0 object-contain"
                  />
                  <span className="text-[1.25em] font-semibold tracking-[-0.03em] text-white group-hover:text-[#CCFF00] transition-colors leading-none">
                    NTI
                  </span>
                </a>
                <p className="text-[0.875em] leading-[1.45] text-[#89919f] max-w-[20em] m-0">
                  {brandSubtitle}
                </p>
              </div>

              {/* 3 Real Route Columns */}
              {columns.map((group) => (
                <div key={group.heading} className="flex flex-col gap-[0.85em]">
                  <div className="font-mono text-[0.75em] text-[#89919f]">
                    {group.heading}
                  </div>
                  <ul className="flex flex-col gap-[0.55em] list-none p-0 m-0">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target={link.external ? "_blank" : undefined}
                          rel={link.external ? "noopener noreferrer" : undefined}
                          className="group inline-flex items-center gap-[0.35em] text-[0.9375em] text-[#e0e2e6] hover:text-[#CCFF00] transition-colors"
                        >
                          <ScrambleText text={link.label} trigger="hover" />
                          {link.external && (
                            <ExternalArrowIcon className="w-[0.65em] h-[0.65em] opacity-60 group-hover:opacity-100" />
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Minimal Bottom Meta Row */}
            <div className="mt-[3em] pt-[1.5em] border-t border-dotted border-[#4B515B] flex flex-col sm:flex-row sm:items-center justify-between gap-[1em]">
              <div className="flex flex-wrap items-center gap-x-[1.5em] gap-y-[0.5em] font-mono text-[0.75em] text-[#89919f]">
                <div className="inline-flex items-center gap-[0.55em]">
                  <RobinhoodMark className="h-[1.25em] w-auto opacity-85" />
                  <span>{networkLabel}</span>
                </div>
                <a
                  href={xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-[0.45em] text-[#e0e2e6] hover:text-[#CCFF00] transition-colors"
                >
                  <XIcon className="w-[0.95em] h-[0.95em]" />
                  <span>{xHandle}</span>
                  <ExternalArrowIcon className="w-[0.65em] h-[0.65em] opacity-60 group-hover:opacity-100" />
                </a>
              </div>

              <div className="font-mono text-[0.75em] text-[#89919f]">
                {copyright}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll-Driven Bottom Lime-to-White Pillar Expander Artwork */}
      <div
        ref={expanderRef}
        aria-hidden="true"
        className="relative z-0 w-full -mt-[2.5em] md:-mt-[4em] pointer-events-none select-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          viewBox="0 0 1481 535"
          fill="none"
          preserveAspectRatio="none"
          className="w-full h-[11em] md:h-[16em] block"
        >
          <defs>
            <linearGradient
              id="ntiFooterPathGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#090B0E" />
              <stop offset="68%" stopColor="#CCFF00" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
            <linearGradient
              id="ntiFooterLimeOverlay"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#CCFF00" stopOpacity="0" />
              <stop offset="100%" stopColor="#CCFF00" stopOpacity="1" />
            </linearGradient>
            <linearGradient
              id="ntiFooterStroke1"
              x1="0%"
              y1="0%"
              x2="0"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopOpacity="0" stopColor="#FFFFFF" offset="0%" />
              <stop stopOpacity="1" stopColor="#FFFFFF" offset="100%" />
            </linearGradient>
            <linearGradient
              id="ntiFooterStroke2"
              x1="0%"
              y1="20%"
              x2="0"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopOpacity="0" stopColor="#FFFFFF" offset="0%" />
              <stop stopOpacity="1" stopColor="#FFFFFF" offset="100%" />
            </linearGradient>
            <linearGradient
              id="ntiFooterStroke3"
              x1="0%"
              y1="40%"
              x2="0"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopOpacity="0" stopColor="#FFFFFF" offset="0%" />
              <stop stopOpacity="1" stopColor="#FFFFFF" offset="100%" />
            </linearGradient>
          </defs>

          <g>
            {PILLARS.map((col, idx) => (
              <path
                key={`b-${idx}`}
                ref={(el) => {
                  blockPathRefs.current[idx] = el;
                }}
                opacity={col.opacity}
                d={`M${col.x1} 321.395H${col.x2}V535.131H${col.x1}V321.395Z`}
                fill="url(#ntiFooterPathGradient)"
              />
            ))}
            {PILLARS.map((col, idx) => (
              <path
                key={`o-${idx}`}
                ref={(el) => {
                  overlayPathRefs.current[idx] = el;
                }}
                d={`M${col.x1} 321.395H${col.x2}V535.131H${col.x1}V321.395Z`}
                fill="url(#ntiFooterLimeOverlay)"
                style={{ mixBlendMode: "color" }}
              />
            ))}
          </g>

          <g>
            {DOT_LINES.map((line, idx) => (
              <path
                key={`d-${idx}`}
                ref={(el) => {
                  dotPathRefs.current[idx] = el;
                }}
                d={`M${line.x} 418.396L${line.x} 541.232`}
                stroke={line.grad}
                strokeWidth="2"
                strokeDasharray="2 10"
                fill="none"
              />
            ))}
          </g>
        </svg>
      </div>
    </footer>
  );
}
