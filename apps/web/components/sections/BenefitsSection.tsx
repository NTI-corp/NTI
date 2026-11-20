"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { DottedFrame } from "@/components/ui/DottedDivider";

function SuiStackLogoSvg({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M15.3241 24.6111L24.6527 18.6678H24.6577V20.7197L15.3239 26.6663L5.99609 20.7201V18.6678H6.00104L15.3241 24.6111ZM19.3424 7.8946V9.94967L15.3241 7.38965L6.00104 13.333L15.3241 19.2764L24.6527 13.333H24.6577V15.385L15.3239 21.3316L5.99609 15.3854V11.2807L15.3239 5.33444L19.3424 7.8946ZM23.9536 5.33301C24.4968 6.47344 25.3777 8.30805 25.6829 8.92819C25.8837 9.33629 25.9961 9.79524 25.9961 10.2779C25.9961 11.9672 24.627 13.3367 22.9381 13.3368C21.2492 13.3368 19.8798 11.9672 19.8798 10.2779C19.8798 9.79523 19.9924 9.3363 20.1933 8.92819C20.503 8.29903 21.3645 6.48571 21.9189 5.33301H23.9536ZM22.9355 7.22194C22.4662 8.20304 21.9637 9.25557 21.748 9.69382C21.6618 9.86902 21.6129 10.0665 21.6129 10.2779C21.6129 11.0099 22.2062 11.6034 22.9381 11.6035C23.6699 11.6034 24.2632 11.0099 24.2632 10.2779C24.2632 10.0665 24.2143 9.86902 24.128 9.69382C23.9093 9.24944 23.4051 8.20207 22.9355 7.22194Z"
        fill="currentColor"
      />
    </svg>
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
            {columns.map((col) => (
              <div
                key={col.heading}
                className="relative p-[1.5em] sm:p-[2em] md:p-[2.5em]"
              >
                <DottedFrame color="#c2c6cd" />
                <div className="relative z-10">
                  <h2 className="text-[1.875em] md:text-[2.75em] font-normal leading-[1.1] tracking-[-0.03em] text-black mb-[1.1em]">
                    {col.heading}
                  </h2>

                  <div className="flex flex-col gap-[0.65em]">
                    {col.items.map((text) => (
                      <div
                        key={text}
                        data-benefit-card=""
                        className="bg-[#f4f5f7] px-[1.25em] py-[1.15em] flex items-start gap-[0.85em]"
                      >
                        <span
                          aria-hidden="true"
                          className="w-[0.75em] h-[0.75em] bg-[#298dff] shrink-0 mt-[0.35em]"
                        />
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
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={() => setCtaHovered(true)}
              onMouseLeave={() => setCtaHovered(false)}
              className="inline-flex items-center gap-[0.55em] bg-[#298dff] hover:bg-[#1a7ae6] text-white text-[0.9375em] font-normal px-[0.938em] py-[0.438em] transition-colors overflow-hidden"
            >
              {/* Left icon box swapping SuiStackLogoSvg <-> SingleArrowSvg */}
              <span className="relative w-[2em] h-[2em] overflow-hidden flex items-center justify-center shrink-0">
                <span
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-[375ms]"
                  style={{
                    transitionTimingFunction: "cubic-bezier(0.51, 0, 0.08, 1)",
                    transform: ctaHovered ? "translateX(200%)" : "translateX(0%)",
                  }}
                >
                  <SuiStackLogoSvg className="w-[1.65em] h-[1.65em]" />
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
