"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
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
  Users,
  Wallet,
  X,
} from "lucide-react";
import { NARRATIVES } from "@nti/sdk";
import { EpochBadge } from "./EpochBadge";
import { LiveTickerBar } from "./LiveTickerBar";
import { TestnetBanner } from "./TestnetBanner";
import { WalletButton } from "./WalletButton";
import { getActiveChainId, getChain } from "@/lib/contracts";
import type { EpochStatus, IndexesSnapshot, NarrativeIndexItem } from "@/lib/types";
import { NtiBrandMark } from "@/components/landing/NtiLogos";
import { RobinhoodMark, XIcon } from "@/components/ui/Icons";
import { InstantRouteShell } from "@/components/InstantRouteShell";

type IconType = React.ComponentType<{ className?: string }>;

interface NavItem {
  href: string;
  label: string;
  hint: string;
  group: string;
  icon: IconType;
}

interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Analytics",
    items: [
      { href: "/terminal", label: "Mindshare", hint: "Sector attention share", group: "Analytics", icon: BarChart3 },
      { href: "/radar", label: "Radar", hint: "Velocity and new tokens", group: "Analytics", icon: Radar },
      { href: "/heatmap", label: "Heatmap", hint: "Attention vs builders", group: "Analytics", icon: Grid3x3 },
      { href: "/kols", label: "KOLs", hint: "1,500 KOL reputation", group: "Analytics", icon: Users },
    ],
  },
  {
    title: "Trade",
    items: [
      { href: "/markets", label: "Markets", hint: "Narrative pair pools", group: "Trade", icon: Swords },
      { href: "/baskets", label: "Baskets", hint: "TWAP spot vaults", group: "Trade", icon: Layers },
      { href: "/portfolio", label: "Portfolio", hint: "Wallet positions", group: "Trade", icon: Wallet },
    ],
  },
  {
    title: "Protocol",
    items: [
      { href: "/grants", label: "Grants", hint: "Ecosystem funding", group: "Protocol", icon: Sprout },
      { href: "/stake", label: "Stake", hint: "Tiers and governance", group: "Protocol", icon: Landmark },
      { href: "/oracle", label: "Oracle", hint: "Epochs and attestations", group: "Protocol", icon: ShieldCheck },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/methodology", label: "Methodology", hint: "Formulas and replay", group: "Reference", icon: BookOpen },
    ],
  },
];

