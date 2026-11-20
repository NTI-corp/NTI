"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT, type StackTimelineCard } from "@/content/home";
import { ProtocolIcon } from "@/components/ui/Icons";
import { NtiStackVisual } from "@/components/ui/NtiStackVisual";

const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!$^*()-_=+[]{}";

// Exact checkpoints from sui.io __initTimelineAnimation matching alternating 248em rail:
// Right col: 01 Sui (0.02), 03 Seal (0.32), 05 DeepBook (0.70)
// Left col: 02 Walrus (0.16), 04 Nautilus (0.51), 06 SuiNS (0.85)
const CHECKPOINT_BY_NUMBER: Record<string, number> = {
  "01": 0.02,
  "02": 0.16,
  "03": 0.32,
  "04": 0.51,
  "05": 0.7,
  "06": 0.85,
};

function runDomScramble(el: HTMLElement, text: string) {
  const activeRaf = Number(el.dataset.scrambleRaf || "0");
  if (activeRaf) cancelAnimationFrame(activeRaf);

  const start = performance.now();
  const duration = Math.min(600, Math.max(260, text.length * 18));

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const settledCount = Math.floor(progress * text.length);
    const next = text
      .split("")
      .map((ch, idx) => {
        if (ch === " ") return " ";
        if (idx < settledCount) return ch;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      })
      .join("");

    el.textContent = next;
    if (progress < 1) {
      el.dataset.scrambleRaf = String(requestAnimationFrame(tick));
    } else {
      el.textContent = text;
      delete el.dataset.scrambleRaf;
    }
  };

  el.dataset.scrambleRaf = String(requestAnimationFrame(tick));
}

