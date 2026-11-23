"use client";

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import {
  ANNOUNCEMENT_BANNER,
  NAV_ITEMS,
  GET_STARTED_CTA,
  type NavItem,
} from "@/content/navigation";
import {
  CloseXIcon,
  ExternalArrowIcon,
  NavMenuIcon,
  XIcon,
} from "@/components/ui/Icons";
import { LottieIcon } from "@/components/ui/LottieIcon";

const NAV_SHUFFLE_GLYPHS = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "!", "@", "#", "$", "%", "^", "&", "*", "-", "_", "+", "=", ";", ":", ",",
];
const NAV_SHUFFLE_COLORS = ["#CCFF00", "#6C7584"];

/** Exact replica of sui.io `_setupHoverShuffle` + `gsap.effects.shuffle` */
function NavShuffleLabel({
  text,
  triggerTick,
}: {
  text: string;
  triggerTick: number;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const measureAndLock = () => {
      const root = containerRef.current;
      if (!root) return;
      const computed = getComputedStyle(root);
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;top:-9999px;left:-9999px;font-family:${computed.fontFamily};font-size:${computed.fontSize};font-weight:${computed.fontWeight};letter-spacing:${computed.letterSpacing};font-kerning:${computed.fontKerning};font-variant-ligatures:${computed.fontVariantLigatures};text-transform:${computed.textTransform}`;
      const chars = [...text];
      chars.forEach((ch) => {
        const s = document.createElement("span");
        s.style.display = "inline-block";
        s.textContent = ch === " " ? "\u00A0" : ch;
        probe.appendChild(s);
      });
      document.body.appendChild(probe);
      [...probe.children].forEach((child, i) => {
        const span = charsRef.current[i];
        if (span) {
          span.style.width = `${child.getBoundingClientRect().width}px`;
        }
      });
      document.body.removeChild(probe);
    };

    measureAndLock();
    const timer = setTimeout(measureAndLock, 250);
    window.addEventListener("resize", measureAndLock);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measureAndLock);
    };
  }, [text]);

  useEffect(() => {
    if (triggerTick <= 0) return;
    const spans = charsRef.current
      .filter((s): s is HTMLSpanElement => s !== null)
      .filter((s) => s.dataset.char !== " ");
    if (!spans.length) return;

    tlRef.current?.kill();

    const pickCount = Math.max(
      1,
      Math.min(
        spans.length,
        Math.round(gsap.utils.random(2, Math.max(2, spans.length - 1)))
      )
    );
    const chosen = gsap.utils.shuffle([...spans]).slice(0, pickCount);

    const tl = gsap.timeline({
      defaults: { ease: "none", duration: 0.03 },
      onComplete: () => {
        spans.forEach((el) => {
          el.textContent = el.dataset.char || "";
          el.style.color = "";
          el.style.opacity = "1";
        });
      },
      onInterrupt: () => {
        spans.forEach((el) => {
          el.textContent = el.dataset.char || "";
          el.style.color = "";
          el.style.opacity = "1";
        });
      },
    });
    tlRef.current = tl;

    chosen.forEach((el, idx) => {
      const orig = el.dataset.char || "";
      tl.fromTo(
        el,
        { opacity: 0 },
        {
          opacity: 1,
          repeat: 3,
          repeatRefresh: true,
          repeatDelay: 0.03,
          onRepeat: () => {
            el.textContent = gsap.utils.random(NAV_SHUFFLE_GLYPHS);
            el.style.color = gsap.utils.random(NAV_SHUFFLE_COLORS);
          },
          onStart: () => {
            el.textContent = gsap.utils.random(NAV_SHUFFLE_GLYPHS);
            el.style.color = gsap.utils.random(NAV_SHUFFLE_COLORS);
          },
          onComplete: () => {
            el.textContent = orig;
            el.style.color = "";
          },
        },
        0.04 * idx
      );
    });
  }, [triggerTick]);

  useEffect(() => {
    return () => {
      tlRef.current?.kill();
    };
  }, []);

  return (
    <span
      ref={containerRef}
      className="whitespace-nowrap inline-block [font-kerning:none] [font-variant-ligatures:none]"
    >
      {[...text].map((ch, idx) => (
        <span
          key={`${idx}-${ch}`}
          ref={(el) => {
            charsRef.current[idx] = el;
          }}
          data-char={ch}
          className="inline-block text-center"
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

function NavPlusSvg({
  className = "w-full h-full",
  rotated = false,
}: {
  className?: string;
  rotated?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5.49609 10.001H4.49609V5.91895H5.49609V10.001ZM10 4.49512V5.49512H5.91797V4.49512H10ZM4.08203 5.49512H0V4.49512H4.08203V5.49512ZM5.49609 4.08301H4.49609V0.000976562L5.49609 0V4.08301Z"
        fill="currentColor"
        style={{
          transformOrigin: "center center",
          transform: rotated ? "rotate(-135deg)" : "rotate(0deg)",
          transition: "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </svg>
  );
}

function NavDocsBookSvg({
  className = "w-full h-full",
}: {
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 15 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M7.42785 15.7774L14.1538 11.537V9.99703H14.1536V1.54159H12.8393V10.8234L7.73411 14.0419V4.74526L12.8396 1.54051V9.53674e-05L7.07737 3.61704L1.31447 -1.90735e-06V1.54032L6.41983 4.74468V14.0445L1.31428 10.8237V1.54159H0V10.995H9.87287e-05V11.5373L6.72165 15.7773L7.0747 16L7.42785 15.7774Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NavBlogMegaphoneSvg({
  className = "w-full h-full",
}: {
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 15"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4.14291V9.72457L13.2312 10.8372L14.9905 14.1538H13.5148L12.0148 11.3261L5.00273 14.1443V12.7296L14.7068 8.82963V5.05859L5.00273 1.40299V0L16 4.14291ZM5.00283 3.33418C2.95826 3.33418 1.30076 5.00934 1.30076 7.07569C1.30078 9.14202 2.95827 10.8171 5.00283 10.8171V12.1316C2.23994 12.1316 2.63156e-05 9.868 0 7.07569C0 4.28335 2.23992 2.01966 5.00283 2.01966V3.33418ZM5.00273 6.02818C4.43031 6.02819 3.96627 6.49717 3.96627 7.07569C3.96627 7.65421 4.43031 8.12319 5.00273 8.12319V9.43771C3.71197 9.4377 2.66561 8.3802 2.66561 7.07569C2.66562 5.77118 3.71198 4.71368 5.00273 4.71367V6.02818Z"
        fill="currentColor"
      />
    </svg>
  );
}

function getDropdownWidthClass(colCount: number) {
  if (colCount === 1) return "max-w-[17.5em] grid-cols-1";
  if (colCount === 2) return "max-w-[43.75em] grid-cols-2";
  if (colCount === 3) return "max-w-[64em] grid-cols-3";
  return "max-w-[72.5em] grid-cols-4";
}

function TextStaggerLabel({
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

export function SiteNavbar() {
  const [bannerVisible, setBannerVisible] = useState(
    ANNOUNCEMENT_BANNER.enabled
  );
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const [hoveredCtaIdx, setHoveredCtaIdx] = useState<number | null>(null);
  const [shuffleTicks, setShuffleTicks] = useState<Record<string, number>>({});
  const navRef = useRef<HTMLElement>(null);
  const dropdownInnerRef = useRef<HTMLDivElement>(null);
  const ctaDropdownInnerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeNavItem: NavItem | undefined = NAV_ITEMS.find(
    (item) => item.id === activeDropdown
  );

  const triggerShuffle = (id: string) => {
    setShuffleTicks((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setActiveDropdown(null);
      setGetStartedOpen(false);
    }, 130);
  };

  // Bounce open animation matching sui.io initNavbarReveal (back.out(10))
  useEffect(() => {
    if (activeDropdown && dropdownInnerRef.current) {
      gsap.fromTo(
        dropdownInnerRef.current,
        { marginTop: "0em", opacity: 0.92 },
        {
          marginTop: "0.2em",
          opacity: 1,
          duration: 0.25,
          ease: "back.out(10)",
          overwrite: true,
        }
      );
    }
  }, [activeDropdown]);

  useEffect(() => {
    if (getStartedOpen && ctaDropdownInnerRef.current) {
      gsap.fromTo(
        ctaDropdownInnerRef.current,
        { marginTop: "0em", opacity: 0.92 },
        {
          marginTop: "0.2em",
          opacity: 1,
          duration: 0.25,
          ease: "back.out(10)",
          overwrite: true,
        }
      );
    }
  }, [getStartedOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
        setGetStartedOpen(false);
        setMobileOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setGetStartedOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      clearCloseTimer();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      ref={navRef}
      className="fixed top-0 left-0 right-0 z-50 w-full bg-transparent pointer-events-none"
    >
      {/* Optional Announcement Banner (.pencil_layout) */}
      {bannerVisible && (
        <div className="pointer-events-auto relative bg-[#CCFF00]/95 backdrop-blur-[12px] text-black text-[0.75em] leading-[1.2] tracking-[0.03em] py-[0.5em] px-[2.5em] flex items-center justify-center">
          <a
            href={ANNOUNCEMENT_BANNER.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline text-center"
          >
            {ANNOUNCEMENT_BANNER.text}
          </a>
          <button
            type="button"
            aria-label="Close announcement banner"
            onClick={() => setBannerVisible(false)}
            className="absolute right-[1em] top-1/2 -translate-y-1/2 p-[0.25em] text-black/75 hover:text-black cursor-pointer"
          >
            <CloseXIcon className="w-[0.75em] h-[0.75em]" />
          </button>
        </div>
      )}

      {/* Inset Floating Navbar Bar matching sui.io (.padding-global.mob_no-padd > .container-1400 > .navbar_layout) */}
      <div
        className="px-0 md:px-[1.25em] mt-0 md:mt-[0.5em] pointer-events-auto"
        onMouseLeave={scheduleClose}
      >
        <div className="sui-container-1400 relative">
          <div className="bg-[#131518] backdrop-blur-[12px] px-[0.75em] py-[0.875em] md:px-[1.031em] md:py-[0.719em] flex items-center justify-between gap-[2em] min-h-[3.75em] max-h-[4.25em]">
            {/* Brand Logo */}
            <a
              href="/"
              aria-label="NTI Home"
              onMouseEnter={() => {
                clearCloseTimer();
                setActiveDropdown(null);
                setGetStartedOpen(false);
              }}
              className="flex items-center gap-[0.55em] shrink-0 h-[2em] md:h-[2.063em]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/nti-logo.png"
                alt="NTI"
                className="h-[1.75em] w-[1.75em] shrink-0 object-contain"
              />
              <span className="text-[1.15em] font-semibold tracking-[-0.03em] text-white leading-none">
                NTI
              </span>
            </a>

            {/* Desktop Center Nav Links */}
            <nav aria-label="Primary" className="hidden md:flex items-stretch">
              {NAV_ITEMS.map((item) => {
                const isOpen = activeDropdown === item.id;

                if (item.kind === "link") {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      onMouseEnter={() => {
                        clearCloseTimer();
                        setActiveDropdown(null);
                        setGetStartedOpen(false);
                        triggerShuffle(item.id);
                      }}
                      className="group relative flex items-center gap-[0.5em] px-[1.125em] py-[0.375em] text-white transition-colors"
                    >
                      <span className="text-[0.875em] font-normal whitespace-nowrap">
                        <NavShuffleLabel
                          text={item.label}
                          triggerTick={shuffleTicks[item.id] ?? 0}
                        />
                      </span>
                      <span className="w-[1.625em] h-[1.625em] px-[0.25em] py-[0.375em] bg-[#343940] group-hover:bg-[#CCFF00] text-white group-hover:text-black flex items-center justify-center shrink-0 transition-colors duration-100 ease-out">
                        {item.iconKind === "docs" ? (
                          <NavDocsBookSvg className="w-full h-full" />
                        ) : (
                          <NavBlogMegaphoneSvg className="w-full h-full" />
                        )}
                      </span>
                    </a>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseEnter={() => {
                      clearCloseTimer();
                      setGetStartedOpen(false);
                      if (activeDropdown !== item.id) {
                        triggerShuffle(item.id);
                      }
                      setActiveDropdown(item.id);
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setGetStartedOpen(false);
                        triggerShuffle(item.id);
                        setActiveDropdown(item.id);
                      }}
                      className="group relative flex items-center gap-[0.5em] px-[1.125em] py-[0.375em] text-white cursor-pointer"
                    >
                      <span className="text-[0.875em] font-normal whitespace-nowrap">
                        <NavShuffleLabel
                          text={item.label}
                          triggerTick={shuffleTicks[item.id] ?? 0}
                        />
                      </span>
                      <span
                        className={`w-[1.625em] h-[1.625em] p-[0.5em] flex items-center justify-center shrink-0 transition-colors duration-150 ${
                          isOpen
                            ? "bg-[#CCFF00] text-black"
                            : "bg-[#343940] group-hover:bg-[#CCFF00] text-white group-hover:text-black"
                        }`}
                      >
                        <NavPlusSvg className="w-full h-full" rotated={isOpen} />
                      </span>
                      {/* Hover Bridge preventing cursor flicker into centered dropdown */}
                      {isOpen && (
                        <span
                          aria-hidden="true"
                          className="absolute top-full -left-[4em] -right-[4em] h-[2.5em]"
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* Desktop Right CTA (`textStagger`) + X + Mobile Toggle */}
            <div className="flex items-center gap-[0.65em]">
              <a
                href="https://x.com/NTI_Index"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="NTI on X"
                title="NTI on X (@NTI_Index)"
                className="hidden md:flex items-center justify-center w-[2.375em] h-[2.375em] bg-[#222529] border border-[#343940] hover:bg-[#CCFF00] hover:border-[#CCFF00] text-white hover:text-black transition-colors shrink-0"
              >
                <XIcon className="w-[0.95em] h-[0.95em]" />
              </a>
              <div
                className="relative hidden md:block"
                onMouseEnter={() => {
                  clearCloseTimer();
                  setActiveDropdown(null);
                  setGetStartedOpen(true);
                  setCtaHovered(true);
                }}
                onMouseLeave={() => {
                  setCtaHovered(false);
                }}
              >
                <button
                  type="button"
                  aria-label={GET_STARTED_CTA.label}
                  aria-expanded={getStartedOpen}
                  onClick={() => {
                    setActiveDropdown(null);
                    setGetStartedOpen(true);
                  }}
                  className="relative bg-[#CCFF00] hover:bg-[#B8E600] transition-colors text-black text-[0.875em] font-medium leading-none tracking-[-0.004375em] px-[0.75em] py-[0.84375em] cursor-pointer whitespace-nowrap flex items-center"
                >
                  <TextStaggerLabel
                    text={GET_STARTED_CTA.label}
                    hovered={ctaHovered}
                  />
                  {getStartedOpen && (
                    <span
                      aria-hidden="true"
                      className="absolute top-full left-0 right-0 h-[2.5em]"
                    />
                  )}
                </button>
              </div>

              {/* Mobile Hamburger */}
              <button
                type="button"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((v) => !v)}
                className="md:hidden w-[2.5em] h-[2.5em] bg-[#222529] flex flex-col items-center justify-center gap-[0.3em] cursor-pointer"
              >
                <span
                  className={`block w-[1.1em] h-[1.5px] bg-white transition-transform ${
                    mobileOpen ? "translate-y-[0.22em] rotate-45" : ""
                  }`}
                />
                <span
                  className={`block w-[1.1em] h-[1.5px] bg-white transition-transform ${
                    mobileOpen ? "-translate-y-[0.22em] -rotate-45" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Desktop Centered Mega-Dropdown (.navbar-content > .navbar-dd_inner-wrapper) */}
          {activeNavItem?.columns && (
            <div className="hidden md:block pt-[0.519em] pointer-events-none">
              <div
                ref={dropdownInnerRef}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                className={`pointer-events-auto mx-auto w-full bg-[#131518] border-2 border-[#222529] grid overflow-hidden shadow-2xl ${getDropdownWidthClass(
                  activeNavItem.columns.length
                )}`}
              >
                {activeNavItem.columns.map((col, colIdx) => (
                  <div
                    key={col.category}
                    className={`pb-[2.5em] pr-[0.15625em] ${
                      colIdx > 0
                        ? "border-l border-dashed border-[#343940] pl-[0.1875em]"
                        : ""
                    }`}
                  >
                    <div className="bg-[#222529] text-[#a1a7b2] font-mono text-[0.625em] leading-[1.2] tracking-[-0.00625em] px-[0.75em] py-[0.5em] mb-[0.5em]">
                      {col.category}
                    </div>

                    <div className="flex flex-col">
                      {col.links.map((link) => {
                        const key = `${col.category}-${link.label}`;
                        const isHovered = hoveredLinkKey === key;
                        return (
                          <a
                            key={link.label}
                            href={link.href}
                            target={link.external ? "_blank" : undefined}
                            rel={
                              link.external ? "noopener noreferrer" : undefined
                            }
                            onMouseEnter={(e) => {
                              setHoveredLinkKey(key);
                              const bg = e.currentTarget.querySelector<HTMLElement>("[data-link-bg]");
                              if (bg) {
                                gsap.killTweensOf(bg);
                                gsap.set(bg, { opacity: 1 });
                                gsap.fromTo(bg, { height: "30%" }, { height: "100%", duration: 0.25 });
                              }
                            }}
                            onMouseLeave={(e) => {
                              setHoveredLinkKey(null);
                              const bg = e.currentTarget.querySelector<HTMLElement>("[data-link-bg]");
                              if (bg) {
                                gsap.killTweensOf(bg);
                                gsap.set(bg, { opacity: 0 });
                              }
                            }}
                            className="group relative flex items-center gap-[0.375em] px-[0.5em] py-[0.5em] overflow-hidden"
                          >
                            {/* Sliding height #222529 backdrop matching initNavbarLinkHover (30% -> 100%, 0.25s, snap off) */}
                            <span
                              data-link-bg=""
                              aria-hidden="true"
                              className="absolute top-0 left-0 w-full bg-[#222529] pointer-events-none z-0"
                              style={{ height: "30%", opacity: 0 }}
                            />

                            {/* Clean 2em Icon Slot (no dark box behind icon on sui.io) */}
                            <span className="relative z-10 w-[2em] h-[2em] p-[0.25em] shrink-0 text-white flex items-center justify-center">
                              {link.lottieSrc ? (
                                <LottieIcon
                                  src={link.lottieSrc}
                                  isHovered={isHovered}
                                  className="w-full h-full"
                                />
                              ) : (
                                <NavMenuIcon
                                  icon={link.icon}
                                  className="w-[1.25em] h-[1.25em]"
                                />
                              )}
                            </span>

                            <span className="relative z-10 flex-1 min-w-0">
                              <span
                                className={`flex items-center gap-[0.3em] text-[0.875em] font-normal leading-none tracking-[-0.004375em] transition-colors duration-300 ${
                                  isHovered ? "text-[#CCFF00]" : "text-white"
                                }`}
                              >
                                <span>{link.label}</span>
                                {link.external && (
                                  <ExternalArrowIcon className="w-[0.5em] h-[0.5em] self-start -mt-[2px] opacity-80" />
                                )}
                              </span>
                              {link.description && (
                                <span className="block text-[0.75em] leading-[1.4] tracking-[-0.00375em] text-[#89919f] mt-[0.2em]">
                                  {link.description}
                                </span>
                              )}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Get Started Right-Aligned Dropdown (.cta-dd_inner-wrapper) */}
          {getStartedOpen && (
            <div className="hidden md:flex justify-end pt-[0.519em] pointer-events-none">
              <div
                ref={ctaDropdownInnerRef}
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                className="pointer-events-auto w-full max-w-[20em] bg-[#131518] border-2 border-t-0 border-[#222529] shadow-2xl"
              >
                <div className="bg-[#222529] text-[#a1a7b2] font-mono text-[0.625em] leading-[1.2] tracking-[-0.00625em] px-[0.75em] py-[0.5em] mb-[0.5em]">
                  {GET_STARTED_CTA.category}
                </div>
                <div className="flex flex-col">
                  {GET_STARTED_CTA.links.map((link, idx) => {
                    const isHovered = hoveredCtaIdx === idx;
                    const hideBottomDivider =
                      hoveredCtaIdx === idx || hoveredCtaIdx === idx + 1;
                    return (
                      <React.Fragment key={link.label}>
                        <a
                          href={link.href}
                          target={link.external ? "_blank" : undefined}
                          rel={link.external ? "noopener noreferrer" : undefined}
                          onMouseEnter={(e) => {
                            setHoveredCtaIdx(idx);
                            const bg = e.currentTarget.querySelector<HTMLElement>("[data-cta-bg]");
                            if (bg) {
                              gsap.killTweensOf(bg);
                              gsap.set(bg, { opacity: 1 });
                              gsap.fromTo(bg, { height: "30%" }, { height: "100%", duration: 0.35 });
                            }
                          }}
                          onMouseLeave={(e) => {
                            setHoveredCtaIdx(null);
                            const bg = e.currentTarget.querySelector<HTMLElement>("[data-cta-bg]");
                            if (bg) {
                              gsap.killTweensOf(bg);
                              gsap.to(bg, { height: "30%", opacity: 0, duration: 0.15 });
                            }
                          }}
                          className="relative flex items-center gap-[0.375em] px-[0.5em] py-[0.875em] overflow-hidden"
                        >
                          <span
                            data-cta-bg=""
                            aria-hidden="true"
                            className="absolute top-0 left-0 w-full bg-[#222529] pointer-events-none z-0"
                            style={{ height: "30%", opacity: 0 }}
                          />
                          <span className="relative z-10 w-[2em] h-[2em] p-[0.25em] shrink-0 text-white flex items-center justify-center">
                            <NavMenuIcon
                              icon={link.icon}
                              className="w-[1.25em] h-[1.25em]"
                            />
                          </span>
                          <span className="relative z-10 flex-1 min-w-0">
                            <span
                              className={`block text-[0.9375em] font-normal leading-none transition-colors duration-300 ${
                                isHovered ? "text-[#CCFF00]" : "text-white"
                              }`}
                            >
                              {link.label}
                            </span>
                            <span className="block text-[0.75em] leading-[1.4] tracking-[-0.12px] text-[#89919f] mt-[0.35em]">
                              {link.description}
                            </span>
                          </span>
                        </a>
                        {idx < GET_STARTED_CTA.links.length - 1 && (
                          <div
                            className="mx-[0.5em] border-b border-dashed border-[#343940] transition-opacity duration-150"
                            style={{ opacity: hideBottomDivider ? 0 : 1 }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Fullscreen Drawer */}
      {mobileOpen && (
        <div className="md:hidden pointer-events-auto fixed inset-0 top-[3.75em] bg-[#131518] text-white overflow-y-auto z-40 px-[1em] py-[1.25em]">
          <div className="flex flex-col gap-[0.25em]">
            {NAV_ITEMS.map((item) => {
              if (item.kind === "link") {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between py-[1em] border-b border-dotted border-[#4b515b] text-[1.125em] font-normal"
                  >
                    <span>{item.label}</span>
                    <span className="w-[2em] h-[2em] bg-[#222529] p-[0.5em] flex items-center justify-center">
                      {item.iconKind === "docs" ? (
                        <NavDocsBookSvg className="w-full h-full" />
                      ) : (
                        <NavBlogMegaphoneSvg className="w-full h-full" />
                      )}
                    </span>
                  </a>
                );
              }
              const expanded = mobileExpandedId === item.id;
              return (
                <div
                  key={item.id}
                  className="border-b border-dotted border-[#4b515b]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setMobileExpandedId(expanded ? null : item.id)
                    }
                    className="w-full flex items-center justify-between py-[1em] text-[1.125em] font-normal cursor-pointer"
                  >
                    <span>{item.label}</span>
                    <span
                      className={`w-[2em] h-[2em] p-[0.65em] flex items-center justify-center transition-colors ${
                        expanded ? "bg-[#CCFF00] text-black" : "bg-[#222529] text-white"
                      }`}
                    >
                      <NavPlusSvg className="w-full h-full" rotated={expanded} />
                    </span>
                  </button>
                  {expanded && item.columns && (
                    <div className="pb-[1em] flex flex-col gap-[1em]">
                      {item.columns.map((col) => (
                        <div key={col.category}>
                          <div className="bg-[#222529] font-mono text-[0.6875em] text-[#a1a7b2] px-[0.65em] py-[0.4em] mb-[0.5em]">
                            {col.category}
                          </div>
                          <div className="flex flex-col gap-[0.35em]">
                            {col.links.map((link) => (
                              <a
                                key={link.label}
                                href={link.href}
                                target={link.external ? "_blank" : undefined}
                                rel={
                                  link.external
                                    ? "noopener noreferrer"
                                    : undefined
                                }
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-[0.65em] py-[0.45em] text-[0.95em] text-[#e0e2e6]"
                              >
                                <span className="w-[1.85em] h-[1.85em] bg-[#222529] flex items-center justify-center shrink-0">
                                  <NavMenuIcon
                                    icon={link.icon}
                                    className="w-[1em] h-[1em]"
                                  />
                                </span>
                                <span>{link.label}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-[1.5em] pb-[3em] flex flex-col gap-[0.75em]">
              <a
                href={GET_STARTED_CTA.href}
                onClick={() => setMobileOpen(false)}
                className="block w-full bg-[#CCFF00] hover:bg-[#B8E600] transition-colors text-black text-center py-[0.95em] font-medium text-[1em]"
              >
                {GET_STARTED_CTA.label}
              </a>
              <a
                href="https://x.com/NTI_Index"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-[0.55em] w-full bg-[#222529] border border-[#343940] hover:border-[#CCFF00] text-white py-[0.85em] font-mono text-[0.875em] transition-colors"
              >
                <XIcon className="w-[0.95em] h-[0.95em]" />
                <span>@NTI_Index</span>
                <ExternalArrowIcon className="w-[0.65em] h-[0.65em] opacity-70" />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
