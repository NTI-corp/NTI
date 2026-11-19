"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { EpochBadge } from "./EpochBadge";
import { TestnetBanner } from "./TestnetBanner";
import { useSiweSession } from "./Providers";
import { truncateHex } from "@/lib/format";
import { getActiveChainId } from "@/lib/contracts";
import type { EpochStatus, IndexesSnapshot } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/radar", label: "Radar" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/markets", label: "Markets" },
  { href: "/baskets", label: "Baskets" },
  { href: "/grants", label: "Grants" },
  { href: "/stake", label: "Stake" },
  { href: "/oracle", label: "Oracle" },
  { href: "/methodology", label: "Methodology" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { session, signingIn, signIn, signOut } = useSiweSession();

  const [epochMeta, setEpochMeta] = useState<{
    epochId: number | null;
    status: EpochStatus;
  }>({ epochId: null, status: "collecting" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const primaryConnector = connectors[0];
  const chainId = getActiveChainId();

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/narratives");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#06070A] text-[#F3F5F8]">
      {/* Top Swiss-Terminal Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#1B202C] bg-[#06070A]/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4">
          {/* Geometric NTI Brand Mark + Nav */}
          <div className="flex items-center gap-6">
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
                  NTI <span className="font-mono font-normal text-[#5A6478]">//</span> TERMINAL
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#5A6478]">
                  MINDSHARE ORACLE · {chainId}
                </span>
              </div>
            </Link>

            <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
              {NAV_ITEMS.map((item) => {
                const active = isNavActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                      active
                        ? "bg-[#11141C] text-[#F3F5F8] ring-1 ring-inset ring-[#2B3345]"
                        : "text-[#8B94A7] hover:bg-[#0B0D12] hover:text-[#F3F5F8]"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute right-1.5 bottom-0 left-1.5 h-[1.5px] bg-[#B8FF2E]" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Live Epoch + Wallet & SIWE */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
            </div>

            {!isConnected ? (
              <button
                type="button"
                disabled={!primaryConnector || isConnecting}
                onClick={() => primaryConnector && connect({ connector: primaryConnector })}
                className="min-h-[34px] cursor-pointer border border-[#B8FF2E]/60 bg-[#B8FF2E] px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#06070A] transition-all hover:bg-[#c9ff5c] disabled:opacity-50"
              >
                {isConnecting ? "CONNECTING..." : "CONNECT WALLET"}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {session?.authenticated ? (
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    title={`${session.tierName} · Click to end SIWE session`}
                    className={`hidden min-h-[34px] cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider sm:inline-flex ${
                      session.hasRadarAccess
                        ? "border-[#B8FF2E]/45 bg-[#B8FF2E]/10 text-[#B8FF2E]"
                        : "border-[#2B3345] bg-[#0B0D12] text-[#8B94A7]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        session.hasRadarAccess ? "bg-[#B8FF2E]" : "bg-[#8B94A7]"
                      }`}
                    />
                    {session.hasRadarAccess ? "SIWE · RT RADAR" : "SIWE VERIFIED"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => void signIn()}
                    className="min-h-[34px] cursor-pointer border border-[#23F7DD]/45 bg-[#23F7DD]/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#23F7DD] transition-colors hover:bg-[#23F7DD]/20 disabled:opacity-50"
                  >
                    {signingIn ? "SIGNING..." : "SIGN IN (SIWE)"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => disconnect()}
                  title="Disconnect wallet"
                  className="min-h-[34px] cursor-pointer border border-[#1B202C] bg-[#0B0D12] px-2.5 py-1.5 font-mono text-[11px] text-[#F3F5F8] transition-colors hover:border-[#F43F5E]/55 hover:text-[#F43F5E]"
                >
                  {truncateHex(address, 6, 4)}
                </button>
              </div>
            )}

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

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[#1B202C] bg-[#0B0D12] px-4 py-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-[44px] items-center justify-center border px-2 py-2 text-center font-mono text-[11px] uppercase ${
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

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6">{children}</main>

      <footer className="mt-10 border-t border-[#1B202C] bg-[#06070A]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#8B94A7]">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5A6478]">
              METHODOLOGY NOTICE
            </span>
            Measures how actively crypto narratives are discussed across X; does not predict token prices.
          </p>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-[#5A6478]">
            <span>ROBINHOOD CHAIN · ID {chainId}</span>
            <span>4H EPOCHS · DECIMAL(40) · HAMILTON BPS</span>
            <Link href="/methodology" className="text-[#B8FF2E] hover:underline">
              VERIFY FORMULAS →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
