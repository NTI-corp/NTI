"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, Copy } from "lucide-react";
import {
  PROTOCOL_ADDRESSES,
  ROBINHOOD_MAINNET_ID,
  robinhoodMainnet,
} from "@nti/sdk";
import { HOME_CONTENT, type DeployedContractMeta } from "@/content/home";
import { DottedDivider } from "@/components/ui/DottedDivider";
import { ExternalArrowIcon, NtiOracleIcon, ProtocolIcon, RobinhoodMark } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!$^*()-_=+[]{}";

function runDomScramble(el: HTMLElement, text: string) {
  const activeRaf = Number(el.dataset.scrambleRaf || "0");
  if (activeRaf) cancelAnimationFrame(activeRaf);

  const start = performance.now();
  const duration = Math.min(550, Math.max(240, text.length * 18));

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

export function StayInLoopSection() {
  const { deployedContracts } = HOME_CONTENT;
  const addresses = PROTOCOL_ADDRESSES[ROBINHOOD_MAINNET_ID];
  const explorerBase =
    robinhoodMainnet.blockExplorers?.default.url ??
    "https://robinhoodchain.blockscout.com";

  const sectionRef = useRef<HTMLElement>(null);
  const headingCharsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const subtitleMaskRef = useRef<HTMLDivElement>(null);
  const timelineWrapRef = useRef<HTMLDivElement>(null);
  const progressMainRef = useRef<HTMLDivElement>(null);
  const topTrailRef = useRef<HTMLDivElement>(null);
  const bottomTrailRef = useRef<HTMLDivElement>(null);
  const progressClipRef = useRef<HTMLDivElement>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const prefixChars = deployedContracts.headingPrefix.split("");
  const suffixChars = deployedContracts.headingSuffix.split("");

  const leftCards = deployedContracts.cards.filter((c) => c.column === "left");
  const rightCards = deployedContracts.cards.filter((c) => c.column === "right");

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

      if (badgeRef.current) {
        tl.fromTo(
          badgeRef.current,
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

      // Sync vertical dotted progress rail & sticky #CCFF00 trails inside contracts timeline
      const wrap = timelineWrapRef.current;
      const topTrail = topTrailRef.current;
      const bottomTrail = bottomTrailRef.current;
      const clip = progressClipRef.current;

      if (wrap && clip) {
        const trail = { top: 0, bottom: 0 };
        let tween: gsap.core.Tween | null = null;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        let isActive = false;

        const applyTrails = (dir: number) => {
          if (topTrail) topTrail.style.height = `${trail.top}%`;
          if (bottomTrail) bottomTrail.style.height = `${trail.bottom}%`;
          if (dir === -1) {
            clip.style.clipPath = `inset(0% 0px calc(${50 - trail.bottom}%) 0px)`;
          } else {
            clip.style.clipPath = `inset(calc(${50 - trail.top}%) 0px 0% 0px)`;
          }
        };

        ScrollTrigger.create({
          trigger: wrap,
          start: "top 65%",
          end: "bottom 40%",
          scrub: true,
          onUpdate: (self) => {
            if (!isActive) return;
            const dir = self.direction;
            tween?.kill();
            tween = gsap.to(trail, {
              top: dir === 1 ? 48 : 0,
              bottom: dir === -1 ? 48 : 0,
              duration: 0.22,
              ease: "power2.out",
              onUpdate: () => applyTrails(dir),
            });
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              tween?.kill();
              tween = gsap.to(trail, {
                top: 0,
                bottom: 0,
                duration: 0.45,
                ease: "power2.out",
                onUpdate: () => applyTrails(0),
              });
            }, 140);
          },
          onEnter: () => {
            isActive = true;
          },
          onEnterBack: () => {
            isActive = true;
          },
          onLeave: () => {
            isActive = false;
          },
          onLeaveBack: () => {
            isActive = false;
          },
        });
      }
    }, el);

    return () => ctx.revert();
  }, []);

  const handleCopy = (key: string, address: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(address).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  return (
    <section
      ref={sectionRef}
      id="deployed-contracts"
      className="w-full bg-black text-white pt-[4em] pb-[6em] md:pt-[5em] md:pb-[8em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          {/* Char-staggered Heading with #CCFF00 Oracle Emblem */}
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
              ref={badgeRef}
              className="inline-flex items-center justify-center w-[0.9em] h-[0.9em] bg-[#CCFF00] text-black shrink-0"
            >
              <NtiOracleIcon className="w-[0.55em] h-[0.55em]" />
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
          <div className="mt-[1.35em] flex items-center justify-center gap-[0.75em] text-center">
            <PixelOwlMascot variant="sentinel" size={30} label="8-bit Validator Sentinel" />
            <div className="relative overflow-hidden">
              <p className="text-[0.9375em] md:text-[1.0625em] text-[#c2c6cd] inline-flex flex-wrap items-center justify-center gap-x-[0.35em]">
                <span>14 protocol contracts live on</span>
                <RobinhoodMark className="inline-block h-[1em] w-auto -mt-[0.1em] opacity-95" />
                <span>Chain Mainnet (4663)</span>
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

          <div className="mt-[3em] mb-[3.5em]">
            <DottedDivider color="#4b515b" />
          </div>

          {/* Alternating Timeline Grid matching StackTimelineSection architecture */}
          <div
            ref={timelineWrapRef}
            className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-x-[2.5em] lg:gap-x-[3.5em] items-stretch"
          >
            {/* Left Column (01, 03, 05, ...) */}
            <div className="flex flex-col gap-[3.25em]">
              {leftCards.map((card) => {
                const addr = addresses[card.key];
                if (!addr) return null;
                return (
                  <ContractTimelineCard
                    key={card.key}
                    card={card}
                    address={addr}
                    explorerBase={explorerBase}
                    copied={copiedKey === card.key}
                    onCopy={() => handleCopy(card.key, addr)}
                  />
                );
              })}
            </div>

            {/* Center Dotted Timeline Rail + Sticky Glowing #CCFF00 Cube */}
            <div
              ref={progressMainRef}
              className="relative flex flex-col items-center w-[2px] shrink-0"
            >
              <div className="sticky top-[40%] z-10 flex items-center justify-center w-[2px] h-[12em]">
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

              <div
                ref={progressClipRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  clipPath: "inset(50% 0px 50% 0px)",
                  backgroundImage:
                    "radial-gradient(circle, rgba(204,255,0,0.9) 1px, transparent 1px)",
                  backgroundSize: "2px 10px",
                  backgroundPosition: "center top",
                  backgroundRepeat: "repeat-y",
                }}
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-45"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #4b515b 1px, transparent 1px)",
                  backgroundSize: "2px 10px",
                  backgroundPosition: "center top",
                  backgroundRepeat: "repeat-y",
                }}
              />
            </div>

            {/* Right Column staggered downward (02, 04, 06, ...) */}
            <div className="flex flex-col gap-[3.25em] mt-[6em]">
              {rightCards.map((card) => {
                const addr = addresses[card.key];
                if (!addr) return null;
                return (
                  <ContractTimelineCard
                    key={card.key}
                    card={card}
                    address={addr}
                    explorerBase={explorerBase}
                    copied={copiedKey === card.key}
                    onCopy={() => handleCopy(card.key, addr)}
                  />
                );
              })}
            </div>
          </div>

          {/* Mobile Single-Column Sequential Timeline */}
          <div className="flex flex-col gap-[1.5em] md:hidden">
            {deployedContracts.cards.map((card) => {
              const addr = addresses[card.key];
              if (!addr) return null;
              return (
                <ContractTimelineCard
                  key={card.key}
                  card={card}
                  address={addr}
                  explorerBase={explorerBase}
                  copied={copiedKey === card.key}
                  onCopy={() => handleCopy(card.key, addr)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContractTimelineCard({
  card,
  address,
  explorerBase,
  copied,
  onCopy,
}: {
  card: DeployedContractMeta;
  address: string;
  explorerBase: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <article className="group relative w-full bg-[#131518] border-x-[1.5px] border-[#4b515b] hover:border-[#CCFF00]/75 transition-colors flex flex-col overflow-hidden">
      {/* Left Inner Vertical Connector + Bottom Turn matching `.timeline_connector` */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[1.4em] ml-[2.2em] pt-[2.55em] pb-[1.35em] z-[2] flex flex-col"
      >
        <div className="w-[1.5px] flex-1 bg-[#4b515b] group-hover:bg-[#CCFF00]/65 transition-colors" />
        <div className="w-full h-[1.5px] bg-[#4b515b] group-hover:bg-[#CCFF00]/65 transition-colors" />
      </div>

      {/* Top Header Bar */}
      <div
        className="relative flex items-center justify-between gap-[0.75em] border-y-[1.5px] border-[#4b515b] bg-[#131518] pr-[1em]"
        onMouseEnter={(e) => {
          const t = e.currentTarget.querySelector<HTMLElement>("[data-contract-title]");
          if (t) runDomScramble(t, card.name);
        }}
      >
        <div className="flex items-center gap-[0.75em] min-w-0">
          <div className="w-[2.5em] h-[2.5em] border-r-[1.5px] border-[#4b515b] text-white group-hover:text-[#CCFF00] transition-colors flex items-center justify-center shrink-0">
            <ProtocolIcon
              name={
                card.category === "CORE"
                  ? "engine"
                  : card.category === "ORACLE"
                    ? "oracle"
                    : card.category === "MARKETS"
                      ? "market"
                      : card.category === "VAULTS"
                        ? "twap"
                        : "guard"
              }
              className="w-[1.05em] h-[1.05em]"
            />
          </div>
          <div className="font-mono text-[0.875em] text-white py-[0.55em] leading-[1.3] truncate">
            <span data-contract-title="">{card.name}</span>
          </div>
        </div>

        <span className="font-mono text-[0.6875em] uppercase tracking-wider bg-[#222529] text-[#c2c6cd] border border-[#343940] px-[0.55em] py-[0.25em] shrink-0">
          {card.category}
        </span>

        {/* Corner masking cube */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 ml-[1.8em] translate-y-1/2 w-[0.875em] h-[0.875em] bg-[#131518] z-[1]"
        />
      </div>

      {/* Body: Role Description & Address Box */}
      <div className="pl-[4.188em] pr-[1.25em] py-[1.25em] flex flex-col gap-[0.95em]">
        <p className="text-[0.9375em] leading-[1.45] text-[#c2c6cd]">
          {card.description}
        </p>

        <div className="bg-[#0b0d10] border border-[#343940] px-[0.85em] py-[0.6em] flex items-center justify-between gap-[0.75em]">
          <code className="font-mono text-[0.75em] sm:text-[0.8125em] text-[#CCFF00] break-all">
            {address}
          </code>
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${card.name} address`}
            className="shrink-0 w-[2em] h-[2em] bg-[#222529] hover:bg-[#CCFF00] text-white hover:text-black flex items-center justify-center transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-[0.9em] h-[0.9em]" />
            ) : (
              <Copy className="w-[0.9em] h-[0.9em]" />
            )}
          </button>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="relative flex items-center justify-between gap-[0.75em] pl-[4.188em] pr-[1.25em] py-[0.8em] border-t-[1.5px] border-b-[1.5px] border-[#4b515b]">
        <div className="flex items-center gap-[0.5em] font-mono text-[0.75em] text-[#89919f]">
          <span className="text-[#CCFF00]">{card.number}</span>
          <span className="text-[#4b515b]">/</span>
          <span>CHAIN 4663</span>
        </div>

        <a
          href={`${explorerBase}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-[0.4em] font-mono text-[0.75em] text-white hover:text-[#CCFF00] transition-colors"
        >
          <ScrambleText text="Explorer" trigger="hover" />
          <ExternalArrowIcon className="w-[0.7em] h-[0.7em]" />
        </a>

        {/* Bottom corner cube */}
        <span
          aria-hidden="true"
          className="absolute top-[-0.9em] left-0 ml-[1.8em] w-[0.875em] h-[0.875em] bg-[#131518] z-[1]"
        />
      </div>
    </article>
  );
}