const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const SIDEBAR_FULL = 244;
const SIDEBAR_RAIL = 60;
const COLLAPSE_KEY = "nti.sidebar.collapsed";

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
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore
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
    const ids: number[] = [];
    NAV.forEach((item, i) => {
      ids.push(window.setTimeout(() => router.prefetch(item.href), 150 + i * 110));
    });
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [router]);

  useEffect(() => {
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
    setDrawerOpen(false);
    setSearchFocused(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    if (!optimisticPath) return;
    const id = window.setTimeout(() => setOptimisticPath(null), 12_000);
    return () => window.clearTimeout(id);
  }, [optimisticPath]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setSearchFocused(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
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
        // ignore transient poll failures
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
    chain.blockExplorers?.default.url ?? "https://robinhoodchain.blockscout.com";

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

  /** NTI Pure Graphite Sidebar: 52px header aligned with topbar, full-height balanced nav + docked footer. */
  const renderSidebar = (rail: boolean) => (
    <div className="flex h-full flex-col overflow-hidden bg-[#111113]">
      {/* 52px Brand Header — pixel-aligned with sticky topbar border */}
      <div
        className={`flex h-[52px] shrink-0 items-center border-b border-[#26262A] ${
          rail ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        <Link href="/" className="inline-flex items-center gap-2.5 text-[#F5F5F7]" aria-label="NTI home">
          <NtiBrandMark className="h-7 w-7 shrink-0" />
          {!rail && (
            <span className="leading-none">
              <span className="block text-[15px] font-semibold tracking-[-0.03em] text-[#F5F5F7]">
                NTI
              </span>
              <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[0.14em] text-[#71717A]">
                MINDSHARE TERMINAL
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Main Nav — fills viewport height cleanly with balanced rhythm */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        {NAV_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title} className="mt-4 first:mt-0.5">
            {rail ? (
              <div className="mx-1.5 mb-2 h-px bg-[#26262A]" />
            ) : (
              <p className="mb-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#71717A]">
                {group.title}
              </p>
            )}
            <nav className="grid gap-1" aria-label={`${group.title} navigation`}>
              {group.items.map((item) => {
                const active = currentNavHref === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    title={rail ? `${item.label} - ${item.hint}` : undefined}
                    onPointerDown={() => router.prefetch(item.href)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      setDrawerOpen(false);
                      if (item.href !== pathname) setOptimisticPath(item.href);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center border-l-2 transition-colors ${
                      rail ? "h-10 justify-center px-0" : "min-h-[44px] gap-2.5 px-2.5 py-1.5"
                    } ${
                      active
                        ? "border-l-[#CCFF00] bg-[#1E1E21] text-[#F5F5F7]"
                        : "border-l-transparent text-[#A1A1AA] hover:bg-[#161618] hover:text-[#F5F5F7]"
                    }`}
                  >
                    <Icon
                      className={`h-[15px] w-[15px] shrink-0 ${
                        active ? "text-[#CCFF00]" : "text-[#71717A] group-hover:text-[#F5F5F7]"
                      }`}
                    />
                    {!rail && (
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <b className="truncate text-[12px] font-medium leading-tight">
                          {item.label}
                        </b>
                        <small
                          className={`truncate text-[10px] leading-tight ${
                            active ? "text-[#A1A1AA]" : "text-[#71717A]"
                          }`}
                        >
                          {item.hint}
                        </small>
                      </span>
                    )}
                    <PendingSpinner
                      className={rail ? "absolute right-1 top-1 h-2.5 w-2.5" : "h-3 w-3"}
                    />
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}
      </div>

      {/* Bottom Docked Epoch + Network Footer */}
      {!rail && (
        <div className="shrink-0 space-y-2 border-t border-[#26262A] px-3 py-2.5">
          <div
            className="flex items-center justify-between gap-2 border border-[#26262A] bg-[#161618] px-2.5 py-1.5"
            aria-label="Oracle epoch state"
          >
            <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[#71717A]">
              4H · 2/3
            </span>
          </div>

          <div className="flex items-center justify-between px-0.5 text-[#A1A1AA]">
            <span className="inline-flex items-center gap-1.5 text-[#F5F5F7]">
              <RobinhoodMark className="h-3 w-auto opacity-90" />
              <span className="font-mono text-[9.5px] text-[#A1A1AA]">Chain {chainId}</span>
            </span>
            <span className="flex items-center gap-2.5 font-mono text-[9.5px] text-[#71717A]">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-[#F5F5F7]"
              >
                Explorer ↗
              </a>
              <a
                href="https://x.com/NTI_Index"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#F5F5F7]"
              >
                <XIcon className="h-2.5 w-2.5" />
              </a>
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-root min-h-screen bg-[#0D0D0E] text-[#F5F5F7]">
      {/* Fixed Full-Viewport Left Sidebar */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden h-screen border-r border-[#26262A] bg-[#111113] transition-[width] duration-200 ease-out lg:block"
        style={{ width: collapsed ? SIDEBAR_RAIL : SIDEBAR_FULL }}
      >
        {renderSidebar(collapsed)}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-[54px] z-50 flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] border border-[#3A3A40] bg-[#161618] text-[#A1A1AA] transition-colors hover:border-[#CCFF00] hover:text-[#F5F5F7]"
        >
          {collapsed ? <ChevronsRight className="h-3 w-3" /> : <ChevronsLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/75 backdrop-blur-sm"
          />
          <aside className="drawer-enter absolute inset-y-0 left-0 w-[264px] max-w-[86vw] border-r border-[#26262A] bg-[#0D0D0E] shadow-2xl">
            {renderSidebar(false)}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] border border-[#3A3A40] text-[#F5F5F7]"
            >
              <X className="h-4 w-4" />
            </button>
          </aside>
        </div>
      )}

      {/* Workspace Column */}
      <div
        className="flex min-h-screen flex-col transition-[padding] duration-200 ease-out lg:pl-[var(--sb)]"
        style={{ ["--sb" as string]: `${collapsed ? SIDEBAR_RAIL : SIDEBAR_FULL}px` }}
      >
        {/* 52px Sticky Terminal Bar (aligned with sidebar header) */}
        <header className="sticky top-0 z-30 border-b border-[#26262A] bg-[#111113]/95 backdrop-blur-sm">
          <div className="flex h-[52px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-[#3A3A40] text-[#F5F5F7] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="NTI home">
                <NtiBrandMark className="h-6 w-6" />
              </Link>
              {(() => {
                const routePath = optimisticPath ?? pathname;
                const parentBack = routePath.startsWith("/narratives/")
                  ? { href: "/terminal", label: "Terminal" }
                  : routePath.startsWith("/markets/")
                    ? { href: "/markets", label: "Markets" }
                    : routePath.startsWith("/baskets/")
                      ? { href: "/baskets", label: "Baskets" }
                      : null;

                return (
                  <>
                    {parentBack && (
                      <Link
                        href={parentBack.href}
                        onClick={() => {
                          if (parentBack.href !== pathname) setOptimisticPath(parentBack.href);
                        }}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[#26262A] bg-[#161618] px-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#F5F5F7] transition-colors hover:border-[#CCFF00] hover:bg-[#1E1E21] hover:text-[#CCFF00]"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Back</span>
                        <span className="hidden text-[#71717A] sm:inline">· {parentBack.label}</span>
                      </Link>
                    )}
                    {currentItem && (
                      <p className="hidden min-w-0 items-center gap-2 text-[12px] text-[#71717A] sm:flex">
                        <span>{currentItem.group}</span>
                        <span aria-hidden="true">/</span>
                        <b className="truncate font-medium text-[#F5F5F7]">{currentItem.label}</b>
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <div className="flex h-9 items-center gap-2 rounded-[2px] border border-[#26262A] bg-[#161618] px-2.5 focus-within:border-[#CCFF00]">
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
                        if (results[0].href !== pathname) setOptimisticPath(results[0].href);
                        router.push(results[0].href);
                        setSearchFocused(false);
                      }
                    }}
                    placeholder="Search sectors, pages"
                    aria-label="Search sectors and pages"
                    className="w-36 bg-transparent text-xs text-[#F5F5F7] placeholder-[#71717A] outline-none lg:w-52"
                  />
                  <kbd className="rounded-[2px] border border-[#3A3A40] px-1.5 font-mono text-[9.5px] text-[#71717A]">
                    /
                  </kbd>
                </div>
                {searchFocused && results.length > 0 && (
                  <div className="pop-enter absolute right-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden border border-[#3A3A40] bg-[#161618] py-1 shadow-2xl">
                    {results.map((r) => (
                      <button
                        key={`${r.kind}-${r.href}`}
                        type="button"
                        onMouseDown={() => {
                          if (r.href !== pathname) setOptimisticPath(r.href);
                          router.push(r.href);
                        }}
                        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-xs transition-colors hover:bg-[#1E1E21]"
                      >
                        <span className="font-medium text-[#F5F5F7]">{r.label}</span>
                        <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#71717A]">
                          {r.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden xl:block">
                <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
              </div>

              <WalletButton />
            </div>
          </div>
        </header>

        <LiveTickerBar narratives={sectors} epochId={epochMeta.epochId} />
        <TestnetBanner />

        <main className="app-main mx-auto w-full max-w-[1440px] flex-1 px-4 pb-14 pt-6 sm:px-7">
          {optimisticPath && optimisticPath !== pathname ? (
            <InstantRouteShell path={optimisticPath} />
          ) : (
            children
          )}
        </main>

        <footer className="border-t border-[#26262A] bg-[#0D0D0E]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-[10px] uppercase tracking-[0.1em] text-[#71717A] sm:px-7">
            <span>Robinhood Chain · {chainId}</span>
            <span className="flex items-center gap-5">
              <a href={explorerUrl} target="_blank" rel="noreferrer noopener" className="hover:text-[#F5F5F7]">
                Explorer ↗
              </a>
              <a href="https://x.com/NTI_Index" target="_blank" rel="noreferrer noopener" className="hover:text-[#F5F5F7]">
                @NTI_Index ↗
              </a>
              <Link href="/" className="hover:text-[#F5F5F7]">
                Landing
              </Link>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
