"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Coins,
  ExternalLink,
  Flame,
  Layers,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { NARRATIVES } from "@nti/sdk";
import { EpochBadge } from "./EpochBadge";
import { TestnetBanner } from "./TestnetBanner";
import { WalletButton } from "./WalletButton";
import { getActiveChainId, getChain } from "@/lib/contracts";
import type { EpochStatus, IndexesSnapshot } from "@/lib/types";
import { NtiBrandMark } from "@/components/landing/NtiLogos";
import { RobinhoodMark, XIcon } from "@/components/ui/Icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const TOP_TABS = [
  { href: "/terminal", label: "Mindshare" },
  { href: "/radar", label: "Radar" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/markets", label: "Markets" },
  { href: "/baskets", label: "Baskets" },
  { href: "/grants", label: "Grants" },
  { href: "/oracle", label: "Oracle" },
] as const;

const SIDEBAR_GROUPS: NavGroup[] = [
  {
    label: "ANALYTICS",
    items: [
      { href: "/terminal", label: "Mindshare", icon: BarChart3 },
      { href: "/radar", label: "Emerging Radar", icon: Radar },
      { href: "/heatmap", label: "Opportunity Heatmap", icon: Flame },
    ],
  },
  {
    label: "MARKETS & VAULTS",
    items: [
      { href: "/markets", label: "Pair Markets", icon: Activity },
      { href: "/baskets", label: "TWAP Baskets", icon: Layers },
      { href: "/grants", label: "Ecosystem Grants", icon: Sparkles },
    ],
  },
  {
    label: "VERIFICATION",
    items: [
      { href: "/stake", label: "Stake $NTI", icon: Coins },
      { href: "/oracle", label: "Oracle & Disputes", icon: ShieldCheck },
      { href: "/methodology", label: "Methodology", icon: BookOpen },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [epochMeta, setEpochMeta] = useState<{
    epochId: number | null;
    status: EpochStatus;
  }>({ epochId: null, status: "collecting" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [topSearch, setTopSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
    setSearchFocused(false);
    setTopSearch("");
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
  const explorerUrl =
    chain.blockExplorers?.default.url ?? "https://explorer.testnet.chain.robinhood.com";

  const isNavActive = (href: string) => {
    if (href === "/terminal") {
      return pathname === "/terminal" || pathname.startsWith("/narratives");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const filteredGroups = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    if (!q) return SIDEBAR_GROUPS;
    return SIDEBAR_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [sidebarFilter]);

  const quickSearchResults = useMemo(() => {
    const q = topSearch.trim().toLowerCase();
    const sectors = NARRATIVES.map((n) => ({
      href: `/narratives/${n.id}`,
      label: n.label,
      kind: "Sector",
    }));
    const pages = SIDEBAR_GROUPS.flatMap((g) =>
      g.items.map((i) => ({ href: i.href, label: i.label, kind: "Dashboard" })),
    );
    const all = [...sectors, ...pages];
    if (!q) return all.slice(0, 7);
    return all.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [topSearch]);

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F4F4F5]">
      {/* Global Top Bar */}
      <header className="sticky top-0 z-40 border-b border-[#242830] bg-[#090B0E]/95 backdrop-blur-md">
        <div className="flex h-13 items-center justify-between gap-3 px-4 lg:px-5">
          {/* Left: Brand + Horizontal Category Tabs */}
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 pr-2">
              <NtiBrandMark className="h-7 w-7" />
              <span className="font-display text-sm font-bold tracking-tight text-white">
                NTI
              </span>
            </Link>

            <nav
              aria-label="Workspace modules"
              className="hidden items-center gap-1 lg:flex"
            >
              {TOP_TABS.map((tab) => {
                const active = isNavActive(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border border-[#CCFF00]/35 bg-[#CCFF00]/12 text-[#CCFF00]"
                        : "border border-transparent text-[#A1A1AA] hover:bg-[#16191E] hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Global Search (/) + Epoch Status + Wallet */}
          <div className="flex items-center gap-2.5">
            <div className="relative hidden md:block">
              <div className="flex items-center gap-2 rounded-lg border border-[#242830] bg-[#131518] px-2.5 py-1.5 text-xs focus-within:border-[#CCFF00]">
                <Search className="h-3.5 w-3.5 text-[#71717A]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={topSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  onChange={(e) => setTopSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && quickSearchResults[0]) {
                      router.push(quickSearchResults[0].href);
                      setSearchFocused(false);
                    }
                  }}
                  placeholder="Search sectors & pages..."
                  className="w-44 bg-transparent text-xs text-[#F4F4F5] placeholder-[#71717A] outline-none lg:w-52"
                />
                <kbd className="rounded border border-[#2B2B35] bg-[#0B0B0E] px-1.5 py-0.5 font-mono text-[10px] text-[#71717A]">
                  /
                </kbd>
              </div>

              {searchFocused && quickSearchResults.length > 0 && (
                <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-72 overflow-hidden rounded-xl border border-[#26262F] bg-[#141418] py-1.5 shadow-2xl">
                  {quickSearchResults.map((res) => (
                    <button
                      key={`${res.kind}-${res.href}`}
                      type="button"
                      onMouseDown={() => router.push(res.href)}
                      className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-xs transition-colors hover:bg-[#1E1E24]"
                    >
                      <span className="font-medium text-[#F4F4F5]">{res.label}</span>
                      <span className="rounded bg-[#22222A] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                        {res.kind}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden xl:block">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
            </div>

            <a
              href="https://x.com/NTI_Index"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="NTI on X"
              title="NTI on X (@NTI_Index)"
              className="hidden sm:inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#24242C] bg-[#141418] text-[#A1A1AA] transition-colors hover:border-[#3F3F4C] hover:text-white"
            >
              <XIcon className="h-3.5 w-3.5" />
            </a>

            <WalletButton />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle workspace menu"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#24242C] bg-[#141418] text-[#A1A1AA] lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[#222229] bg-[#0E0E12] px-4 py-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
              <Link href="/" className="text-xs font-medium text-[#A1A1AA] hover:text-white">
                Home
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {SIDEBAR_GROUPS.flatMap((g) => g.items).map((item) => {
                const active = isNavActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-lg border px-2.5 py-2 text-center text-[11px] font-medium ${
                      active
                        ? "border-[#CCFF00]/50 bg-[#16191E] text-[#CCFF00]"
                        : "border-[#242830] text-[#A1A1AA]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <div className="flex min-h-[calc(100vh-52px)]">
        {/* Left Collapsible Dashboard Rail */}
        <aside
          aria-label="Dashboard navigation"
          className={`sticky top-13 hidden h-[calc(100vh-52px)] shrink-0 flex-col justify-between border-r border-[#242830] bg-[#0B0D11] transition-all lg:flex ${
            sidebarCollapsed ? "w-14" : "w-56"
          }`}
        >
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3.5 pt-4 pb-2">
              {!sidebarCollapsed && (
                <span className="text-sm font-semibold text-[#F4F4F5]">Workspace</span>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#222229] bg-[#131317] text-[#A1A1AA] hover:text-white"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {!sidebarCollapsed && (
              <div className="px-3 pb-3">
                <div className="flex items-center gap-2 rounded-lg border border-[#222229] bg-[#131317] px-2.5 py-1.5 text-xs focus-within:border-[#3B3B48]">
                  <Search className="h-3.5 w-3.5 text-[#71717A]" />
                  <input
                    type="text"
                    value={sidebarFilter}
                    onChange={(e) => setSidebarFilter(e.target.value)}
                    placeholder="Search dashboards"
                    className="w-full bg-transparent text-xs text-[#F4F4F5] placeholder-[#71717A] outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4 overflow-y-auto px-2.5 py-1">
              {filteredGroups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  {!sidebarCollapsed && (
                    <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-[#52525B]">
                      {group.label}
                    </p>
                  )}
                  <nav className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isNavActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={item.label}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "border border-[#CCFF00]/35 bg-[#16191E] text-white"
                              : "border border-transparent text-[#A1A1AA] hover:bg-[#131518] hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? "text-[#CCFF00]" : "text-[#71717A]"
                            }`}
                          />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </nav>
                </section>
              ))}
            </div>
          </div>

          {!sidebarCollapsed && (
            <div className="border-t border-[#222229] p-3.5 text-[11px]">
              <div className="flex items-center justify-between text-[#71717A]">
                <span className="inline-flex items-center gap-1.5">
                  <RobinhoodMark className="h-3.5 w-auto opacity-85" />
                  <span>Chain</span>
                </span>
                <span className="font-medium text-[#10B981]">
                  {chainId}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[#71717A]">
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <span>Explorer</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://x.com/NTI_Index"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <XIcon className="h-2.5 w-2.5" />
                  <span>@NTI_Index</span>
                </a>
                <Link href="/" className="hover:text-white">
                  Landing
                </Link>
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace Canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6">
            <TestnetBanner />
          </div>
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
