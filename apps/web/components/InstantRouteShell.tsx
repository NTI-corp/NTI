"use client";

import React from "react";

interface RouteShellMeta {
  eyebrow: string;
  title: string;
  subtitle: string;
  layout: "terminal" | "split" | "grid3" | "grid2" | "stake" | "docs";
}

function getRouteMeta(path: string): RouteShellMeta {
  if (path.startsWith("/narratives/")) {
    return {
      eyebrow: "ANALYTICS · SECTOR TELEMETRY",
      title: "Narrative Sector",
      subtitle: "Reading 4h epoch series, contributing signals, and active markets.",
      layout: "terminal",
    };
  }
  if (path.startsWith("/markets/")) {
    return {
      eyebrow: "MARKETS · PARIMUTUEL POOL",
      title: "Pair Market",
      subtitle: "Reading pool split, cutoff schedule, and settlement index delta.",
      layout: "split",
    };
  }
  if (path.startsWith("/baskets/")) {
    return {
      eyebrow: "VAULTS · TWAP SPOT BASKET",
      title: "Basket Vault",
      subtitle: "Reading whitelisted Uniswap V3 constituents and live vault NAV.",
      layout: "split",
    };
  }
  switch (path) {
    case "/radar":
      return {
        eyebrow: "ANALYTICS · VELOCITY & LAUNCHES",
        title: "Emerging Radar",
        subtitle: "Velocity breakouts and new token launches inside rising narratives.",
        layout: "split",
      };
    case "/heatmap":
      return {
        eyebrow: "ANALYTICS · ATTENTION VS SUPPLY",
        title: "Builder Heatmap",
        subtitle: "Opportunity score across mindshare share and active builder density.",
        layout: "split",
      };
    case "/markets":
      return {
        eyebrow: "TRADE · PARIMUTUEL PAIR MARKETS",
        title: "Pair Markets",
        subtitle: "Fixed-horizon markets settled by finalized on-chain oracle epochs.",
        layout: "grid2",
      };
    case "/baskets":
      return {
        eyebrow: "TRADE · ERC-20 SPOT VAULTS",
        title: "Narrative Baskets",
        subtitle: "Admin-whitelisted Uniswap V3 vaults priced by 30-minute TWAP.",
        layout: "grid3",
      };
    case "/portfolio":
      return {
        eyebrow: "TRADE · WALLET POSITIONS",
        title: "Portfolio",
        subtitle: "Loading balances, basket shares, and market positions.",
        layout: "split",
      };
    case "/grants":
      return {
        eyebrow: "PROTOCOL · PUBLIC GOODS",
        title: "Ecosystem Grants",
        subtitle: "Snapshot-weighted quadratic funding rounds.",
        layout: "split",
      };
    case "/stake":
      return {
        eyebrow: "PROTOCOL · IVOTES STAKING",
        title: "Stake $NTI",
        subtitle: "Protocol fee share, fee discounts, and Radar access tiers.",
        layout: "stake",
      };
    case "/oracle":
      return {
        eyebrow: "PROTOCOL · EIP-712 CONSENSUS",
        title: "Oracle Provenance",
        subtitle: "Validator attestations, canonical dataset hashes, and bonded disputes.",
        layout: "split",
      };
    case "/methodology":
      return {
        eyebrow: "REFERENCE · SPECIFICATION",
        title: "Methodology",
        subtitle: "Deterministic scoring formulas, Hamilton rounding, and replay guide.",
        layout: "docs",
      };
    default:
      return {
        eyebrow: "ANALYTICS · 4H EPOCH INDEX",
        title: "Mindshare",
        subtitle: "Reading 10 crypto narrative weights, 4h velocity, and epoch trajectory.",
        layout: "terminal",
      };
  }
}

export function InstantRouteShell({ path }: { path: string }) {
  const meta = getRouteMeta(path);

  return (
    <div key={path} className="page-enter space-y-5" aria-busy="true" aria-label={`Loading ${meta.title}`}>
      <div className="relative border-b border-[#26262A] pb-4">
        <p className="kicker">{meta.eyebrow}</p>
        <h1 className="mt-1.5">{meta.title}</h1>
        <p>{meta.subtitle}</p>
        <div
          aria-hidden="true"
          className="absolute bottom-[-1px] left-0 right-0 h-[2px] overflow-hidden bg-[#1E1E21]"
        >
          <div className="loading-scan h-full w-1/3 bg-[#CCFF00]" />
        </div>
      </div>

      {meta.layout === "terminal" && (
        <>
          <div className="stat-strip stat-strip-compact">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="skeleton-shimmer h-2.5 w-24" />
                <div className="skeleton-shimmer mt-3 h-6 w-28" />
                <div className="skeleton-shimmer mt-2 h-2.5 w-36" />
              </div>
            ))}
          </div>
          <div className="skeleton-shimmer h-[360px] border border-[#26262A]" />
        </>
      )}

      {meta.layout === "grid2" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer h-44 border border-[#26262A]" />
          ))}
        </div>
      )}

      {meta.layout === "grid3" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-shimmer h-64 border border-[#26262A]" />
          ))}
        </div>
      )}

      {meta.layout === "stake" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="skeleton-shimmer h-80 border border-[#26262A] lg:col-span-5" />
          <div className="skeleton-shimmer h-80 border border-[#26262A] lg:col-span-7" />
        </div>
      )}

      {(meta.layout === "split" || meta.layout === "docs") && (
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="skeleton-shimmer h-72 border border-[#26262A] xl:col-span-7" />
          <div className="skeleton-shimmer h-72 border border-[#26262A] xl:col-span-5" />
        </div>
      )}
    </div>
  );
}