export function StackTimelineSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const progressMainRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const progressClipRef = useRef<HTMLDivElement>(null);
  const topTrailRef = useRef<HTMLDivElement>(null);
  const bottomTrailRef = useRef<HTMLDivElement>(null);

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const { stackTimeline } = HOME_CONTENT;
  const rightCards = stackTimeline.cards.filter((c) => c.column === "right");
  const leftCards = stackTimeline.cards.filter((c) => c.column === "left");

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    const progressMain = progressMainRef.current;
    const current = currentRef.current;
    const progressClip = progressClipRef.current;
    const topTrail = topTrailRef.current;
    const bottomTrail = bottomTrailRef.current;
    if (!el || !progressMain || !current || !progressClip) return;

    interface CardAnimState {
      isOpen: boolean;
      tl?: gsap.core.Timeline;
    }

    const cardState: Record<string, CardAnimState> = {};
    const trailState = { top: 0, bottom: 0 };
    let trailTween: gsap.core.Tween | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = false;
    let revealed = false;

    const getIsMobile = () => window.innerWidth <= 768;

    // Initialize desktop collapsed card state cleanly via GSAP (never CSS transition fighting)
    Object.keys(CHECKPOINT_BY_NUMBER).forEach((num) => {
      const cardEl = cardRefs.current[num];
      if (!cardEl) return;
      const animBox = cardEl.querySelector<HTMLElement>("[data-card-anim]");
      const riveInner = cardEl.querySelector<HTMLElement>("[data-rive-inner]");
      const footer = cardEl.querySelector<HTMLElement>("[data-card-footer]");

      if (!getIsMobile()) {
        if (animBox) gsap.set(animBox, { height: "0em" });
        if (riveInner) {
          gsap.set(riveInner, {
            scale: 0.7,
            opacity: 0,
            transformOrigin: "bottom center",
          });
        }
        if (footer) gsap.set(footer, { borderTopColor: "transparent" });
        cardState[num] = { isOpen: false };
      } else {
        if (animBox) gsap.set(animBox, { height: "13.438em" });
        if (riveInner) gsap.set(riveInner, { scale: 1, opacity: 1 });
        if (footer) gsap.set(footer, { borderTopColor: "#4b515b" });
        cardState[num] = { isOpen: true };
      }
    });

    const toggleCard = (num: string, shouldOpen: boolean) => {
      const st = cardState[num];
      const cardEl = cardRefs.current[num];
      if (!st || !cardEl || st.isOpen === shouldOpen) return;

      st.isOpen = shouldOpen;
      st.tl?.kill();

      const animBox = cardEl.querySelector<HTMLElement>("[data-card-anim]");
      const riveInner = cardEl.querySelector<HTMLElement>("[data-rive-inner]");
      const footer = cardEl.querySelector<HTMLElement>("[data-card-footer]");
      const titleEl = cardEl.querySelector<HTMLElement>("[data-card-title]");
      const titleText = titleEl?.dataset.text || "";

      if (!animBox || !riveInner) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      st.tl = tl;

      if (shouldOpen) {
        if (footer) gsap.set(footer, { borderTopColor: "#4b515b" });
        tl.to(
          animBox,
          { height: getIsMobile() ? "13.438em" : "17em", duration: 0.45 },
          0
        ).fromTo(
          riveInner,
          { scale: 0.7, opacity: 0, transformOrigin: "bottom center" },
          { scale: 1, opacity: 1, duration: 0.5 },
          0
        );
        if (titleEl && titleText) {
          runDomScramble(titleEl, titleText);
        }
      } else {
        tl.to(
          riveInner,
          { scale: 0.7, opacity: 0, duration: 0.45 },
          0
        ).to(
          animBox,
          {
            height: "0em",
            duration: 0.5,
            onComplete: () => {
              if (!st.isOpen && footer) {
                gsap.set(footer, { borderTopColor: "transparent" });
              }
            },
          },
          0
        );
      }
    };

    const syncTrailHeight = () => {
      if (topTrail) topTrail.style.height = `${trailState.top.toFixed(1)}%`;
      if (bottomTrail) {
        bottomTrail.style.height = `${trailState.bottom.toFixed(1)}%`;
      }
    };

    const resetTrails = (animate = true) => {
      trailTween?.kill();
      if (!animate) {
        trailState.top = 0;
        trailState.bottom = 0;
        syncTrailHeight();
        return;
      }
      trailTween = gsap.to(trailState, {
        top: 0,
        bottom: 0,
        duration: 0.55,
        ease: "power2.out",
        onUpdate: syncTrailHeight,
      });
    };

    // Exact clip-path window sync matching `.timeline_current` over `.timeline_progress`
    const syncClipWindow = () => {
      const cRect = current.getBoundingClientRect();
      const pRect = progressClip.getBoundingClientRect();
      if (pRect.height <= 0) return;

      if (cRect.bottom <= pRect.top || cRect.top >= pRect.bottom) {
        progressClip.style.clipPath = "inset(0px 0px 100% 0px)";
        return;
      }

      const topInset = Math.max(0, cRect.top - pRect.top);
      const bottomEdge = Math.min(pRect.height, cRect.bottom - pRect.top);
      const bottomInset = Math.max(0, pRect.height - bottomEdge);
      progressClip.style.clipPath = `inset(${Math.round(topInset)}px 0px ${Math.round(bottomInset)}px 0px)`;
    };

    const playEntranceReveal = () => {
      if (revealed) return;
      revealed = true;
      if (headingRef.current) {
        gsap.to(headingRef.current, {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.9,
          ease: "power2.out",
          overwrite: true,
        });
      }
      [leftColRef.current, rightColRef.current].forEach((col, i) => {
        if (!col) return;
        gsap.to(col, {
          y: 0,
          opacity: 1,
          duration: 0.9,
          delay: i * 0.12,
          ease: "power2.out",
          overwrite: true,
        });
      });
      gsap.to([progressMain, progressClip], {
        opacity: 1,
        duration: 0.85,
        ease: "power2.out",
        overwrite: true,
      });
    };

    const playReverseHide = () => {
      revealed = false;
      if (headingRef.current) {
        gsap.to(headingRef.current, {
          y: 40,
          scale: 0.82,
          opacity: 0,
          duration: 0.5,
          ease: "power2.in",
          overwrite: true,
        });
      }
      [leftColRef.current, rightColRef.current].forEach((col) => {
        if (!col) return;
        gsap.to(col, {
          y: 50,
          opacity: 0,
          duration: 0.45,
          ease: "power2.in",
          overwrite: true,
        });
      });
    };

    const handlePortalReveal = () => playEntranceReveal();
    const handlePortalReverse = () => playReverseHide();
    window.addEventListener("sui:portal-reveal", handlePortalReveal);
    window.addEventListener("sui:portal-reverse", handlePortalReverse);

    let lastProgress = -1;
    let lastTime = performance.now();

    gsap.ticker.add(syncClipWindow);

    const ctx = gsap.context(() => {
      // Initial resting offsets (guaranteed to reveal via portal event OR fail-open ScrollTrigger below)
      if (headingRef.current) {
        gsap.set(headingRef.current, { y: 40, scale: 0.82, opacity: 0 });
      }
      [leftColRef.current, rightColRef.current].forEach((col) => {
        if (col) gsap.set(col, { y: 50, opacity: 0 });
      });

      // Fail-open reveal whenever #stack-timeline is in/past viewport
      ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        onEnter: playEntranceReveal,
        onEnterBack: playEntranceReveal,
      });

      // If browser jumped directly past/into section on load (e.g. #stack-timeline hash or restored scroll)
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.95) {
        playEntranceReveal();
      }

      // CRITICAL: Trigger on non-sticky `progressMain` (with resting center offset of `.timeline-current`)
      // so ScrollTrigger.refresh() while sticky never shifts `start` / `end` mid-scroll!
      ScrollTrigger.create({
        trigger: progressMain,
        start: () => `top+=${current.offsetHeight / 2} center`,
        end: "bottom center",
        invalidateOnRefresh: true,
        onEnter: () => {
          isActive = true;
          playEntranceReveal();
        },
        onEnterBack: () => {
          isActive = true;
          playEntranceReveal();
        },
        onLeave: () => {
          isActive = false;
          resetTrails(true);
        },
        onLeaveBack: () => {
          isActive = false;
          resetTrails(true);
        },
        onUpdate: (self) => {
          const t = self.progress;

          if (!getIsMobile()) {
            Object.entries(CHECKPOINT_BY_NUMBER).forEach(([num, cp]) => {
              toggleCard(num, t >= cp);
            });
          }

          if (!isActive && t <= 0) return;

          // Edge taper multiplier at start (< 0.15) & end (> 0.85)
          const edgeFactor = Math.min(
            t > 0.85 ? gsap.utils.mapRange(0.85, 1, 1, 0, t) : 1,
            t < 0.15 ? gsap.utils.mapRange(0, 0.15, 0, 1, t) : 1
          );

          const now = performance.now();
          const dt = Math.max(8, now - lastTime);
          const rawDelta = lastProgress < 0 ? 0 : t - lastProgress;
          lastProgress = t;
          lastTime = now;

          // Normalize velocity relative to track progress/sec & clamp cleanly
          const velPerSec = (rawDelta * 1000) / dt;
          const absStretch = Math.min(Math.abs(velPerSec) * 160 * edgeFactor, 46 * edgeFactor);

          if (absStretch > 2.5) {
            trailTween?.kill();
            if (velPerSec > 0) {
              trailTween = gsap.to(trailState, {
                top: absStretch,
                bottom: 0,
                duration: 0.28,
                ease: "power2.out",
                onUpdate: syncTrailHeight,
              });
            } else {
              trailTween = gsap.to(trailState, {
                top: 0,
                bottom: absStretch,
                duration: 0.28,
                ease: "power2.out",
                onUpdate: syncTrailHeight,
              });
            }
          }

          // Unconditional idle retract so trails NEVER stay stuck open after slow scroll stops
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            resetTrails(true);
          }, 110);
        },
      });
    }, el);

    syncClipWindow();
    syncTrailHeight();

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      trailTween?.kill();
      Object.values(cardState).forEach((s) => s.tl?.kill());
      window.removeEventListener("sui:portal-reveal", handlePortalReveal);
      window.removeEventListener("sui:portal-reverse", handlePortalReverse);
      gsap.ticker.remove(syncClipWindow);
      ctx.revert();
    };
  }, []);

  const setCardRef = (num: string) => (node: HTMLElement | null) => {
    cardRefs.current[num] = node;
  };

  return (
    <section
      ref={sectionRef}
      id="stack-timeline"
      className="relative w-full bg-black text-white pt-[5.5em] pb-[6em] md:pt-[6.5em] md:pb-[6em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Centered 90px Display Heading */}
          <h2
            ref={headingRef}
            className="text-[2.5em] sm:text-[4em] md:text-[5.625em] font-normal leading-[1] tracking-[-0.045em] text-white text-center max-w-[12em] mx-auto mb-[1em]"
          >
            {stackTimeline.heading}
          </h2>

          {/* Desktop Asymmetric Offset 3-Flex Layout matching `.timeline_main` */}
          <div className="hidden md:flex items-stretch justify-center gap-[3.75em] w-full">
            {/* Left Column (02 Walrus, 04 Nautilus, 06 SuiNS) — 50em top offset, 59em gap */}
            <div
              ref={leftColRef}
              className="w-full max-w-[28.938em] pt-[50em] flex flex-col gap-[59em]"
            >
              {leftCards.map((card) => (
                <TimelineCardItem
                  key={card.number}
                  card={card}
                  cardRef={setCardRef(card.number)}
                  defaultOpen={false}
                />
              ))}
            </div>

            {/* Center Rail (`248em` tall, clipped `15.626em` sticky window + centered cube + trails) */}
            <div
              ref={progressMainRef}
              className="relative flex flex-col items-center h-[248em] w-[2px] shrink-0"
            >
              {/* Sticky Active Tracking Window — cube stays anchored dead center while blue trails extend outward */}
              <div
                ref={currentRef}
                className="timeline-current sticky top-[35%] z-10 flex items-center justify-center w-[2px] h-[15.626em]"
              >
                <div
                  ref={topTrailRef}
                  className="absolute bottom-1/2 left-0 w-[2px] bg-[#CCFF00] pointer-events-none"
                  style={{ height: "0%" }}
                />
                <div className="relative z-[2] w-[0.75em] h-[0.75em] min-h-[0.75em] bg-white shadow-[0_0_16px_rgba(204,255,0,0.9)] shrink-0" />
                <div
                  ref={bottomTrailRef}
                  className="absolute top-1/2 left-0 w-[2px] bg-[#CCFF00] pointer-events-none"
                  style={{ height: "0%" }}
                />
              </div>

              {/* Crisp SVG Dotted Rail Clipped dynamically to the sticky window */}
              <div
                ref={progressClipRef}
                aria-hidden="true"
                className="absolute inset-0 w-[2px] h-full flex justify-center pointer-events-none"
              >
                <div
                  className="w-[2px] h-full"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)",
                    backgroundSize: "2px 6px",
                    backgroundRepeat: "repeat-y",
                    backgroundPosition: "center top",
                  }}
                />
              </div>
            </div>

            {/* Right Column (01 Sui, 03 Seal, 05 DeepBook) — 7.75em top offset, 59em gap */}
            <div
              ref={rightColRef}
              className="w-full max-w-[28.938em] pt-[7.75em] flex flex-col gap-[59em]"
            >
              {rightCards.map((card) => (
                <TimelineCardItem
                  key={card.number}
                  card={card}
                  cardRef={setCardRef(card.number)}
                  defaultOpen={false}
                />
              ))}
            </div>
          </div>

          {/* Mobile Single-Column Sequence (always open cards matching `.timeline_main.mobile`) */}
          <div className="md:hidden mt-[2.5em] flex flex-col gap-[1.5em]">
            {stackTimeline.cards.map((card) => (
              <TimelineCardItem
                key={card.number}
                card={card}
                defaultOpen={true}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineCardItem({
  card,
  cardRef,
  defaultOpen,
}: {
  card: StackTimelineCard;
  cardRef?: (node: HTMLElement | null) => void;
  defaultOpen: boolean;
}) {
  return (
    <article
      ref={cardRef}
      className="relative w-full bg-[#131518] border-x-[1.5px] border-[#4b515b] flex flex-col overflow-hidden"
    >
      {/* Left Inner Vertical Connector + Bottom Turn matching `.timeline_connector` */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[1.4em] ml-[2.2em] pt-[2.55em] pb-[2.15em] z-[2] flex flex-col"
      >
        <div className="w-[1.5px] flex-1 bg-[#4b515b]" />
        <div className="w-full h-[1.5px] bg-[#4b515b]" />
      </div>

      {/* Top Bar (`.timeline_colum_card`) */}
      <div
        className="relative flex items-center gap-[0.75em] border-y-[1.5px] border-[#4b515b] bg-[#131518]"
        onMouseEnter={(e) => {
          const t = e.currentTarget.querySelector<HTMLElement>("[data-card-title]");
          if (t) runDomScramble(t, card.title);
        }}
      >
        <div className="w-[2.5em] h-[2.5em] border-r-[1.5px] border-[#4b515b] text-[#CCFF00] flex items-center justify-center shrink-0">
          <ProtocolIcon name={card.iconKey} className="w-[1.15em] h-[1.15em]" />
        </div>
        <div className="font-mono text-[0.875em] text-white pr-[1em] py-[0.55em] leading-[1.3]">
          <span data-card-title="" data-text={card.title}>
            {card.title}
          </span>
        </div>
        {/* Corner masking cube */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 ml-[1.8em] translate-y-1/2 w-[0.875em] h-[0.875em] bg-[#131518] z-[1]"
        />
      </div>

      {/* GSAP Collapsible Rive Box (height: 0em <-> 17em, overflow-hidden).
          Inner `.rivesize` ALWAYS keeps its fixed 17em height so Rive canvas never collapses to 0px! */}
      <div
        data-card-anim=""
        className="w-full overflow-hidden"
        style={{ height: defaultOpen ? "13.438em" : "0em" }}
      >
        <div
          data-rive-inner=""
          className={`w-full h-[13.438em] md:h-[17em] pl-[2.25em] pr-[1em] py-[0.75em] flex items-center justify-center origin-bottom ${card.rivePadClass ?? ""}`}
        >
          <NtiStackVisual kind={card.iconKey} />
        </div>
      </div>

      {/* Bottom Protocol Footer (`.timeline_colum_card.bottom`) */}
      <div
        data-card-footer=""
        className="relative flex items-center gap-[0.75em] pl-[4.188em] py-[0.85em] border-b-[1.5px] border-[#4b515b]"
        style={{
          borderTopWidth: "1.5px",
          borderTopStyle: "solid",
          borderTopColor: defaultOpen ? "#4b515b" : "transparent",
        }}
      >
        <div className="w-[1.6em] h-[1.6em] flex items-center justify-center text-white shrink-0">
          <ProtocolIcon name={card.iconKey} className="w-full h-full" />
        </div>
        <span className="text-[1.125em] text-[#89919f]">{card.protocol}</span>
        {/* Bottom corner cube */}
        <span
          aria-hidden="true"
          className="absolute top-[-0.9em] left-0 ml-[1.8em] w-[0.875em] h-[0.875em] bg-[#131518] z-[1]"
        />
      </div>
    </article>
  );
}
