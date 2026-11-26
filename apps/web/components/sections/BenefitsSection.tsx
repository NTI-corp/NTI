"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { DottedFrame } from "@/components/ui/DottedDivider";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

function NTILogoMarkSvg({ className = "w-full h-full" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/nti-logo.png"
      alt="NTI"
      className={`object-contain brightness-0 ${className}`}
    />
  );
}

function SingleArrowSvg({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 13 11"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12.7432 4.11621V6.68066L7.20996 10.7549V8.89355L10.9619 6.12891L0.000976562 6.12988L0 4.62988L10.917 4.62891L7.20996 1.87012V0L12.7432 4.11621Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BenefitsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const ctaTextWrapRef = useRef<HTMLSpanElement>(null);
  const [ctaHovered, setCtaHovered] = useState(false);
  const { benefits } = HOME_CONTENT;
  const columns = [benefits.leftColumn, benefits.rightColumn];

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    const cta = ctaRef.current;
    const textWrap = ctaTextWrapRef.current;
    if (!el || !cta || !textWrap) return;

    const ctx = gsap.context(() => {
      // Card items staggered reveal
      const cards = el.querySelectorAll("[data-benefit-card]");
      if (cards.length) {
        gsap.fromTo(
          cards,
          { y: 18, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.45,
            stagger: 0.06,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 75%",
              once: true,
            },
          }
        );
      }

      // Exact _initHomeBenefitsCTA width + mask wipe reveal
      const tl = gsap.timeline({
        paused: true,
        scrollTrigger: {
          trigger: cta,
          start: "top 90%",
          once: true,
        },
      });
      tl.fromTo(
        cta,
        { scale: 0.7, opacity: 0, transformOrigin: "center top" },
        { scale: 1, opacity: 1, duration: 0.5, ease: "power2.out" },
        0
      ).fromTo(
        textWrap,
        { width: "0px" },
        { width: "auto", duration: 0.48, ease: "power2.out" },
        0.2
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-20 w-full bg-white text-black pt-[1px] pb-[5em] md:pb-[7.5em]"
    >
      <div className="w-full border-t-2 border-dotted border-[#C2C6CD] mb-[5em] md:mb-[7.5em]" />
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Two-Column Dotted Frame Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[1.5em] md:gap-[2em]">
            {columns.map((col, colIdx) => (
              <div
                key={col.heading}
                className="relative p-[1.5em] sm:p-[2em] md:p-[2.5em]"
              >
                <DottedFrame color="#c2c6cd" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-3 mb-[1.1em]">
                    <h2 className="text-[1.875em] md:text-[2.75em] font-normal leading-[1.1] tracking-[-0.03em] text-black">
                      {col.heading}
                    </h2>
                    <PixelOwlMascot
                      variant={colIdx === 0 ? "bull" : "bot"}
                      size={44}
                      label={colIdx === 0 ? "8-bit Cyber Bull" : "8-bit AI Agent Droid"}
                    />
                  </div>

                  <div className="flex flex-col gap-[0.65em]">
                    {col.items.map((text, itemIdx) => (
                      <div
                        key={text}
                        data-benefit-card=""
                        className="bg-[#f4f5f7] px-[1.25em] py-[1.15em] flex items-baseline gap-[0.95em]"
                      >
                        <span
                          aria-hidden="true"
                          className="font-mono text-[0.75em] font-medium text-[#4b515b] tabular-nums shrink-0"
                        >
                          {String(itemIdx + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[1em] md:text-[1.125em] leading-[1.35] tracking-[-0.01em] text-black">
                          {text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Centered Animated CTA matching .cta-blue_block (.cta-blue_logo <-> .blue-arrow swap on hover) */}
          <div className="mt-[3.25em] md:mt-[4em] flex justify-center">
            <a
              ref={ctaRef}
              href={benefits.cta.href}
              onMouseEnter={() => setCtaHovered(true)}
              onMouseLeave={() => setCtaHovered(false)}
              className="inline-flex items-center gap-[0.55em] bg-[#CCFF00] hover:bg-[#B8E600] text-black text-[0.9375em] font-medium px-[0.938em] py-[0.438em] transition-colors overflow-hidden"
            >
              {/* Left icon box swapping NTILogoMarkSvg <-> SingleArrowSvg */}
              <span className="relative w-[2em] h-[2em] overflow-hidden flex items-center justify-center shrink-0">
                <span
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-[375ms]"
                  style={{
                    transitionTimingFunction: "cubic-bezier(0.51, 0, 0.08, 1)",
                    transform: ctaHovered ? "translateX(200%)" : "translateX(0%)",
                  }}
                >
                  <NTILogoMarkSvg className="w-[1.45em] h-[1.45em]" />
                </span>
                <span
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-[375ms]"
                  style={{
                    transitionTimingFunction: "cubic-bezier(0.51, 0, 0.08, 1)",
                    transform: ctaHovered ? "translateX(0%)" : "translateX(-200%)",
                  }}
                >
                  <SingleArrowSvg className="w-[0.85em] h-[0.75em]" />
                </span>
              </span>

              <span
                ref={ctaTextWrapRef}
                className="overflow-hidden whitespace-nowrap inline-block py-[0.35em] pr-[0.4em]"
              >
                {benefits.cta.label}
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
