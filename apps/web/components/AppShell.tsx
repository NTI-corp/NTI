"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Grid3x3,
  Landmark,
  Layers,
  Loader2,
  Menu,
  Radar,
  Search,
  ShieldCheck,
  Sprout,
  Swords,
  X,
} from "lucide-react";
import { NARRATIVES } from "@nti/sdk";
import { EpochBadge } from "./EpochBadge";
import { LiveTickerBar } from "./LiveTickerBar";
import { HalftoneHorizonCanvas } from "./HalftoneHorizonCanvas";
import { TestnetBanner } from "./TestnetBanner";
import { WalletButton } from "./WalletButton";
import { getActiveChainId, getChain } from "@/lib/contracts";
import type { EpochStatus, IndexesSnapshot, NarrativeIndexItem } from "@/lib/types";
import { NtiBrandMark } from "@/components/landing/NtiLogos";
import { RobinhoodMark, XIcon } from "@/components/ui/Icons";
import AppLoading from "@/app/(app)/loading";

type IconType = React.ComponentType<{ className?: string }>;

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: IconType;
}

interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

/** Sidebar navigation: grouped by what a visitor wants to do, so nothing piles up in the top bar. */
const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Analytics",
    items: [
      { href: "/terminal", label: "Mindshare", hint: "Sector share of attention", icon: BarChart3 },
      { href: "/radar", label: "Radar", hint: "Velocity and new tokens", icon: Radar },
      { href: "/heatmap", label: "Heatmap", hint: "Attention vs builders", icon: Grid3x3 },
    ],
  },
  {
    title: "Trade",
    items: [
      { href: "/markets", label: "Markets", hint: "Narrative pair markets", icon: Swords },
      { href: "/baskets", label: "Baskets", hint: "Spot narrative vaults", icon: Layers },
    ],
  },
  {
    title: "Protocol",
    items: [
      { href: "/grants", label: "Grants", hint: "Ecosystem funding", icon: Sprout },
      { href: "/stake", label: "Stake", hint: "Tiers and governance", icon: Landmark },
      { href: "/oracle", label: "Oracle", hint: "Epochs and attestations", icon: ShieldCheck },
    ],
  },
  {
    title: "Resources",
    items: [{ href: "/methodology", label: "Docs", hint: "Methodology and formulas", icon: BookOpen }],
  },
];

const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const SIDEBAR_FULL = 248;
const SIDEBAR_RAIL = 72;
const COLLAPSE_KEY = "nti.sidebar.collapsed";

