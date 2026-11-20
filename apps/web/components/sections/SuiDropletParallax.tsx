"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";

export function SuiDropletParallax() {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [activeCoverIdx, setActiveCoverIdx] = useState(0);
  const { dropletFrames } = HOME_CONTENT;
  const baseFrame = dropletFrames[0];
  const coverFrames = dropletFrames.slice(1); // frames 2..6 (`[global-mask]`)

  // Continuous kinetic ASCII flicker matching sui.io initMasking (0.08s..0.15s intervals)
  useEffect(() => {
    let timerA: ReturnType<typeof setTimeout> | null = null;
    let timerB: ReturnType<typeof setTimeout> | null = null;
    let current = 0;
    let mounted = true;

    const cycle = () => {
      if (!mounted) return;
      timerA = setTimeout(() => {
        if (!mounted) return;
        current = (current + 1) % coverFrames.length;
        setActiveCoverIdx(current);
        const holdMs = 80 + Math.random() * 70;
        timerB = setTimeout(cycle, holdMs);
      }, 50);
    };

    timerB = setTimeout(cycle, 120);
    return () => {
      mounted = false;
      if (timerA) clearTimeout(timerA);
      if (timerB) clearTimeout(timerB);
    };
  }, [coverFrames.length]);

  // Exact initParalaxLogo lerped Y + scale (1.5 -> 0.8) + opacity (1 -> 0.3)
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const outer = outerRef.current;
    const wrap = wrapRef.current;
    if (!outer || !wrap) return;

    const startY = window.innerHeight * 0.25;
    const target = {
      y: startY,
      scale: 1.5,
      opacity: 1,
    };
    const curr = { ...target };

    const update = () => {
      curr.y += (target.y - curr.y) * 0.1;
      curr.scale += (target.scale - curr.scale) * 0.1;
      curr.opacity += (target.opacity - curr.opacity) * 0.1;
      wrap.style.transform = `translate3d(0, ${curr.y.toFixed(1)}px, 0) scale(${curr.scale.toFixed(4)})`;
      wrap.style.opacity = curr.opacity.toFixed(3);
    };

    gsap.ticker.add(update);

    const ctx = gsap.context(() => {
      gsap.to(target, {
        y: window.innerWidth <= 768 ? 0 : -window.innerHeight * 0.35,
        scale: 0.8,
        opacity: 0.3,
        ease: "none",
        scrollTrigger: {
          trigger: outer,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, outer);

    return () => {
      gsap.ticker.remove(update);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={outerRef}
      aria-hidden="true"
      className="relative w-full h-[110vh] bg-black z-[1]"
    >
      {/* `.sticky_overlap.home-page` (sticky top 20vh..35vh, overflow hidden on pure #000) */}
      <div className="sticky top-[14vh] md:top-[22vh] h-[80vh] w-full flex justify-center items-start overflow-hidden">
        <div className="sui-padding-global w-full flex justify-center">
          <div className="sui-container-1400 flex justify-center">
            <div
              ref={wrapRef}
              className="will-change-transform flex items-center justify-center"
              style={{
                transform: "translate3d(0, 220px, 0) scale(1.5)",
                opacity: 1,
              }}
            >
              {/* `.sui_logo.home-page` aspect-ratio: 1, height: 100vh */}
              <div className="relative h-[78vh] md:h-[95vh] aspect-square max-w-full flex items-center justify-center">
                <img
                  src={baseFrame}
                  alt=""
                  className="w-full h-full object-contain block"
                />
                {coverFrames.map((src, idx) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain block"
                    style={{ opacity: idx === activeCoverIdx ? 1 : 0 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
