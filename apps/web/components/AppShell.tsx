"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Menu, Search, X } from "lucide-react";
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

interface NavItem {
  href: string;
  label: string;
}

/** Single navigation system: every dashboard is one click away, in the order a trader uses them. */
const NAV: readonly NavItem[] = [
  { href: "/terminal", label: "Mindshare" },
  { href: "/radar", label: "Radar" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/markets", label: "Markets" },
  { href: "/baskets", label: "Baskets" },
  { href: "/grants", label: "Grants" },
  { href: "/stake", label: "Stake" },
  { href: "/oracle", label: "Oracle" },
  { href: "/methodology", label: "Docs" },
];

/** Lime underline that pulses while the target page is still loading (must render inside the Link). */
function PendingBar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="nav-pending absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#CCFF00]" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navItemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const navMountedRef = useRef(false);

  const [epochMeta, setEpochMeta] = useState<{
    epochId: number | null;
    status: EpochStatus;
  }>({ epochId: null, status: "collecting" });
  const [sectors, setSectors] = useState<NarrativeIndexItem[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Optimistic navigation: glide the active tab immediately on click; only show full skeleton if server takes >120ms.
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [hoveredNavHref, setHoveredNavHref] = useState<string | null>(null);
  const [navAnimate, setNavAnimate] = useState(false);
  const [activeNavIndicator, setActiveNavIndicator] = useState({ left: 0, width: 0, visible: false });
  const [hoverNavIndicator, setHoverNavIndicator] = useState({ left: 0, width: 0, visible: false });

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
    setMobileOpen(false);
    setSearchFocused(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
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

  const isActive = (href: string) => {
    if (href === "/terminal") return pathname === "/terminal" || pathname.startsWith("/narratives");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      ...NARRATIVES.map((n) => ({ href: `/narratives/${n.id}`, label: n.label, kind: "Sector" })),
      ...NAV.map((i) => ({ href: i.href, label: i.label, kind: "Page" })),
    ];
    if (!q) return all.slice(0, 7);
    return all.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  return (
    <div className="app-root min-h-screen bg-[#060607] text-[#F4F4F5]">
      <header className="sticky top-0 z-40 border-b border-[#232325] bg-[#060607]/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1480px] items-stretch justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-stretch gap-1">
            <Link href="/" className="flex items-center gap-2.5 pr-5" aria-label="NTI home">
              <NtiBrandMark className="h-7 w-7" />
              <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.04em] text-white">
                NTI
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-[#71717A] 2xl:inline">
                Narrative Index
              </span>
            </Link>

            <nav aria-label="Dashboards" className="hidden items-stretch lg:flex">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onPointerDown={() => router.prefetch(item.href)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      if (item.href !== pathname) setOptimisticPath(item.href);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center border-l border-[#1B1B1D] px-3 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors last:border-r xl:px-4 xl:text-[11px] ${
                      active ? "bg-[#0E0E0F] text-white" : "text-[#8A8A93] hover:bg-[#0B0B0C] hover:text-white"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#CCFF00]" />
                    )}
                    <PendingBar />
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden xl:block">
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
                  placeholder="Search"
                  aria-label="Search sectors and pages"
                  className="w-28 bg-transparent text-xs text-[#F4F4F5] placeholder-[#52525B] outline-none xl:w-40"
                />
                <kbd className="rounded border border-[#2E2E31] px-1.5 font-mono text-[10px] text-[#71717A]">
                  /
                </kbd>
              </div>
              {searchFocused && results.length > 0 && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-md border border-[#2E2E31] bg-[#0C0C0D] py-1 shadow-2xl">
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

            <div className="hidden 2xl:block">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
            </div>

            <a
              href="https://x.com/NTI_Index"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="NTI on X"
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-[#232325] text-[#8A8A93] transition-colors hover:border-[#3A3A3D] hover:text-white sm:inline-flex"
            >
              <XIcon className="h-3.5 w-3.5" />
            </a>

            <WalletButton />

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#232325] text-[#A1A1AA] lg:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#232325] bg-[#09090A] px-4 py-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
              <Link href="/" className="font-mono text-[11px] uppercase tracking-wider text-[#8A8A93]">
                Home
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md border px-2 py-2.5 text-center font-mono text-[11px] uppercase tracking-wider ${
                    isActive(item.href)
                      ? "border-[#CCFF00]/50 bg-[#0E0E0F] text-[#CCFF00]"
                      : "border-[#232325] text-[#A1A1AA]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
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
          <div className="absolute -top-52 right-[6%] h-[300px] w-[520px] rounded-full bg-[#38BDF8]/[0.05] blur-[120px]" />
        </div>
        <main className="app-main relative mx-auto min-h-[70vh] w-full max-w-[1480px] px-4 pb-16 pt-8 sm:px-6">
          {optimisticPath && optimisticPath !== pathname ? <AppLoading /> : children}
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
            <Link href="/" className="hover:text-white">
              Landing
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