/** Spinner shown on the link while its page is still loading (must render inside the Link). */
function PendingSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={`animate-spin text-[#CCFF00] ${className}`} aria-hidden="true" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [epochMeta, setEpochMeta] = useState<{
    epochId: number | null;
    status: EpochStatus;
  }>({ epochId: null, status: "collecting" });
  const [sectors, setSectors] = useState<NarrativeIndexItem[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Optimistic navigation: highlight the target at once; show the skeleton only if the server takes >120ms.
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable: stay expanded
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    // Warm every dashboard right after the shell mounts so the first click is never cold.
    const ids: number[] = [];
    NAV.forEach((item, i) => {
      ids.push(window.setTimeout(() => router.prefetch(item.href), 150 + i * 120));
    });
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [router]);

  useEffect(() => {
    // Any in-app link (cards, tables, "open narrative" buttons) shows the skeleton on click, too.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (url.pathname === "/" || url.pathname.startsWith("/api/")) return;
      setOptimisticPath(url.pathname);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    setOptimisticPath(null);
    setShowSkeleton(false);
    setDrawerOpen(false);
    setSearchFocused(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    if (!optimisticPath || optimisticPath === pathname) {
      setShowSkeleton(false);
      return;
    }
    const id = window.setTimeout(() => setShowSkeleton(true), 120);
    return () => window.clearTimeout(id);
  }, [optimisticPath, pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    // Lock page scroll behind the mobile drawer.
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    let active = true;
    const loadEpoch = async () => {
      try {
        const res = await fetch("/api/indexes");
        if (!res.ok) return;
        const data = (await res.json()) as IndexesSnapshot;
        if (!active) return;
        const target = data.latestObservedEpoch ?? data.latestFinalEpoch;
        if (target) setEpochMeta({ epochId: target.epochId, status: target.status });
        if (Array.isArray(data.narratives)) setSectors(data.narratives);
      } catch {
        // transient poll failure: keep the last known epoch
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

  const isMatchHref = useCallback((targetPath: string, href: string) => {
    if (href === "/terminal") return targetPath === "/terminal" || targetPath.startsWith("/narratives");
    return targetPath === href || targetPath.startsWith(`${href}/`);
  }, []);

  const currentNavHref = useMemo(() => {
    const targetPath = optimisticPath ?? pathname;
    return NAV.find((item) => isMatchHref(targetPath, item.href))?.href ?? null;
  }, [optimisticPath, pathname, isMatchHref]);

  const currentItem = NAV.find((i) => i.href === currentNavHref) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      ...NARRATIVES.map((n) => ({ href: `/narratives/${n.id}`, label: n.label, kind: "Sector" })),
      ...NAV.map((i) => ({ href: i.href, label: i.label, kind: "Page" })),
    ];
    if (!q) return all.slice(0, 7);
    return all.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  /** Sidebar body, shared by the desktop rail and the mobile drawer. */
  const renderSidebar = (rail: boolean) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-14 shrink-0 items-center border-b border-[#232325] ${rail ? "justify-center" : "px-4"}`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="NTI home">
          <NtiBrandMark className="h-7 w-7" />
          {!rail && (
            <span className="flex flex-col leading-none">
              <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.04em] text-white">
                NTI
              </span>
              <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.2em] text-[#71717A]">
                Narrative Index
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav aria-label="Dashboards" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? "mt-5" : ""}>
            {rail ? (
              gi > 0 && <div className="mx-2 mb-3 h-px bg-[#1B1B1D]" />
            ) : (
              <div className="mb-1.5 px-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#52525B]">
                {group.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = currentNavHref === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch
                      title={rail ? item.label : undefined}
                      onPointerDown={() => router.prefetch(item.href)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        if (item.href !== pathname) setOptimisticPath(item.href);
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center rounded-lg transition-colors ${
                        rail ? "h-10 justify-center" : "gap-3 px-2.5 py-2"
                      } ${
                        active
                          ? "bg-[#CCFF00]/[0.09] text-white"
                          : "text-[#8A8A93] hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[#CCFF00] shadow-[0_0_12px_rgba(204,255,0,0.55)]" />
                      )}
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          active
                            ? "border-[#CCFF00]/40 bg-[#CCFF00]/12 text-[#CCFF00]"
                            : "border-[#232325] bg-[#0C0C0D] group-hover:border-[#3A3A3D]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {!rail && (
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold leading-tight">
                            {item.label}
                          </span>
                          <span className="block truncate text-[10.5px] leading-tight text-[#62626A]">
                            {item.hint}
                          </span>
                        </span>
                      )}
                      <PendingSpinner className={rail ? "absolute right-1 top-1 h-3 w-3" : "h-3.5 w-3.5"} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#232325] p-3">
        {!rail && (
          <div className="mb-3">
            <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
          </div>
        )}
        <div className={`flex items-center gap-1.5 ${rail ? "flex-col" : ""}`}>
          <a
            href="https://x.com/NTI_Index"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="NTI on X"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#232325] text-[#8A8A93] transition-colors hover:border-[#3A3A3D] hover:text-white"
          >
            <XIcon className="h-3.5 w-3.5" />
          </a>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Block explorer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#232325] text-[#8A8A93] transition-colors hover:border-[#3A3A3D] hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {!rail && (
            <Link
              href="/"
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717A] transition-colors hover:text-white"
            >
              Landing
            </Link>
          )}
        </div>
        {!rail && (
          <div className="mt-3 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#52525B]">
            <RobinhoodMark className="h-3 w-auto opacity-70" />
            Chain {chainId}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-root min-h-screen bg-[#060607] text-[#F4F4F5]">
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-[#232325] bg-[#08080A] transition-[width] duration-200 ease-out lg:block"
        style={{ width: collapsed ? SIDEBAR_RAIL : SIDEBAR_FULL }}
      >
        {renderSidebar(collapsed)}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-[68px] z-50 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[#2E2E31] bg-[#0C0C0D] text-[#8A8A93] transition-colors hover:border-[#CCFF00]/50 hover:text-white"
        >
          {collapsed ? <ChevronsRight className="h-3 w-3" /> : <ChevronsLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/70 backdrop-blur-sm"
          />
          <aside className="drawer-enter absolute inset-y-0 left-0 w-[284px] max-w-[86vw] border-r border-[#232325] bg-[#08080A] shadow-2xl">
            {renderSidebar(false)}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#232325] text-[#A1A1AA]"
            >
              <X className="h-4 w-4" />
            </button>
          </aside>
        </div>
      )}

      <div
        className="min-h-screen transition-[padding] duration-200 ease-out lg:pl-[var(--sb)]"
        style={{ ["--sb" as string]: `${collapsed ? SIDEBAR_RAIL : SIDEBAR_FULL}px` }}
      >
        <header className="sticky top-0 z-30 border-b border-[#232325] bg-[#060607]/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#232325] text-[#A1A1AA] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="NTI home">
                <NtiBrandMark className="h-6 w-6" />
              </Link>
              {currentItem && (
                <div className="hidden min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A] sm:flex">
                  <currentItem.icon className="h-3.5 w-3.5 text-[#CCFF00]" />
                  <span className="truncate text-[#D4D4D8]">{currentItem.label}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <div className="flex items-center gap-2 rounded-md border border-[#232325] bg-[#0C0C0D] px-2.5 py-1.5 focus-within:border-[#CCFF00]/60">
                  <Search className="h-3.5 w-3.5 text-[#71717A]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && results[0]) {
                        router.push(results[0].href);
                        setSearchFocused(false);
                      }
                    }}
                    placeholder="Search sectors, pages"
                    aria-label="Search sectors and pages"
                    className="w-36 bg-transparent text-xs text-[#F4F4F5] placeholder-[#52525B] outline-none lg:w-52"
                  />
                  <kbd className="rounded border border-[#2E2E31] px-1.5 font-mono text-[10px] text-[#71717A]">
                    /
                  </kbd>
                </div>
                {searchFocused && results.length > 0 && (
                  <div className="pop-enter absolute right-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-md border border-[#2E2E31] bg-[#0C0C0D] py-1 shadow-2xl">
                    {results.map((r) => (
                      <button
                        key={`${r.kind}-${r.href}`}
                        type="button"
                        onMouseDown={() => router.push(r.href)}
                        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-xs transition-colors hover:bg-[#151516]"
                      >
                        <span className="font-medium text-[#F4F4F5]">{r.label}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                          {r.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden sm:block lg:hidden xl:block">
                <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
              </div>

              <WalletButton />
            </div>
          </div>
        </header>

        <LiveTickerBar narratives={sectors} epochId={epochMeta.epochId} />
        <TestnetBanner />

        <div className="relative">
          {/* Atmosphere: dot matrix fading downward plus a soft lime glow behind the page header */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden">
            <HalftoneHorizonCanvas className="absolute inset-x-0 top-0 h-full w-full opacity-60" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, rgba(6,6,7,0) 0%, #060607 96%)" }}
            />
            <div className="absolute -top-44 left-[18%] h-[360px] w-[720px] rounded-full bg-[#CCFF00]/[0.075] blur-[120px]" />
          </div>
          <main className="app-main relative mx-auto min-h-[70vh] w-full max-w-[1480px] px-4 pb-16 pt-8 sm:px-6">
            {showSkeleton && optimisticPath && optimisticPath !== pathname ? (
              <div className="tab-panel-enter">
                <AppLoading />
              </div>
            ) : (
              <div
                className={`transition-[opacity,transform] duration-150 ease-out ${
                  optimisticPath && optimisticPath !== pathname
                    ? "translate-y-[4px] opacity-65"
                    : "translate-y-0 opacity-100"
                }`}
              >
                {children}
              </div>
            )}
          </main>
        </div>

        <footer className="border-t border-[#232325]">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717A] sm:px-6">
            <span className="inline-flex items-center gap-2">
              <RobinhoodMark className="h-3.5 w-auto opacity-80" />
              Robinhood Chain · {chainId}
            </span>
            <span className="flex items-center gap-5">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://x.com/NTI_Index"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-white"
              >
                @NTI_Index
              </a>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
