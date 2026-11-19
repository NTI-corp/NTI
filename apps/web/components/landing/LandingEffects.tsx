"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Coordinates Lenis smooth scroll, top scroll progress indicator,
 * scroll-scrubbed manifesto word reveal, count-up metrics, and card spotlight glow.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const updateProgress = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 0;
      root.style.setProperty("--scroll-progress", ratio.toFixed(4));
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    // Pointer spotlight on cards annotated with data-spot
    const handlePointerMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-spot]");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      target.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    document.addEventListener("pointermove", handlePointerMove, { passive: true });

    let lenis: Lenis | null = null;
    let rafTick: ((time: number) => void) | null = null;

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set("[data-manifesto-word]", { opacity: 1 });
        return;
      }

      // Lenis smooth scroll wired cleanly into GSAP ticker
      lenis = new Lenis({
        duration: 1.05,
        smoothWheel: true,
        touchMultiplier: 1.5,
      });

      lenis.on("scroll", () => {
        ScrollTrigger.update();
        updateProgress();
      });

      rafTick = (time: number) => {
        lenis?.raf(time * 1000);
      };
      gsap.ticker.add(rafTick);
      gsap.ticker.lagSmoothing(0);

      // Word-by-word manifesto luminance scrub (QTimeline pattern)
      const manifesto = document.querySelector<HTMLElement>("[data-manifesto]");
      const words = gsap.utils.toArray<HTMLElement>("[data-manifesto-word]");
      if (manifesto && words.length > 0) {
        gsap.fromTo(
          words,
          { opacity: 0.2 },
          {
            opacity: 1,
            stagger: 0.04,
            ease: "none",
            scrollTrigger: {
              trigger: manifesto,
              start: "top 78%",
              end: "bottom 55%",
              scrub: 0.5,
            },
          },
        );
      }

      // Animated metric count-ups when scrolled into view
      const counters = gsap.utils.toArray<HTMLElement>("[data-count]");
      counters.forEach((el) => {
        const targetVal = Number(el.dataset.count ?? "0");
        if (!Number.isFinite(targetVal)) return;
        const decimals = Number(el.dataset.decimals ?? "0");
        const state = { val: 0 };
        gsap.fromTo(
          state,
          { val: 0 },
          {
            val: targetVal,
            duration: 1.25,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              once: true,
            },
            onUpdate: () => {
              el.textContent =
                decimals > 0
                  ? state.val.toFixed(decimals)
                  : Math.round(state.val).toLocaleString("en-US");
            },
          },
        );
      });
    });

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
      document.removeEventListener("pointermove", handlePointerMove);
      if (rafTick) gsap.ticker.remove(rafTick);
      lenis?.destroy();
      ctx.revert();
    };
  }, []);

  return <div className="scroll-progress" aria-hidden="true" />;
}
