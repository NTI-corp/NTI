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
  const shaderStageRef = useRef<HTMLDivElement>(null);
  const contentStageRef = useRef<HTMLDivElement>(null);
  const whiteVeilRef = useRef<HTMLDivElement>(null);
  const introWrapRef = useRef<HTMLDivElement>(null);
  const introLineRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const ctaWrapRef = useRef<HTMLDivElement>(null);
  const [introPercent, setIntroPercent] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [cta1Hovered, setCta1Hovered] = useState(false);
  const [cta2Hovered, setCta2Hovered] = useState(false);

  const { hero } = HOME_CONTENT;

  // Quick non-blocking intro counter + curtain wipe, plus BELL-inspired camera zoom transition
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const counter = { value: 0 };
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => setIntroDone(true),
      });

      if (introLineRef.current) {
        tl.fromTo(
          introLineRef.current,
          { scaleX: 0, transformOrigin: "left center" },
          { scaleX: 1, duration: 0.45, ease: "power2.inOut" },
          0
        )
          .to(
            counter,
            {
              value: 100,
              duration: 0.45,
              ease: "none",
              onUpdate: () => setIntroPercent(Math.round(counter.value)),
            },
            0
          )
          .to(
            introLineRef.current,
            { scaleX: 0, transformOrigin: "right center", duration: 0.2 },
            0.46
          );
      }

      if (introWrapRef.current) {
        tl.to(
          introWrapRef.current,
          { yPercent: -100, opacity: 0, duration: 0.55, ease: "power3.inOut" },
          0.55
        );
      }

      if (headlineRef.current) {
        tl.fromTo(
          headlineRef.current,
          { y: 36, opacity: 0.15 },
          { y: 0, opacity: 1, duration: 0.65, ease: "power3.out" },
          0.5
        );
      }

      if (ctaWrapRef.current) {
        tl.fromTo(
          ctaWrapRef.current,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" },
          0.65
        );
      }

      if (!reducedMotion && shaderStageRef.current && contentStageRef.current && whiteVeilRef.current) {
        const shaderEl = shaderStageRef.current;
        const contentEl = contentStageRef.current;
        const veilEl = whiteVeilRef.current;

        const applyZoomExit = (q: number) => {
          const rush = q * q;
          // Camera push through the headline and 3D obsidian surface
          const contentScale = 1 + rush * 0.78;
          const contentOpacity = 1 - smoothStep(0.1, 0.64, q);
          contentEl.style.transform = `scale(${contentScale.toFixed(4)})`;
          contentEl.style.opacity = contentOpacity.toFixed(4);
          contentEl.style.pointerEvents = q > 0.35 ? "none" : "auto";

          const bgScale = 1 + rush * 0.42;
          const bgOpacity = 1 - smoothStep(0.18, 0.85, q) * 0.92;
          shaderEl.style.transform = `scale(${bgScale.toFixed(4)})`;
          shaderEl.style.opacity = bgOpacity.toFixed(4);

          // Soft white portal sweep into LogoMarqueeSection
          const veilOpacity = Math.pow(smoothStep(0.28, 0.94, q), 1.2);
          veilEl.style.opacity = veilOpacity.toFixed(4);
        };

        applyZoomExit(0);
        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self) => applyZoomExit(self.progress),
        });
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="hero-first-section relative w-full h-[155svh] bg-[#090B0E] text-white"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden flex flex-col justify-center">
        {/* Non-blocking Intro Loader Curtain */}
        {!introDone && (
          <div
            ref={introWrapRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30 bg-[#050505] flex flex-col items-center justify-center gap-[1em] px-[2em]"
          >
            <div className="font-mono text-[0.875em] tracking-wider text-white tabular-nums">
              {introPercent}%
            </div>
            <div className="w-[15em] md:w-[25em] h-[2px] bg-white/15 overflow-hidden">
              <div
                ref={introLineRef}
                className="w-full h-full bg-gradient-to-r from-[#CCFF00] via-white to-[#CCFF00]"
              />
            </div>
          </div>
        )}

        {/* Zoom-responsive WebGL Shader Backdrop */}
        <div
          ref={shaderStageRef}
          className="absolute inset-0 will-change-transform origin-center"
        >
          <HeroShaderCanvas />
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[2] pointer-events-none bg-gradient-to-b from-black/25 via-transparent to-black/50"
          />
        </div>

        {/* White exit curtain so Hero dissolves seamlessly into white marquee */}
        <div
          ref={whiteVeilRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[8] bg-white opacity-0"
        />

        {/* Foreground Content zooming forward as scroll leaves the Hero */}
        <div
          ref={contentStageRef}
          className="relative z-[11] sui-padding-global pt-[6em] pb-[3em] will-change-transform origin-[50%_44%]"
        >
          <div className="sui-container-1400 flex flex-col items-center text-center">
            <h1
              ref={headlineRef}
              className="text-[3.25em] sm:text-[4.25em] md:text-[5.625em] font-normal leading-[0.98] tracking-[-0.045em] text-white max-w-[13em]"
            >
              {hero.headline}
            </h1>

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
    </section>
  );
}
