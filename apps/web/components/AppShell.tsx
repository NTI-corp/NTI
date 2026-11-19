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

  // Poll live epoch status every 30s (fallback for Realtime epoch transitions)
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
    <div className="flex min-h-screen flex-col bg-[#090B0E] text-[#EDF1F7]">
      {/* Persistent Top Command Bar */}
      <header className="sticky top-0 z-40 border-b border-[#1B2028] bg-[#090B0E]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4">
          {/* Brand + Nav */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-7 w-7 items-center justify-center rounded border border-[#2A3342] bg-[#0E1117] font-mono text-xs font-semibold text-[#10B981] transition-colors group-hover:border-[#10B981]/60">
                N
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display text-sm font-bold tracking-tight text-[#EDF1F7]">
                  NTI <span className="font-mono font-normal text-[#556173]">//</span> TERMINAL
                </span>
                <span className="font-mono text-[9px] tracking-[0.18em] text-[#556173]">
                  MINDSHARE INDEX
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
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-[#131820] text-[#EDF1F7] ring-1 ring-inset ring-[#2A3342]"
                        : "text-[#8A96A8] hover:bg-[#0E1117] hover:text-[#EDF1F7]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Live Status + Wallet & SIWE */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:block">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} compact />
            </div>

            {!isConnected ? (
              <button
                type="button"
                disabled={!primaryConnector || isConnecting}
                onClick={() => primaryConnector && connect({ connector: primaryConnector })}
                className="rounded border border-[#2A3342] bg-[#131820] px-3 py-1.5 font-mono text-xs text-[#EDF1F7] transition-colors hover:border-[#38BDF8]/60 hover:bg-[#18202B] disabled:opacity-50"
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
                    className={`hidden items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[11px] sm:inline-flex ${
                      session.hasRadarAccess
                        ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]"
                        : "border-[#2A3342] bg-[#0E1117] text-[#8A96A8]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        session.hasRadarAccess ? "bg-[#10B981]" : "bg-[#8A96A8]"
                      }`}
                    />
                    {session.hasRadarAccess ? "SIWE · RT RADAR" : "SIWE VERIFIED"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => void signIn()}
                    className="rounded border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2.5 py-1.5 font-mono text-[11px] text-[#38BDF8] transition-colors hover:bg-[#38BDF8]/20 disabled:opacity-50"
                  >
                    {signingIn ? "SIGNING..." : "SIGN IN (SIWE)"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => disconnect()}
                  title="Disconnect wallet"
                  className="rounded border border-[#1B2028] bg-[#0E1117] px-2.5 py-1.5 font-mono text-xs text-[#EDF1F7] transition-colors hover:border-[#EF4444]/50 hover:text-[#EF4444]"
                >
                  {truncateHex(address, 6, 4)}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation"
              className="rounded border border-[#1B2028] bg-[#0E1117] px-2 py-1.5 font-mono text-xs text-[#8A96A8] lg:hidden"
            >
              {mobileMenuOpen ? "CLOSE" : "MENU"}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[#1B2028] bg-[#0E1117] px-4 py-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <EpochBadge epochId={epochMeta.epochId} status={epochMeta.status} />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded border px-2.5 py-2 text-center font-mono text-xs ${
                    isNavActive(item.href)
                      ? "border-[#2A3342] bg-[#131820] text-[#EDF1F7]"
                      : "border-[#1B2028] text-[#8A96A8]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Conditional Testnet / Pre-Freeze Banner */}
      <TestnetBanner />

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6">
        {children}
      </main>

      {/* Persistent Methodology Disclaimer Footer */}
      <footer className="mt-12 border-t border-[#1B2028] bg-[#0B0E13]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#8A96A8]">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-[#556173]">
              METHODOLOGY NOTICE
            </span>
            Measures how actively crypto narratives are discussed across X; does not predict token prices.
          </p>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-[#556173]">
            <span>ROBINHOOD CHAIN · ID {chainId}</span>
            <span>4H EPOCHS · HAMILTON BPS</span>
            <Link href="/methodology" className="text-[#8A96A8] hover:text-[#EDF1F7]">
              VERIFY FORMULAS →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
