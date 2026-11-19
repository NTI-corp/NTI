"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EpochBadge } from "./EpochBadge";
import { TestnetBanner } from "./TestnetBanner";
import { WalletButton } from "./WalletButton";
import { getActiveChainId, getChain } from "@/lib/contracts";
import type { EpochStatus, IndexesSnapshot } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  detail: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "TELEMETRY",
    items: [
      { href: "/terminal", label: "Terminal", detail: "10-sector index matrix" },
      { href: "/radar", label: "Radar", detail: "Velocity & token signals" },
      { href: "/heatmap", label: "Heatmap", detail: "Builder opportunity grid" },
    ],
  },
  {
    label: "PROTOCOLS",
    items: [
      { href: "/markets", label: "Markets", detail: "24h & 7d parimutuel pools" },
      { href: "/baskets", label: "Baskets", detail: "Uniswap V3 TWAP vaults" },
      { href: "/grants", label: "Grants", detail: "Quadratic mindshare rounds" },
    ],
  },
  {
    label: "GOVERNANCE & PROOF",
    items: [
      { href: "/stake", label: "Stake $NTI", detail: "30% ETH fees & tiers" },
      { href: "/oracle", label: "Oracle", detail: "EIP-712 & delta proofs" },
      { href: "/methodology", label: "Methodology", detail: "Decimal(40) formulas" },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/terminal": "Index Terminal",
  "/radar": "Emerging Radar",
  "/heatmap": "Opportunity Heatmap",
  "/markets": "Pair Markets",
  "/baskets": "Narrative Baskets",
  "/grants": "Ecosystem Grants",
  "/stake": "Staking & Governance",
  "/oracle": "Oracle & Disputes",
  "/methodology": "Methodology",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [epochMeta, setEpochMeta] = useState<{
    epochId: number | null;
    status: EpochStatus;
  }>({ epochId: null, status: "collecting" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const loadEpoch = async () => {
      try {
        const res = await fetch("/api/indexes");
        if (!res.ok) return;
        const data = (await res.json()) as IndexesSnapshot;
        if (!active) return;
        const target = data.latestObservedEpoch ?? data.latestFinalEpoch;
        if (target) {
          setEpochMeta({ epochId: target.epochId, status: target.status });
        }
      } catch {
        // ignore transient poll failure
      }
    };
    void loadEpoch();
    const timer = setInterval(loadEpoch, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const chainId = getActiveChainId();
  const chain = getChain(chainId);
  const explorerUrl = chain.blockExplorers?.default.url ?? "https://explorer.testnet.chain.robinhood.com";

  const isNavActive = (href: string) => {
    if (href === "/terminal") {
      return pathname === "/terminal" || pathname.startsWith("/narratives");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const currentTitle =
    Object.entries(PAGE_TITLES).find(([k]) => pathname === k || pathname.startsWith(`${k}/`))?.[1] ??
    (pathname.startsWith("/narratives") ? "Narrative Deep-Dive" : "NTI Workspace");

  return (
    <div className="flex min-h-screen bg-[#06070A] text-[#F3F5F8]">
      {/* Desktop Left Sidebar (BELL Terminal Architecture) */}
      <aside
        aria-label="NTI Terminal navigation"
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-[#1B202C] bg-[#080A0F] lg:flex"
      >
        <div>
          {/* Brand */}
          <div className="flex h-14 items-center justify-between border-b border-[#1B202C] px-4">
            <Link href="/" className="group flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center border border-[#2B3345] bg-[#0B0D12] transition-colors group-hover:border-[#B8FF2E]/70">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4 text-[#B8FF2E]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 19V5l14 14V5" />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-[#23F7DD]" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display text-sm font-bold tracking-tight text-[#F3F5F8]">
                  NTI <span className="font-mono font-normal text-[#5A6478]">//</span> APP
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#5A6478]">
                  BACK TO LANDING
                </span>
              </div>
            </Link>
          </div>

          {/* Grouped Sidebar Navigation */}
          <div className="space-y-5 overflow-y-auto px-3 py-5">
            {NAV_GROUPS.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <p className="mb-1.5 px-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#5A6478]">
                  {group.label}
                </p>
                <nav className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isNavActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative block border px-3 py-2 transition-colors ${
                          active
                            ? "border-[#2B3345] bg-[#11141C] text-[#F3F5F8]"
                            : "border-transparent text-[#8B94A7] hover:border-[#1B202C] hover:bg-[#0B0D12] hover:text-[#F3F5F8]"
                        }`}
                      >
                        {active && (
                          <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] bg-[#B8FF2E]" />
                        )}
                        <div className="font-display text-xs font-semibold">{item.label}</div>
                        <div className="font-mono text-[10px] text-[#5A6478]">{item.detail}</div>
                      </Link>
                    );
                  })}
                </nav>
              </section>
            ))}
          </div>
        </div>

        {/* Bottom Robinhood Chain Card */}
        <div className="border-t border-[#1B202C] bg-[#06070A] p-4 font-mono text-[10px]">
          <div className="flex items-center justify-between text-[#5A6478]">
            <span>SETTLEMENT</span>
            <span className="inline-flex items-center gap-1.5 text-[#B8FF2E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF2E]" />
              LIVE
            </span>
          </div>
          <div className="mt-1 font-display text-xs font-semibold text-[#F3F5F8]">
            {chain.name}
          </div>
          <div className="text-[#8B94A7] tabular-nums">CHAIN ID · {chainId}</div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1B202C] pt-2.5 text-[10px]">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[#8B94A7] hover:text-[#23F7DD]"
            >
              EXPLORER ↗
            </a>
            <Link href="/" className="text-[#5A6478] hover:text-[#F3F5F8]">
              HOME /
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-40 border-b border-[#1B202C] bg-[#06070A]/92 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <div className="flex h-7 w-7 items-center justify-center border border-[#2B3345] bg-[#0B0D12] font-mono text-xs font-bold text-[#B8FF2E]">
                  N
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[#5A6478] sm:inline">
                  NTI //
                </span>
                <span className="font-display text-sm font-semibold text-[#F3F5F8]">
                  {currentTitle}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
              </div>

              <WalletButton />

              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="min-h-[34px] cursor-pointer border border-[#1B202C] bg-[#0B0D12] px-2.5 py-1.5 font-mono text-[11px] uppercase text-[#8B94A7] lg:hidden"
              >
                {mobileMenuOpen ? "CLOSE" : "MENU"}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="border-t border-[#1B202C] bg-[#0B0D12] px-4 py-3 lg:hidden">
              <div className="mb-3 flex items-center justify-between">
                <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
                <Link href="/" className="font-mono text-[10px] text-[#23F7DD]">
                  LANDING /
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[44px] items-center justify-center border px-2 py-2 text-center font-mono text-[10px] uppercase ${
                      isNavActive(item.href)
                        ? "border-[#B8FF2E]/50 bg-[#11141C] text-[#B8FF2E]"
                        : "border-[#1B202C] text-[#8B94A7]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </header>

        <TestnetBanner />

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>

        <footer className="mt-10 border-t border-[#1B202C] bg-[#06070A]">
          <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[#8B94A7]">
              <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5A6478]">
                METHODOLOGY NOTICE
              </span>
              Measures how actively crypto narratives are discussed across X; does not predict token prices.
            </p>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-[#5A6478]">
              <span>ROBINHOOD CHAIN · ID {chainId}</span>
              <span>4H EPOCHS · DECIMAL(40)</span>
              <Link href="/methodology" className="text-[#B8FF2E] hover:underline">
                VERIFY FORMULAS →
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
