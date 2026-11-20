"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_CONTENT } from "@/content/home";
import { DottedDivider } from "@/components/ui/DottedDivider";
import {
  AiSparkIcon,
  NavMenuIcon,
  ProtocolIcon,
  SlideArrow,
  TreeBranchIcon,
} from "@/components/ui/Icons";
import { LottieIcon } from "@/components/ui/LottieIcon";

function ArrowRevealLabel({
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

export function IndustrySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const { industry } = HOME_CONTENT;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      // Parallax heading matching initParalaxReveal
      if (headingRef.current) {
        gsap.fromTo(
          headingRef.current,
          { y: 0 },
          {
            y: "-2em",
            ease: "power1.out",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
            },
          }
        );
      }

      // Column stagger reveal matching global="revealColums"
      const cards = el.querySelectorAll("[data-industry-card]");
      if (cards.length) {
        gsap.fromTo(
          cards,
          { yPercent: 20, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: 0.65,
            stagger: 0.1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: gridRef.current || el,
              start: "top 80%",
              once: true,
            },
          }
        );
      }

      // Dotted dividers draw 0 -> 100% width matching _initIndustryRowReveal
      const cardDividers = el.querySelectorAll("[data-industry-divider]");
      cardDividers.forEach((div) => {
        gsap.fromTo(
          div,
          { width: "0%" },
          {
            width: "100%",
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: div,
              start: "top 85%",
              once: true,
            },
          }
        );
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black text-white pt-[4em] pb-[6em] md:pt-[6em] md:pb-[8em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Top Heading */}
          <h2
            ref={headingRef}
            className="text-[2.5em] sm:text-[4em] md:text-[5.625em] font-normal leading-[1] tracking-[-0.045em] text-white max-w-[13em] mb-[1em] md:mb-[1.2em]"
          >
            {industry.headingWords.join(" ")}
          </h2>

          {/* Three Industry Cards */}
          <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-3 gap-[1.25em]">
            {industry.cards.map((card, idx) => {
              const isHovered = hoveredCard === idx;
              return (
                <article
                  key={card.title}
                  data-industry-card=""
                  onMouseEnter={() => setHoveredCard(idx)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-[#131518] border border-[#343940] transition-colors duration-200 p-[1.75em] md:p-[2em] flex flex-col justify-between"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-[1em]">
                      <div className="w-[3em] h-[3em] bg-[#222529] text-[#CCFF00] flex items-center justify-center shrink-0">
                        {card.iconKind === "svg-ai" ? (
                          <AiSparkIcon className="w-[1.6em] h-[1.6em]" />
                        ) : (
                          card.lottieSrc && (
                            <LottieIcon
                              src={card.lottieSrc}
                              playOnScroll
                              isHovered={isHovered}
                              className="w-[2em] h-[2em]"
                            />
                          )
                        )}
                      </div>

                      {/* Protocol Marks */}
                      <div className="flex items-center gap-[0.55em] text-[#a1a7b2]">
                        {card.protocolMarks.map((mark) => {
                          const labelMap: Record<string, string> = {
                            engine: "NTI Engine",
                            archive: "IPFS & Archive",
                            oracle: "NarrativeOracle",
                            guard: "Dispute Guard",
                            market: "RelativePairMarket",
                            twap: "Uniswap V3 Vaults",
                          };
                          return (
                            <span
                              key={mark}
                              title={labelMap[mark] ?? mark}
                              className="w-[1.75em] h-[1.75em] bg-[#222529] border border-[#343940] flex items-center justify-center text-white"
                            >
                              <ProtocolIcon
                                name={mark}
                                className="w-[0.95em] h-[0.95em]"
                              />
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <h3 className="mt-[1.35em] text-[1.625em] md:text-[1.875em] font-normal leading-[1.15] tracking-[-0.025em] text-white">
                      {card.title}
                    </h3>

                    <div
                      data-industry-divider=""
                      className="my-[1.35em] overflow-hidden"
                    >
                      <DottedDivider color="#4b515b" />
                    </div>

                    <p className="text-[1.0625em] md:text-[1.125em] leading-[1.35] text-white mb-[1.15em]">
                      {card.subtitle}
                    </p>

                    <ul className="space-y-[0.7em] list-none p-0 m-0">
                      {card.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-start gap-[0.65em] text-[0.9375em] leading-[1.4] text-[#c2c6cd]"
                        >
                          <TreeBranchIcon className="w-[0.95em] h-[0.95em] text-[#CCFF00] shrink-0 mt-[0.25em]" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div
                      data-industry-divider=""
                      className="my-[1.5em] overflow-hidden"
                    >
                      <DottedDivider color="#4b515b" />
                    </div>

                    {/* Expanding #CCFF00 .industryhover bar (3em -> 100%, expo.out) + ArrowRevealLabel */}
                    <a
                      href={card.href}
                      className="sui-arrow-trigger relative w-full h-[3em] flex items-center bg-[#222529] text-white text-[0.9375em] font-normal overflow-hidden"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute top-0 left-0 bottom-0 bg-[#CCFF00] transition-[width] duration-[350ms] ease-out pointer-events-none"
                        style={{ width: isHovered ? "100%" : "3em" }}
                      />
                      <span className="relative z-10 w-[3em] h-[3em] text-black flex items-center justify-center shrink-0">
                        <SlideArrow className="w-[0.85em] h-[0.75em]" />
                      </span>
                      <span
                        className={`relative z-10 px-[1em] flex items-center transition-colors duration-200 ${
                          isHovered ? "text-black" : "text-white"
                        }`}
                      >
                        <ArrowRevealLabel
                          text={card.ctaLabel}
                          hovered={isHovered}
                        />
                      </span>
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Get Started 4 Interactive Rows matching initBlinkReveal (`0 -> 5.625em` blue blink!) + _initTabsHoverV2 */}
          <div className="pt-[6.5em] md:pt-[8.5em]">
            <h2 className="text-[2.5em] sm:text-[4em] md:text-[5.625em] font-normal leading-[1] tracking-[-0.045em] text-white mb-[0.75em]">
              {industry.getStartedHeading}
            </h2>

            <div
              className="transition-opacity duration-300"
              style={{ opacity: hoveredRow === 0 ? 0 : 1 }}
            >
              <DottedDivider color="#4b515b" />
            </div>

            {industry.getStartedRows.map((row, idx) => {
              const isHovered = hoveredRow === idx;
              const hideBottomDivider =
                hoveredRow === idx || hoveredRow === idx + 1;
              return (
                <React.Fragment key={row.title}>
                  <a
                    href={row.href}
                    onMouseEnter={() => setHoveredRow(idx)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className="sui-arrow-trigger group relative block py-[2em] md:py-[2.5em] overflow-hidden"
                  >
                    {/* #222529 30% -> 100% Backdrop Wipe matching initMainHover */}
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 w-full bg-[#222529] pointer-events-none z-0 transition-all duration-300 ease-out"
                      style={{
                        height: isHovered ? "100%" : "30%",
                        opacity: isHovered ? 1 : 0,
                      }}
                    />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-[1.25em] md:gap-[2em] px-[0.5em]">
                      <div className="flex items-center gap-[1.25em] md:gap-0 min-w-0 flex-1">
                        {/* Desktop blinkReveal icon box: 0x0 at rest -> 5.625em `#CCFF00` Lottie on hover */}
                        <div
                          className={`hidden md:flex items-center justify-center shrink-0 bg-[#CCFF00] text-black overflow-hidden transition-all duration-350 ease-out ${
                            isHovered
                              ? "w-[5.625em] h-[5.625em] p-[0.513em] mr-[1.75em] opacity-100"
                              : "w-0 h-0 p-0 mr-0 opacity-0"
                          }`}
                        >
                          <LottieIcon
                            src={row.lottieSrc}
                            playOnScroll={false}
                            isHovered={isHovered}
                            className="w-[3.25em] h-[3.25em] brightness-0"
                          />
                        </div>

                        {/* Mobile static icon */}
                        <div className="md:hidden w-[3.25em] h-[3.25em] bg-[#CCFF00] text-black flex items-center justify-center shrink-0">
                          <NavMenuIcon
                            icon={row.mobileIconKey}
                            className="w-[1.5em] h-[1.5em]"
                          />
                        </div>

                        {/* Row Heading */}
                        <h3 className="text-[1.875em] sm:text-[2.75em] md:text-[3.75em] font-normal leading-[1.05] tracking-[-0.035em] text-white">
                          {row.title}
                        </h3>
                      </div>

                      {/* Right group: Description + Clipped Blue CTA */}
                      <div className="flex flex-col md:flex-row md:items-center gap-[1.25em] md:gap-[2em] md:w-[48%] justify-between shrink-0">
                        <p
                          className={`text-[0.9375em] md:text-[1em] leading-[1.4] transition-colors duration-200 max-w-[22em] ${
                            isHovered ? "text-white" : "text-[#89919f]"
                          }`}
                        >
                          {row.description}
                        </p>

                        <div
                          className="sui-getstarted-cta inline-flex items-center gap-[0.65em] bg-[#CCFF00] text-black px-[1.15em] py-[0.8em] text-[0.875em] font-medium self-start md:self-auto whitespace-nowrap transition-[clip-path] duration-300 ease-out"
                          style={
                            {
                              "--cta-clip": isHovered
                                ? "inset(0 0 0% 0)"
                                : "inset(0 0 100% 0)",
                            } as React.CSSProperties
                          }
                        >
                          <span>{row.ctaLabel}</span>
                          <SlideArrow className="w-[0.8em] h-[0.7em]" />
                        </div>
                      </div>
                    </div>
                  </a>

                  <div
                    className="transition-opacity duration-300"
                    style={{ opacity: hideBottomDivider ? 0 : 1 }}
                  >
                    <DottedDivider color="#4b515b" />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
