"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FOOTER_CONTENT, type FooterSocial } from "@/content/footer";
import { DottedDivider } from "@/components/ui/DottedDivider";
import {
  DiscordIcon,
  ExternalArrowIcon,
  LinkedInIcon,
  SuiDropletIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";

function SocialGlyph({ name }: { name: FooterSocial["name"] }) {
  switch (name) {
    case "youtube":
      return <YouTubeIcon className="w-[1.15em] h-[1.15em]" />;
    case "discord":
      return <DiscordIcon className="w-[1.15em] h-[1.15em]" />;
    case "linkedin":
      return <LinkedInIcon className="w-[1em] h-[1em]" />;
    case "x":
      return <XIcon className="w-[1em] h-[1em]" />;
  }
}

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
  { x: 1269.54, grad: "url(#suiFooterStroke3)" },
  { x: 1058.23, grad: "url(#suiFooterStroke2)" },
  { x: 846.928, grad: "url(#suiFooterStroke1)" },
  { x: 635.621, grad: "url(#suiFooterStroke1)" },
  { x: 424.314, grad: "url(#suiFooterStroke2)" },
  { x: 213.007, grad: "url(#suiFooterStroke3)" },
];

export function SiteFooter() {
  const { gridColumns, socials, copyright } = FOOTER_CONTENT;
  const expanderRef = useRef<HTMLDivElement>(null);
  const blockPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const overlayPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotPathRefs = useRef<(SVGPathElement | null)[]>([]);

  // Scroll-driven pillar stretch matching sui.io initRubberBandScroll (without trapping scroll)
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const wrap = expanderRef.current;
    if (!wrap) return;

    const yBottom = 535.131;
    const baseHeight = yBottom - 321.395; // 213.736
    const dotBottom = 541.232;
    const dotFullH = dotBottom - 418.396; // 122.836

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
    <footer className="relative w-full bg-black text-white pt-[2em] overflow-hidden">
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          <DottedDivider color="#4B515B" />

          {/* Main Footer Content */}
          <div className="pt-[3em] pb-[4em]">
            <div className="mb-[2.75em]">
              <SuiDropletIcon className="w-[1.625em] h-[2.0625em] text-white" />
            </div>

            {/* 4-Column Link Directory with ScrambleText on hover */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-[1.5em] gap-y-[2.5em]">
              {gridColumns.map((column, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[2.25em]">
                  {column.map((group) => (
                    <div
                      key={group.heading}
                      className="flex flex-col gap-[0.85em]"
                    >
                      <div className="font-mono text-[0.75em] text-[#89919f]">
                        {group.heading}
                      </div>
                      <ul className="flex flex-col gap-[0.55em] list-none p-0 m-0">
                        {group.links.map((link) => (
                          <li key={link.label}>
                            <a
                              href={link.href}
                              target={link.external ? "_blank" : undefined}
                              rel={
                                link.external
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                              className="group inline-flex items-center gap-[0.35em] text-[0.9375em] text-[#e0e2e6] hover:text-[#298dff] transition-colors"
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
              ))}
            </div>

            {/* Social Row + Copyright */}
            <div className="mt-[4em] pt-[2em] border-t border-dotted border-[#4B515B] flex flex-col sm:flex-row sm:items-center justify-between gap-[1.5em]">
              <div className="flex items-center gap-[0.65em]">
                {socials.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-[2.5em] h-[2.5em] bg-[#131518] border border-[#343940] hover:bg-[#298dff] hover:border-[#298dff] text-white flex items-center justify-center transition-colors"
                  >
                    <SocialGlyph name={social.name} />
                  </a>
                ))}
              </div>

              <div className="font-mono text-[0.75em] text-[#89919f]">
                {copyright}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll-Driven Bottom Blue-to-White Pillar Expander Artwork */}
      <div
        ref={expanderRef}
        aria-hidden="true"
        className="w-full -mt-[8em] md:-mt-[11em] pointer-events-none select-none"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          viewBox="0 0 1481 535"
          fill="none"
          preserveAspectRatio="none"
          className="w-full h-[14em] md:h-[22em] block"
        >
          <defs>
            <linearGradient
              id="suiFooterPathGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#000000" />
              <stop offset="70%" stopColor="#298dff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient
              id="suiFooterBlueOverlay"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#298dff" stopOpacity="0" />
              <stop offset="100%" stopColor="#298dff" stopOpacity="1" />
            </linearGradient>
            <linearGradient
              id="suiFooterStroke1"
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
              id="suiFooterStroke2"
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
              id="suiFooterStroke3"
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
                fill="url(#suiFooterPathGradient)"
              />
            ))}
            {PILLARS.map((col, idx) => (
              <path
                key={`o-${idx}`}
                ref={(el) => {
                  overlayPathRefs.current[idx] = el;
                }}
                d={`M${col.x1} 321.395H${col.x2}V535.131H${col.x1}V321.395Z`}
                fill="url(#suiFooterBlueOverlay)"
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
