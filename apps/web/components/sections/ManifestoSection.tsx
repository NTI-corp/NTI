"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

export function ManifestoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const { manifesto } = HOME_CONTENT;
  const words = manifesto.statement.split(" ");

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const spans = wordsRef.current.filter(Boolean);
      if (!spans.length) return;

      gsap.fromTo(
        spans,
        { opacity: 0.22 },
        {
          opacity: 1,
          stagger: 0.04,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
            end: "bottom 65%",
            scrub: 0.4,
          },
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="w-full bg-white text-black pt-[2em] pb-[5.5em] md:pt-[2.5em] md:pb-[8em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          <div className="mb-[2.25em] inline-flex items-center gap-[0.65em]">
            <PixelOwlMascot variant="default" size={28} label="NTI 8-bit AI Sentinel" />
            <span className="inline-block bg-[#e0e2e6] text-[#131518] font-mono text-[0.75em] leading-[1.2] tracking-[0.01em] px-[0.75em] py-[0.45em]">
              {manifesto.badge}
            </span>
          </div>

          <h2 className="text-[2.25em] sm:text-[3.25em] md:text-[4.875em] font-normal leading-[1.08] tracking-[-0.045em] text-black max-w-[18.5em]">
            {words.map((word, i) => (
              <span
                key={`${word}-${i}`}
                ref={(node) => {
                  wordsRef.current[i] = node;
                }}
                className="inline-block mr-[0.24em]"
              >
                {word}
              </span>
            ))}
          </h2>
        </div>
      </div>
    </section>
  );
}
