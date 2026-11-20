"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Lightweight native-scroll GSAP ScrollTrigger effects (zero scroll-hijacking).
 */
export function ScrollShowcaseEffects() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      if (barRef.current) {
        gsap.fromTo(
          barRef.current,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: document.documentElement,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
            },
          },
        );
      }

      const cards = gsap.utils.toArray<HTMLElement>("[data-scroll-card]");
      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { y: 16, opacity: 0.75 },
          {
            y: 0,
            opacity: 1,
            duration: 0.45,
            delay: (i % 3) * 0.05,
            ease: "power2.out",
            scrollTrigger: {
              trigger: card,
              start: "top 92%",
              once: true,
            },
          },
        );
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-[#34D399]"
      style={{ transform: "scaleX(0)" }}
    />
  );
}
