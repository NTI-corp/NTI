"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { HOME_CONTENT } from "@/content/home";

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

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const introWrapRef = useRef<HTMLDivElement>(null);
  const introLineRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const ctaWrapRef = useRef<HTMLDivElement>(null);
  const [introPercent, setIntroPercent] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [cta1Hovered, setCta1Hovered] = useState(false);
  const [cta2Hovered, setCta2Hovered] = useState(false);

  // Smooth lerped radial spotlight state matching __initHeroBlur (lerp 0.2, cubic snap on leave)
  const spotlightRef = useRef({
    targetX: 50,
    targetY: 50,
    currX: 50,
    currY: 50,
    rafId: null as number | null,
  });

  const { hero } = HOME_CONTENT;

  // Quick non-blocking intro counter + curtain wipe matching initIntro
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

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
    }, el);

    return () => ctx.revert();
  }, []);

  // Lerp loop for spotlight mask (--mouse-x, --mouse-y)
  useEffect(() => {
    const step = () => {
      const s = spotlightRef.current;
      const el = sectionRef.current;
      if (!el) return;
      s.currX += (s.targetX - s.currX) * 0.2;
      s.currY += (s.targetY - s.currY) * 0.2;
      el.style.setProperty("--mouse-x", `${s.currX.toFixed(2)}%`);
      el.style.setProperty("--mouse-y", `${s.currY.toFixed(2)}%`);

      if (Math.abs(s.currX - s.targetX) + Math.abs(s.currY - s.targetY) > 0.15) {
        s.rafId = requestAnimationFrame(step);
      } else {
        s.currX = s.targetX;
        s.currY = s.targetY;
        el.style.setProperty("--mouse-x", `${s.targetX.toFixed(2)}%`);
        el.style.setProperty("--mouse-y", `${s.targetY.toFixed(2)}%`);
        s.rafId = null;
      }
    };

    const el = sectionRef.current;
    if (!el) return;

    const kickLoop = () => {
      if (!spotlightRef.current.rafId) {
        spotlightRef.current.rafId = requestAnimationFrame(step);
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      spotlightRef.current.targetX = ((e.clientX - rect.left) / rect.width) * 100;
      spotlightRef.current.targetY = ((e.clientY - rect.top) / rect.height) * 100;
      kickLoop();
    };

    const onLeave = () => {
      spotlightRef.current.targetX = 50;
      spotlightRef.current.targetY = 50;
      kickLoop();
    };

    const spot = spotlightRef.current;
    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (spot.rafId) {
        cancelAnimationFrame(spot.rafId);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="hero-first-section relative min-h-[100svh] w-full bg-black text-white overflow-hidden flex flex-col justify-center"
    >
      {/* Non-blocking Intro Loader Curtain */}
      {!introDone && (
        <div
          ref={introWrapRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 bg-[#04070c] flex flex-col items-center justify-center gap-[1em] px-[2em]"
        >
          <div className="font-mono text-[0.875em] tracking-wider text-white tabular-nums">
            {introPercent}%
          </div>
          <div className="w-[15em] md:w-[25em] h-[2px] bg-white/15 overflow-hidden">
            <div
              ref={introLineRef}
              className="w-full h-full bg-gradient-to-r from-[#298dff] via-white to-[#298dff]"
            />
          </div>
        </div>
      )}

      {/* Desktop Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={hero.desktopPoster}
        className="hidden md:block absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
      >
        <source src={hero.desktopVideoWebm} type="video/webm" />
        <source src={hero.desktopVideoMp4} type="video/mp4" />
      </video>

      {/* Mobile Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={hero.mobilePoster}
        className="block md:hidden absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
      >
        <source src={hero.mobileVideoMp4} type="video/mp4" />
      </video>

      {/* Subtle Vignette */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[2] pointer-events-none bg-gradient-to-b from-black/30 via-black/15 to-black/60"
      />

      {/* Interactive Cursor-Tracking Radial Blur Spotlight */}
      <div aria-hidden="true" className="hero-gradient-blur">
        <div />
        <div />
        <div />
      </div>

      {/* Horizontal Light Divider Accent near vertical center */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-[54%] -translate-y-1/2 z-[6] pointer-events-none opacity-85"
      >
        <img
          src={hero.dividerImage}
          alt=""
          className="w-full h-[2px] md:h-[3px] object-cover block"
        />
      </div>

      {/* Foreground Content */}
      <div className="relative z-[11] sui-padding-global pt-[6em] pb-[3em]">
        <div className="sui-container-1400 flex flex-col items-center text-center">
          <h1
            ref={headlineRef}
            className="text-[3.25em] sm:text-[4.25em] md:text-[5.625em] font-normal leading-[0.98] tracking-[-0.045em] text-white max-w-[13em]"
          >
            {hero.headline}
          </h1>

          <p className="mt-[1.35em] text-[1.0625em] md:text-[1.25em] leading-[1.35] tracking-[-0.015em] text-[#e0e2e6] max-w-[30em]">
            {hero.subheadline}
          </p>

          <div
            ref={ctaWrapRef}
            className="mt-[2.25em] flex flex-wrap items-center justify-center gap-[0.75em]"
          >
            <a
              href={hero.primaryCta.href}
              aria-label={hero.primaryCta.label}
              target={hero.primaryCta.external ? "_blank" : undefined}
              rel={hero.primaryCta.external ? "noopener noreferrer" : undefined}
              onMouseEnter={() => setCta1Hovered(true)}
              onMouseLeave={() => setCta1Hovered(false)}
              className="bg-[#298dff] hover:bg-[#1a7ae6] text-white text-[0.9375em] font-normal px-[1.75em] py-[0.88em] transition-colors rounded-none inline-flex items-center"
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
              className="bg-white hover:bg-[#e0e2e6] text-black text-[0.9375em] font-normal px-[1.75em] py-[0.88em] transition-colors rounded-none inline-flex items-center"
            >
              <HeroTextStagger
                text={hero.secondaryCta.label}
                hovered={cta2Hovered}
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
