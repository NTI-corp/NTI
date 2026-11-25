"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { HeroShaderCanvas } from "@/components/sections/HeroShaderCanvas";

function HeroTextStagger({
  text,
  hovered,
}: {
  text: string;
  hovered: boolean;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const els = charsRef.current.filter(Boolean);
    if (!els.length) return;
    gsap.to(els, {
      y: hovered ? "-100%" : "0%",
      stagger: 0.01,
      duration: 0.4,
      ease: "expo.out",
      overwrite: true,
    });
  }, [hovered]);

  return (
    <span
      aria-hidden="true"
      className="inline-block overflow-hidden leading-[1.25em] relative whitespace-nowrap"
      style={{ textShadow: "0 1.25em currentColor" }}
    >
      {text.split("").map((ch, idx) => (
        <span
          key={`${ch}-${idx}`}
          ref={(el) => {
            charsRef.current[idx] = el;
          }}
          className="inline-block"
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothStep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyStageRef = useRef<HTMLDivElement>(null);
  const shaderStageRef = useRef<HTMLDivElement>(null);
  const contentStageRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subCtaRef = useRef<HTMLDivElement>(null);
  const ctaWrapRef = useRef<HTMLDivElement>(null);
  const [cta1Hovered, setCta1Hovered] = useState(false);
  const [cta2Hovered, setCta2Hovered] = useState(false);

  const { hero } = HOME_CONTENT;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;

    const portalRoot = el.closest<HTMLElement>(".hero-marquee-portal");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let playedIntro = false;
    const playHeroEntrance = () => {
      if (playedIntro) return;
      playedIntro = true;
      if (headlineRef.current) {
        gsap.fromTo(
          headlineRef.current,
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.75, ease: "power3.out", overwrite: true }
        );
      }
      if (ctaWrapRef.current) {
        gsap.fromTo(
          ctaWrapRef.current,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.65, delay: 0.12, ease: "power3.out", overwrite: true }
        );
      }
    };

    window.addEventListener("nti:intro", playHeroEntrance);
    const fallbackEntrance = window.setTimeout(playHeroEntrance, 2600);

    const setPortalMarquee = (scale: number, opacity: number, yPx: number) => {
      if (!portalRoot) return;
      portalRoot.style.setProperty("--marquee-scale", scale.toFixed(4));
      portalRoot.style.setProperty("--marquee-opacity", opacity.toFixed(4));
      portalRoot.style.setProperty("--marquee-y", `${yPx.toFixed(2)}px`);
    };

    const ctx = gsap.context(() => {
      if (reducedMotion) {
        setPortalMarquee(1, 1, 0);
        return;
      }

      if (
        stickyStageRef.current &&
        shaderStageRef.current &&
        contentStageRef.current &&
        subCtaRef.current
      ) {
        const stickyEl = stickyStageRef.current;
        const shaderEl = shaderStageRef.current;
        const contentEl = contentStageRef.current;
        const subCtaEl = subCtaRef.current;

        const applyZoomPortal = (q: number) => {
          const rush = Math.pow(q, 1.85);

          // Outgoing Hero: pushes forward toward camera lens & clears cleanly by q = 0.64
          const contentScale = 1 + rush * 4.2;
          const contentOpacity = 1 - smoothStep(0.16, 0.64, q);
          const contentBlur = q > 0.22 ? Math.min(8, ((q - 0.22) / 0.44) * 8) : 0;
          contentEl.style.transform = `scale(${contentScale.toFixed(4)})`;
          contentEl.style.opacity = contentOpacity.toFixed(4);
          contentEl.style.filter = contentBlur > 0.05 ? `blur(${contentBlur.toFixed(2)}px)` : "none";
          contentEl.style.pointerEvents = q > 0.28 ? "none" : "auto";

          // Subheadline + CTAs peel slightly earlier so the main headline becomes the optical focal point
          const subOpacity = 1 - smoothStep(0.06, 0.38, q);
          subCtaEl.style.opacity = subOpacity.toFixed(4);
          subCtaEl.style.transform = `translate3d(0, ${(smoothStep(0.06, 0.38, q) * 14).toFixed(2)}px, 0)`;

          // Dark obsidian WebGL stage rushes outward & dissolves straight into the pinned white stage behind it
          const bgScale = 1 + rush * 0.9;
          const bgOpacity = 1 - smoothStep(0.22, 0.72, q);
          shaderEl.style.transform = `scale(${bgScale.toFixed(4)})`;
          shaderEl.style.opacity = bgOpacity.toFixed(4);
          stickyEl.style.visibility = q >= 0.99 ? "hidden" : "visible";

          // Incoming Marquee (already pinned right behind Hero): swells in from depth once Hero text clears
          const zk = smoothStep(0.36, 0.94, q);
          const easedZk = 1 - Math.pow(1 - zk, 2.35);
          const marqueeScale = 0.7 + easedZk * 0.3;
          const marqueeOpacity = smoothStep(0.38, 0.78, q);
          const marqueeY = (1 - easedZk) * 18;
          setPortalMarquee(marqueeScale, marqueeOpacity, marqueeY);
        };

        applyZoomPortal(0);
        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => applyZoomPortal(self.progress),
        });
      }
    }, el);

    return () => {
      clearTimeout(fallbackEntrance);
      window.removeEventListener("nti:intro", playHeroEntrance);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="hero-first-section hero-portal-section relative z-[12] w-full pointer-events-none bg-transparent text-white"
    >
      <div
        ref={stickyStageRef}
        className="hero-portal-sticky sticky top-0 h-[100svh] w-full overflow-hidden flex flex-col justify-center"
      >
        {/* Zoom-responsive Dark Obsidian & WebGL Shader Backdrop */}
        <div
          ref={shaderStageRef}
          className="absolute inset-0 bg-[#090B0E] will-change-transform origin-center"
        >
          <HeroShaderCanvas />
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[2] pointer-events-none bg-gradient-to-b from-black/25 via-transparent to-black/50"
          />
        </div>

        {/* Foreground Content zooming toward & past the viewer as scroll leaves the Hero */}
        <div
          ref={contentStageRef}
          className="relative z-[11] sui-padding-global pt-[6em] pb-[3em] will-change-transform origin-[50%_44%] pointer-events-auto"
        >
          <div className="sui-container-1400 flex flex-col items-center text-center">
            <h1
              ref={headlineRef}
              className="text-[3.25em] sm:text-[4.25em] md:text-[5.625em] font-normal leading-[0.98] tracking-[-0.045em] text-white max-w-[13em]"
            >
              {hero.headline}
            </h1>

            <div ref={subCtaRef} className="flex flex-col items-center will-change-transform">
              <p className="mt-[1.35em] text-[1.0625em] md:text-[1.25em] leading-[1.4] tracking-[-0.015em] text-[#e0e2e6] max-w-[38em]">
                {hero.subheadline}
              </p>

              <div
                ref={ctaWrapRef}
                className="mt-[2.25em] grid grid-cols-2 gap-0 min-h-[3em] items-stretch justify-center mx-auto"
              >
                <a
                  href={hero.primaryCta.href}
                  aria-label={hero.primaryCta.label}
                  target={hero.primaryCta.external ? "_blank" : undefined}
                  rel={hero.primaryCta.external ? "noopener noreferrer" : undefined}
                  onMouseEnter={() => setCta1Hovered(true)}
                  onMouseLeave={() => setCta1Hovered(false)}
                  className="bg-[#CCFF00] hover:bg-[#B8E600] text-black text-[0.875em] font-medium tracking-[-0.005em] leading-none px-[1.875em] py-[1em] transition-colors rounded-none flex items-center justify-center whitespace-nowrap"
                >
                  <HeroTextStagger
                    text={hero.primaryCta.label}
                    hovered={cta1Hovered}
                  />
                </a>
                <a
                  href={hero.secondaryCta.href}
                  aria-label={hero.secondaryCta.label}
                  target={hero.secondaryCta.external ? "_blank" : undefined}
                  rel={
                    hero.secondaryCta.external ? "noopener noreferrer" : undefined
                  }
                  onMouseEnter={() => setCta2Hovered(true)}
                  onMouseLeave={() => setCta2Hovered(false)}
                  className="bg-white hover:bg-[#e0e2e6] text-black text-[0.875em] font-normal tracking-[-0.005em] leading-[0.95] px-[1.875em] py-[1em] transition-colors rounded-none flex items-center justify-center whitespace-nowrap"
                >
                  <HeroTextStagger
                    text={hero.secondaryCta.label}
                    hovered={cta2Hovered}
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
