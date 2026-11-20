"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { DottedDivider } from "@/components/ui/DottedDivider";
import {
  BellIcon,
  DiscordIcon,
  ExternalArrowIcon,
  PlayIcon,
  SingleArrowIcon,
  XIcon,
} from "@/components/ui/Icons";

function formatUsd(value: number) {
  return "$" + Math.round(value).toLocaleString("en-US");
}

export function StayInLoopSection() {
  const { stayInLoop } = HOME_CONTENT;
  const sectionRef = useRef<HTMLElement>(null);
  const headingCharsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const bellRef = useRef<HTMLSpanElement>(null);
  const subtitleMaskRef = useRef<HTMLDivElement>(null);
  const tvlRef = useRef<HTMLDivElement>(null);
  const [targetTvl, setTargetTvl] = useState<number>(
    stayInLoop.tvl.fallbackNumeric
  );
  const [displayTvl, setDisplayTvl] = useState<string>(
    stayInLoop.tvl.fallbackFormatted
  );
  const hasAnimatedTvl = useRef(false);

  const prefixChars = stayInLoop.headingPrefix.split("");
  const suffixChars = stayInLoop.headingSuffix.split("");

  // _revealText2Animation: char stagger + bell scale + subtitle mask wipe
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const chars = headingCharsRef.current.filter(Boolean);
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 75%", once: true },
      });

      if (chars.length) {
        tl.fromTo(
          chars,
          { y: 6, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.21, stagger: 0.03, ease: "none" },
          0
        );
      }

      if (bellRef.current) {
        tl.fromTo(
          bellRef.current,
          { scale: 0.4, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.28, ease: "back.out(2)" },
          0.18
        );
      }

      if (subtitleMaskRef.current) {
        tl.fromTo(
          subtitleMaskRef.current,
          { scaleX: 1, transformOrigin: "right center" },
          { scaleX: 0, duration: 0.85, ease: "power2.out" },
          0.2
        );
      }
    }, el);

    return () => ctx.revert();
  }, []);

  // Fetch live Sui TVL from DeFiLlama with safe fallback
  useEffect(() => {
    let cancelled = false;
    fetch(stayInLoop.tvl.apiUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((chains: Array<{ name?: string; tvl?: number }> | null) => {
        if (cancelled || !Array.isArray(chains)) return;
        const sui = chains.find(
          (c) => c.name?.toLowerCase() === "sui" && typeof c.tvl === "number"
        );
        if (sui && typeof sui.tvl === "number" && sui.tvl > 0) {
          setTargetTvl(sui.tvl);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stayInLoop.tvl.apiUrl]);

  // Animate TVL counter from $0 to targetTvl when scrolled into view
  useEffect(() => {
    const el = tvlRef.current;
    if (!el) return;

    const runCountUp = (goal: number) => {
      const duration = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 2);
        setDisplayTvl(formatUsd(goal * eased));
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setDisplayTvl(formatUsd(goal));
        }
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasAnimatedTvl.current) {
          hasAnimatedTvl.current = true;
          runCountUp(targetTvl);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [targetTvl]);

  useEffect(() => {
    if (hasAnimatedTvl.current) {
      setDisplayTvl(formatUsd(targetTvl));
    }
  }, [targetTvl]);

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black text-white pt-[4em] pb-[6em] md:pt-[5em] md:pb-[8em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Char-staggered Heading with blue Bell square */}
          <h2 className="text-[2.5em] sm:text-[4em] md:text-[5.625em] font-normal leading-[1] tracking-[-0.045em] text-white text-center flex flex-wrap items-center justify-center gap-x-[0.22em]">
            <span className="inline-block whitespace-nowrap">
              {prefixChars.map((ch, idx) => (
                <span
                  key={`p-${idx}`}
                  ref={(el) => {
                    headingCharsRef.current[idx] = el;
                  }}
                  className="inline-block"
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>

            <span
              ref={bellRef}
              className="inline-flex items-center justify-center w-[0.9em] h-[0.9em] bg-[#298dff] text-white shrink-0"
            >
              <BellIcon className="w-[0.52em] h-[0.52em]" />
            </span>

            <span className="inline-block whitespace-nowrap">
              {suffixChars.map((ch, idx) => (
                <span
                  key={`s-${idx}`}
                  ref={(el) => {
                    headingCharsRef.current[prefixChars.length + idx] = el;
                  }}
                  className="inline-block"
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
          </h2>

          {/* Subtitle with mask wipe */}
          <div className="mt-[1.35em] flex items-center justify-center gap-[0.65em] text-center">
            <span
              aria-hidden="true"
              className="w-[0.65em] h-[0.65em] bg-[#298dff] shrink-0"
            />
            <div className="relative overflow-hidden">
              <p className="text-[0.9375em] md:text-[1.0625em] text-[#c2c6cd]">
                {stayInLoop.subtitle}
              </p>
              <div
                ref={subtitleMaskRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to left, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)",
                }}
              />
            </div>
          </div>

          {/* Asymmetric 7-Col Bento Grid */}
          <div className="mt-[3.5em] md:mt-[4.5em] grid grid-cols-1 lg:grid-cols-7 gap-[1em]">
            {/* Cell 1: Featured Stories */}
            <div className="lg:col-span-3 lg:row-span-2 bg-[#131518] border border-[#343940] p-[1.5em] flex flex-col justify-between">
              <div>
                <div className="font-mono text-[0.75em] uppercase tracking-wider text-[#89919f] mb-[1.25em]">
                  {stayInLoop.featuredHeading}
                </div>

                <div className="flex flex-col">
                  {stayInLoop.featuredItems.map((item, idx) => (
                    <React.Fragment key={item.title}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sui-featured-item flex items-center justify-between gap-[1em] py-[1em] group"
                      >
                        <div className="flex items-stretch gap-[0.85em] min-w-0">
                          <div className="w-[6em] sm:w-[7.25em] h-[4.25em] shrink-0 overflow-hidden bg-[#222529]">
                            <img
                              src={item.thumbnail}
                              alt=""
                              loading="lazy"
                              className="sui-featured-thumb w-full h-full object-cover block"
                            />
                          </div>
                          <h3 className="text-[0.9375em] font-medium leading-[1.35] text-white group-hover:text-[#298dff] transition-colors flex items-center">
                            {item.title}
                          </h3>
                        </div>

                        <span className="sui-featured-arrow w-[2em] h-[2em] bg-[#222529] text-white flex items-center justify-center shrink-0 transition-colors">
                          <SingleArrowIcon className="w-[0.75em] h-[0.65em]" />
                        </span>
                      </a>

                      {idx < stayInLoop.featuredItems.length - 1 && (
                        <DottedDivider color="#343940" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Cells 2 & 3: Event Video Recap Cards */}
            {stayInLoop.videoRecaps.map((recap) => (
              <VideoRecapCard key={recap.title} recap={recap} />
            ))}

            {/* Cell 4: TVL + Discord + X Bottom Row */}
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-4 gap-[1em]">
              <div
                ref={tvlRef}
                className="sm:col-span-2 bg-[#131518] border border-[#343940] p-[1.5em] flex flex-col justify-between min-h-[12.5em]"
              >
                <div className="flex items-center justify-between gap-[0.5em]">
                  <span className="text-[1em] font-medium text-white">
                    {stayInLoop.tvl.label}
                  </span>
                  <span className="font-mono text-[0.75em] text-[#89919f]">
                    {stayInLoop.tvl.caption}
                  </span>
                </div>

                <div className="mt-[2em] text-[2em] sm:text-[2.35em] font-normal tracking-[-0.03em] text-white tabular-nums break-words">
                  {displayTvl}
                </div>
              </div>

              {stayInLoop.socialTiles.map((tile) => (
                <a
                  key={tile.name}
                  href={tile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:col-span-1 bg-[#131518] hover:bg-[#298dff] border border-[#343940] hover:border-[#298dff] transition-colors duration-200 p-[1.35em] flex flex-col justify-between min-h-[12.5em] group"
                >
                  <div className="flex items-center justify-end text-[#89919f] group-hover:text-white transition-colors">
                    <ExternalArrowIcon className="w-[0.75em] h-[0.75em]" />
                  </div>

                  <div className="flex items-center justify-center my-[0.75em]">
                    {tile.kind === "discord" ? (
                      <DiscordIcon className="w-[2.5em] h-[2.5em] text-white" />
                    ) : (
                      <XIcon className="w-[2.15em] h-[2.15em] text-white" />
                    )}
                  </div>

                  <div className="text-[0.9375em] font-medium text-white text-center">
                    {tile.name}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VideoRecapCard({
  recap,
}: {
  recap: (typeof HOME_CONTENT.stayInLoop.videoRecaps)[number];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnter = () => {
    const vid = videoRef.current;
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  };

  const handleLeave = () => {
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      vid.currentTime = 0;
    }
  };

  return (
    <a
      href={recap.href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="lg:col-span-2 sui-fest-btn relative bg-[#131518] border border-[#343940] overflow-hidden min-h-[16em] flex flex-col justify-end group"
    >
      <video
        ref={videoRef}
        src={recap.videoSrc}
        poster={recap.posterSrc}
        muted
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none"
      />

      <div className="relative z-10 p-[1.25em] flex items-center justify-between gap-[0.75em]">
        <span className="text-[1.125em] font-medium text-white">
          {recap.title}
        </span>

        <span className="sui-fest-text inline-flex items-center gap-[0.45em] bg-[#222529]/90 text-white text-[0.75em] font-medium px-[0.75em] py-[0.45em] transition-colors shrink-0">
          <PlayIcon className="w-[0.65em] h-[0.65em]" />
          <span>{recap.ctaLabel}</span>
        </span>
      </div>
    </a>
  );
}
