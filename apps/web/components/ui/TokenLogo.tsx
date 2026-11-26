"use client";

import React, { useState } from "react";

const LOCAL_TOKEN_ICONS: Record<string, string> = {
  NVDA: "/assets/tokens/nvda.svg",
  AAPL: "/assets/tokens/aapl.svg",
  TSLA: "/assets/tokens/tsla.svg",
  META: "/assets/tokens/meta.svg",
  GOOGL: "/assets/tokens/googl.svg",
  GOOG: "/assets/tokens/googl.svg",
  COIN: "/assets/tokens/coin.svg",
  SPY: "/assets/tokens/spy.svg",
  SPCX: "/assets/tokens/spcx.svg",
  PEPE: "/assets/tokens/pepe.webp",
  MEME: "/assets/tokens/meme.webp",
  PONS: "/assets/tokens/pons.webp",
  WETH: "/assets/tokens/weth.webp",
  ETH: "/assets/tokens/weth.webp",
  NTI: "/nti-logo.png",
  PNTI: "/nti-logo.png",
  TNTI: "/nti-logo.png",
};

const SVG_PADDED = new Set([
  "NVDA",
  "AAPL",
  "TSLA",
  "META",
  "GOOGL",
  "GOOG",
  "COIN",
  "SPY",
  "SPCX",
  "NTI",
  "PNTI",
  "TNTI",
]);

export function TokenLogo({
  symbol,
  imageUrl,
  size = 24,
  className = "",
}: {
  symbol: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const key = symbol.replace(/^\$/, "").toUpperCase();
  const src = LOCAL_TOKEN_ICONS[key] ?? imageUrl ?? null;
  const padded = SVG_PADDED.has(key);

  if (!src || failed) {
    return (
      <span
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center border border-[#26262A] bg-[#111113] font-mono text-[9px] font-semibold uppercase text-[#A1A1AA] ${className}`}
        aria-hidden="true"
      >
        {key.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#26262A] bg-[#0D0D0E] ${
        padded ? "p-[3px]" : ""
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={key}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`h-full w-full ${padded ? "object-contain" : "object-cover"}`}
      />
    </span>
  );
}

export function UniswapMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/assets/tokens/uniswap.svg"
      alt="Uniswap"
      className={`inline-block shrink-0 object-contain ${className}`}
    />
  );
}

export function IpfsMark({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/assets/tokens/ipfs.svg"
      alt="IPFS"
      className={`inline-block shrink-0 object-contain ${className}`}
    />
  );
}
