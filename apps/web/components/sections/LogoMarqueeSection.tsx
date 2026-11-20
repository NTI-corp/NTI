"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT, type PartnerLogo } from "@/content/home";

function getLogoFilterClass(variant?: PartnerLogo["variant"]) {
  if (variant === "invert") return "invert-[0.5]";
  if (variant === "opacity-50") return "opacity-50";
  return "";
}

export function LogoMarqueeSection() {
  const { marquee } = HOME_CONTENT;
  const headingWrapRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const words = marquee.heading.split(" ");
  const logos = [...marquee.logos, ...marquee.logos];

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = headingWrapRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const spans = wordsRef.current.filter(Boolean);
      if (!spans.length) return;
      gsap.fromTo(
        spans,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.05,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section className="w-full bg-white text-black pt-[4.5em] pb-[4.5em] md:pt-[5.5em] md:pb-[5.5em] overflow-hidden">
      <div ref={headingWrapRef} className="sui-padding-global mb-[3em]">
        <div className="sui-container-1400 overflow-hidden">
          <h2 className="text-[1.25em] md:text-[1.688em] font-normal leading-[1.2] tracking-[-0.025em] text-black text-center">
            {words.map((word, idx) => (
              <span
                key={`${word}-${idx}`}
                ref={(node) => {
                  wordsRef.current[idx] = node;
                }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </span>
            ))}
          </h2>
        </div>
      </div>

      {/* Infinite Continuous Logo Marquee */}
      <div className="relative w-full overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[6em] z-10 bg-gradient-to-r from-white to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[6em] z-10 bg-gradient-to-l from-white to-transparent"
        />

        <div className="sui-marquee-track items-center">
          {logos.map((logo, idx) => (
            <div
              key={`${logo.name}-${idx}`}
              className="flex items-center justify-center shrink-0 px-[2.25em] md:px-[3.25em]"
            >
              <img
                src={logo.src}
                alt={logo.name}
                loading="lazy"
                className={`h-[1.65em] md:h-[2em] w-auto max-w-[9.5em] object-contain select-none ${getLogoFilterClass(
                  logo.variant
                )}`}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
