"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DottedDivider } from "@/components/ui/DottedDivider";
import { PixelOwlMascot } from "@/components/ui/PixelOwlMascot";

interface FaqItem {
  number: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    number: "01",
    question: "How does NTI score crypto mindshare every 4 hours?",
    answer:
      "Every 4-hour UTC epoch, NTI's autonomous AI engine ingests posts from 1,500+ curated crypto KOLs on X, classifies narrative relevance deterministically, applies anti-bot reputation weights, and normalizes all 10 sectors via Hamilton largest-remainder allocation so every epoch sums strictly to 10,000 bps.",
  },
  {
    number: "02",
    question: "How does the protocol prevent manipulated or fake AI scores?",
    answer:
      "Each epoch dataset is hashed and pinned to IPFS before validator nodes sign an EIP-712 Merkle root. A 2/3 quorum is required to submit the root onchain, followed by a 2-hour bonded dispute window where any challenger can prove a discrepancy and slash dishonest signers.",
  },
  {
    number: "03",
    question: "How do Relative Pair Markets and ETH yield work?",
    answer:
      "Relative Pair Markets let traders take positions on whether one crypto narrative will outpace another in mindshare share or 4h velocity (for example, AI Agents vs. Memecoin). Markets settle automatically onchain once the epoch finalizes, routing real ETH protocol fees to stakers and liquidity providers.",
  },
  {
    number: "04",
    question: "What are self-rebalancing TWAP Narrative Baskets?",
    answer:
      "NTI Narrative Baskets are whitelisted Uniswap V3 vaults that automatically rebalance exposure toward sectors gaining positive mindshare velocity, using onchain TWAP execution and slippage guards to rotate capital without manual intervention.",
  },
  {
    number: "05",
    question: "Can AI agents or external dApps consume NTI scores onchain?",
    answer:
      "Yes. NarrativeOracle exposes permissionless read methods like latestScore(narrativeId) and latestRoot() directly on Robinhood Chain Testnet (46630), alongside a public REST snapshot endpoint at /api/indexes for offchain bots and trading agents.",
  },
  {
    number: "06",
    question: "Where is NTI deployed right now?",
    answer:
      "All 15 core, oracle, market, vault, and governance smart contracts are live and verified on Robinhood Chain Testnet (Chain ID 46630). You can inspect every contract address and explorer link directly in the Deployed Contracts section above.",
  },
];

export function FaqSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const rows = el.querySelectorAll("[data-faq-row]");
      if (rows.length) {
        gsap.fromTo(
          rows,
          { y: 16, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.48,
            stagger: 0.06,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 78%",
              once: true,
            },
          }
        );
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="faq"
      className="w-full bg-[#090B0E] text-white pt-[4.5em] pb-[5.5em] md:pt-[6em] md:pb-[7em]"
    >
      <div className="sui-padding-global">
        <div className="sui-container-1400">
          <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-[2.5em] lg:gap-[4em] items-start">
            {/* Left Sticky Heading */}
            <div className="lg:sticky lg:top-[6.5em]">
              <div className="inline-flex items-center gap-[0.65em] mb-[1.1em] font-mono text-[0.75em] tracking-[0.06em] uppercase text-[#89919f]">
                <PixelOwlMascot variant="bot" size={28} label="8-bit Protocol Bot" />
                <span>PROTOCOL FAQ</span>
              </div>

              <h2 className="text-[2.25em] sm:text-[3.25em] md:text-[4em] font-normal leading-[1.02] tracking-[-0.045em] text-white">
                How NTI works under the hood
              </h2>

              <p className="mt-[1.1em] text-[0.95em] md:text-[1.05em] leading-[1.5] text-[#89919f] max-w-[26em]">
                Everything traders, validators, and AI agent builders need to know about 4h mindshare epochs and onchain settlement.
              </p>

              <a
                href="/docs"
                className="mt-[1.6em] inline-flex items-center gap-[0.5em] font-mono text-[0.8em] text-[#CCFF00] hover:underline"
              >
                <span>Read full technical documentation →</span>
              </a>
            </div>

            {/* Right Accordion */}
            <div>
              <DottedDivider color="#343940" />
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openIdx === idx;
                return (
                  <React.Fragment key={item.number}>
                    <div data-faq-row="" className="py-[1.35em] md:py-[1.6em]">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenIdx(isOpen ? null : idx)}
                        className="w-full text-left flex items-start justify-between gap-[1.25em] group cursor-pointer"
                      >
                        <div className="flex items-baseline gap-[1em] min-w-0">
                          <span className="font-mono text-[0.75em] text-[#6c7584] shrink-0">
                            {item.number}
                          </span>
                          <span
                            className={`text-[1.125em] sm:text-[1.25em] md:text-[1.375em] font-normal leading-[1.25] tracking-[-0.02em] transition-colors ${
                              isOpen
                                ? "text-[#CCFF00]"
                                : "text-white group-hover:text-[#CCFF00]"
                            }`}
                          >
                            {item.question}
                          </span>
                        </div>

                        <span
                          aria-hidden="true"
                          className={`w-[2em] h-[2em] shrink-0 flex items-center justify-center font-mono text-[1em] transition-all duration-200 ${
                            isOpen
                              ? "bg-[#CCFF00] text-black rotate-45"
                              : "bg-[#1a1d22] text-white group-hover:bg-[#CCFF00] group-hover:text-black"
                          }`}
                        >
                          +
                        </span>
                      </button>

                      <div
                        className="grid transition-all duration-300 ease-out"
                        style={{
                          gridTemplateRows: isOpen ? "1fr" : "0fr",
                          opacity: isOpen ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <p className="pt-[0.95em] pl-[2.25em] pr-[1em] text-[0.9375em] md:text-[1em] leading-[1.6] text-[#c2c6cd] m-0">
                            {item.answer}
                          </p>
                        </div>
                      </div>
                    </div>
                    <DottedDivider color="#343940" />
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
