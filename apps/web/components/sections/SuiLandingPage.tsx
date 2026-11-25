"use client";

import React, { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "@/app/sui-landing.css";
import { SiteNavbar } from "@/components/sections/SiteNavbar";
import { NtiPreloader } from "@/components/sections/NtiPreloader";
import { HeroSection } from "@/components/sections/HeroSection";
import { LogoMarqueeSection } from "@/components/sections/LogoMarqueeSection";
import { ManifestoSection } from "@/components/sections/ManifestoSection";
import { SuiIsSection } from "@/components/sections/SuiIsSection";
import { ScrollSequenceBridge } from "@/components/sections/ScrollSequenceBridge";
import { StackTimelineSection } from "@/components/sections/StackTimelineSection";
import { SuiDropletParallax } from "@/components/sections/SuiDropletParallax";
import { BenefitsSection } from "@/components/sections/BenefitsSection";
import { LiveTerminalPreviewSection } from "@/components/sections/LiveTerminalPreviewSection";
import { IndustrySection } from "@/components/sections/IndustrySection";
import { StayInLoopSection } from "@/components/sections/StayInLoopSection";
import { FaqSection } from "@/components/sections/FaqSection";
import { ClosingCtaSection } from "@/components/sections/ClosingCtaSection";
import { SiteFooter } from "@/components/sections/SiteFooter";

export function SuiLandingPage() {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      syncTouch: true,
    });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);

    const updateLenis = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateLenis);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenisRef.current = null;
      gsap.ticker.remove(updateLenis);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="sui-landing-root min-h-screen w-full bg-black text-white">
      <NtiPreloader />
      <SiteNavbar />
      <main>
        {/* [home-trigger] grouping Hero..Sui-is while bottom canvas bar grows 0% -> 100% */}
        <div id="home-trigger" className="relative z-[9]">
          <div
            className="hero-marquee-portal relative"
            style={{
              ["--marquee-scale" as string]: "0.7",
              ["--marquee-opacity" as string]: "0",
              ["--marquee-y" as string]: "18px",
            }}
          >
            <HeroSection />
            <LogoMarqueeSection />
          </div>
          <ManifestoSection />
          <SuiIsSection />
        </div>
        <ScrollSequenceBridge homeTriggerId="home-trigger" lenisRef={lenisRef} />
        <StackTimelineSection />
        <SuiDropletParallax />
        <BenefitsSection />
        <LiveTerminalPreviewSection />
        <IndustrySection />
        <StayInLoopSection />
        <FaqSection />
        <ClosingCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
