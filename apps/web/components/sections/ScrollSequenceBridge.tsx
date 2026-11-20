"use client";

import React, { useEffect, useRef } from "react";
import type Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";

function getFrameSrc(index: number) {
  const padded = String(index).padStart(4, "0");
  return `${HOME_CONTENT.scrollSequence.framePrefix}${padded}${HOME_CONTENT.scrollSequence.frameExt}`;
}

export function ScrollSequenceBridge({
  homeTriggerId = "home-trigger",
  lenisRef,
}: {
  homeTriggerId?: string;
  lenisRef?: React.RefObject<Lenis | null>;
}) {
  const fixedWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const homeTrigger = document.getElementById(homeTriggerId);
    const wrapper = fixedWrapperRef.current;
    const canvas = canvasRef.current;
    if (!homeTrigger || !wrapper || !canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const totalFrames = HOME_CONTENT.scrollSequence.totalFrames; // 75
    const loopStart = 10;
    const loopEnd = 48;
    const fps = 45;
    const frameMs = 1000 / fps;
    const images: (HTMLImageElement | null)[] = Array(totalFrames + 1).fill(
      null
    );

    const state = {
      mode: "loop" as "loop" | "playthrough" | "done",
      currentFrame: loopStart,
      loopDir: 1,
      lastTick: performance.now(),
      dispatchedReveal: false,
    };

    const drawFrame = (frameIndex: number) => {
      const clamped = Math.max(
        0,
        Math.min(totalFrames, Math.round(frameIndex))
      );
      let img = images[clamped];
      if (!img || !img.complete || img.naturalWidth === 0) {
        for (let offset = 1; offset <= 12; offset++) {
          const prev = images[clamped - offset];
          if (prev?.complete && prev.naturalWidth > 0) {
            img = prev;
            break;
          }
          const next = images[clamped + offset];
          if (next?.complete && next.naturalWidth > 0) {
            img = next;
            break;
          }
        }
      }
      if (!img || !img.complete || img.naturalWidth === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = w / h;
      let drawW = w;
      let drawH = h;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasRatio > imgRatio) {
        drawH = w / imgRatio;
        offsetY = (h - drawH) / 2;
      } else {
        drawW = h * imgRatio;
        offsetX = (w - drawW) / 2;
      }

      ctx2d.clearRect(0, 0, w, h);
      ctx2d.drawImage(img, offsetX, offsetY, drawW, drawH);
    };

    // Preload all 76 WebP frames
    for (let i = 0; i <= totalFrames; i++) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = getFrameSrc(i);
      if (i === loopStart || i === 0) {
        img.onload = () => drawFrame(state.currentFrame);
      }
      images[i] = img;
    }

    const mountTime = performance.now();
    let safetyUnlockTimer: ReturnType<typeof setTimeout> | null = null;
    let isLocked = false;

    const lockScroll = () => {
      if (isLocked) return;
      isLocked = true;
      lenisRef?.current?.stop();
      if (safetyUnlockTimer) clearTimeout(safetyUnlockTimer);
      safetyUnlockTimer = setTimeout(() => {
        isLocked = false;
        lenisRef?.current?.start();
      }, 3200);
    };

    const unlockScroll = () => {
      if (safetyUnlockTimer) {
        clearTimeout(safetyUnlockTimer);
        safetyUnlockTimer = null;
      }
      isLocked = false;
      lenisRef?.current?.start();
    };

    // Block native wheel/touch/page-keys while portal playthrough is covering screen
    const preventDuringLock = (e: Event) => {
      if (!isLocked) return;
      if (e instanceof KeyboardEvent) {
        if (
          ![
            "ArrowDown",
            "ArrowUp",
            "PageDown",
            "PageUp",
            "Space",
            " ",
            "End",
            "Home",
          ].includes(e.key)
        ) {
          return;
        }
      }
      e.preventDefault();
    };

    window.addEventListener("wheel", preventDuringLock, { passive: false });
    window.addEventListener("touchmove", preventDuringLock, { passive: false });
    window.addEventListener("keydown", preventDuringLock, { passive: false });

    const snapToTimelineStart = () => {
      const target = document.getElementById("stack-timeline");
      if (!target) return;
      const top = Math.max(
        0,
        target.getBoundingClientRect().top + window.scrollY + 2
      );
      if (lenisRef?.current) {
        lenisRef.current.scrollTo(top, { immediate: true, force: true });
      } else {
        window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
      }
      ScrollTrigger.refresh();
    };

    let rafId: number | null = null;
    const tick = (now: number) => {
      if (now - state.lastTick >= frameMs) {
        state.lastTick = now;
        if (state.mode === "loop") {
          drawFrame(state.currentFrame);
          state.currentFrame += state.loopDir;
          if (state.currentFrame >= loopEnd) {
            state.currentFrame = loopEnd;
            state.loopDir = -1;
          } else if (state.currentFrame <= loopStart) {
            state.currentFrame = loopStart;
            state.loopDir = 1;
          }
        } else if (state.mode === "playthrough") {
          drawFrame(state.currentFrame);
          if (!state.dispatchedReveal && state.currentFrame >= 50) {
            state.dispatchedReveal = true;
            window.dispatchEvent(new CustomEvent("sui:portal-reveal"));
          }
          state.currentFrame += 1;
          if (state.currentFrame >= totalFrames) {
            state.currentFrame = totalFrames;
            state.mode = "done";
            drawFrame(totalFrames);
            snapToTimelineStart();
            gsap.to(wrapper, {
              y: "-100%",
              duration: 0.45,
              ease: "power2.in",
              onComplete: () => {
                gsap.set(wrapper, { opacity: 0 });
                unlockScroll();
                ScrollTrigger.refresh();
              },
            });
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const startPlaythrough = () => {
      // If browser loaded/jumped straight to a lower anchor hash, skip portal hijack
      if (performance.now() - mountTime < 350 && window.scrollY > homeTrigger.offsetHeight) {
        state.mode = "done";
        gsap.set(wrapper, { y: "-100%", opacity: 0, width: "100%" });
        return;
      }
      if (state.mode !== "loop") return;
      state.mode = "playthrough";
      state.dispatchedReveal = false;
      state.currentFrame = Math.min(state.currentFrame, 28);
      lockScroll();
      gsap.killTweensOf(wrapper);
      gsap.set(wrapper, { width: "100%", opacity: 1 });
      gsap.to(wrapper, {
        y: "0svh",
        duration: 0.85,
        ease: "power3.out",
        onComplete: () => {
          // Invisibly snap document right to the TOP of `#stack-timeline` while canvas covers screen
          if (state.mode === "playthrough") {
            snapToTimelineStart();
          }
        },
      });
    };

    const reverseToBar = () => {
      if (state.mode !== "done") return;
      gsap.killTweensOf(wrapper);
      state.mode = "loop";
      state.dispatchedReveal = false;
      state.currentFrame = loopStart;
      state.loopDir = 1;
      lockScroll();
      window.dispatchEvent(new CustomEvent("sui:portal-reverse"));
      const bottomOfHome = Math.max(
        0,
        homeTrigger.offsetTop + homeTrigger.offsetHeight - window.innerHeight - 4
      );
      if (lenisRef?.current) {
        lenisRef.current.scrollTo(bottomOfHome, { immediate: true, force: true });
      } else {
        window.scrollTo({ top: bottomOfHome, behavior: "instant" as ScrollBehavior });
      }
      gsap.set(wrapper, { opacity: 1, y: "0svh", width: "100%" });
      gsap.to(wrapper, {
        y: "99.26svh",
        duration: 0.65,
        ease: "power2.out",
        onComplete: () => {
          unlockScroll();
          ScrollTrigger.refresh();
        },
      });
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: homeTrigger,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (state.mode === "loop") {
            const pct = self.progress * 100;
            wrapper.style.width = `${pct.toFixed(2)}%`;
            wrapper.style.opacity = pct > 0.5 ? "1" : "0";
          }
        },
        onLeave: () => {
          startPlaythrough();
        },
      });

      ScrollTrigger.create({
        trigger: homeTrigger,
        start: "top top",
        end: "bottom top",
        invalidateOnRefresh: true,
        onEnterBack: () => {
          reverseToBar();
        },
      });
    });

    const handleResize = () => drawFrame(state.currentFrame);
    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (safetyUnlockTimer) clearTimeout(safetyUnlockTimer);
      unlockScroll();
      window.removeEventListener("wheel", preventDuringLock);
      window.removeEventListener("touchmove", preventDuringLock);
      window.removeEventListener("keydown", preventDuringLock);
      ctx.revert();
      window.removeEventListener("resize", handleResize);
    };
  }, [homeTriggerId, lenisRef]);

  return (
    <div
      ref={fixedWrapperRef}
      id="canvasPin"
      aria-hidden="true"
      className="fixed top-0 left-0 h-[100svh] z-[15] pointer-events-none overflow-hidden"
      style={{
        width: "0%",
        transform: "translate3d(0, 99.26svh, 0)",
        opacity: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-[100vw] h-full block"
      />
    </div>
  );
}
