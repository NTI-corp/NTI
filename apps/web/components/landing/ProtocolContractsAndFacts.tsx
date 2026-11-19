"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { truncateHex } from "@/lib/format";

export interface ContractEntry {
  name: string;
  role: string;
  address: `0x${string}`;
}

const GUARANTEES = [
  {
    code: "CAP",
    kicker: "Sybil Guard",
    title: "10% max KOL dominance per epoch",
    text: "No influencer or automated farm can skew an entire sector vector. Iterative truncation caps any individual account at 10.00% of total weighted engagement.",
  },
  {
    code: "SUM",
    kicker: "Precision Law",
    title: "Decimal(40) + Hamilton 10,000 bps",
    text: "All intermediate normalization runs at 40 decimal places of precision before rounding with Hamilton largest-remainder so Σ I_n equals exactly 10,000 bps.",
  },
  {
    code: "2HR",
    kicker: "Optimistic Guard",
    title: "Permissionless Omission & Math Disputes",
    text: "Every epoch commit opens a strict 2-hour challenge window on Robinhood Chain. Any watcher with a SHA-256 dataset counterproof can slash & veto bad commits.",
  },
  {
    code: "30%",
    kicker: "Fee Alignment",
    title: "Native ETH fee sharing + RT Radar edge",
    text: "Stakers holding 100k+ $NTI earn 30% of protocol ETH fees, save up to 50% on market fees, and see Radar signals 60 minutes before public disclosure.",
  },
] as const;

export function ProtocolContractsAndFacts({
  contracts,
  explorerBase,
  chainId,
  epochId,
}: {
  contracts: ContractEntry[];
  explorerBase: string;
  chainId: number;
  epochId: number | null;
}) {
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const handleCopy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddr(addr);
      setTimeout(() => setCopiedAddr((c) => (c === addr ? null : c)), 1500);
    } catch {
      // ignore clipboard error
    }
  };

  const snapshotFacts = [
    { dt: "Settlement Network", dd: `Robinhood Chain Testnet · Chain ID ${chainId}` },
    { dt: "Epoch Cadence", dd: "4-hour deterministic ingestion & commit cycles" },
    { dt: "Tracked Universe", dd: "10 crypto narrative sectors · 25+ curated KOLs" },
    { dt: "Math Precision", dd: "Decimal(40) intermediate · Hamilton 10,000 bps sum" },
    { dt: "Normalization", dd: "48h half-life decay · 10% single-KOL cap · α = 0.3 EMA" },
    { dt: "Classifier", dd: "Gemini Flash-Lite (temp = 0) multi-label relevance q ∈ [0,1]" },
    { dt: "Oracle Consensus", dd: "≥ 3 validators · ≥ 95% KOL overlap · EIP-712 digests" },
    { dt: "Challenge Safety", dd: "2-hour permissionless Dispute window before finalize()" },
    { dt: "Radar Tiers", dd: "0s staker access (100k $NTI) · 60-minute public feed" },
    { dt: "Fee Discounts", dd: "10% (100k) · 25% (1M) · 50% max discount (5M $NTI)" },
    { dt: "Market Primitives", dd: "24h & 7d parimutuel pairs · Uniswap V3 30m TWAP baskets" },
    { dt: "Live State", dd: epochId ? `Latest committed epoch #${epochId} on-chain` : "Awaiting first epoch" },
  ];

  return (
    <div className="space-y-12">
      {/* On-Chain Guarantees List (QTimeline Transparency Pattern) */}
      <div>
        <div className="mb-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
            DETERMINISTIC ENFORCEMENT
          </div>
          <h3 className="mt-1 font-display text-2xl font-bold text-[#F3F5F8] sm:text-3xl">
            Verified Guarantees Across Math &amp; Solidity
          </h3>
        </div>
        <ul className="divide-y divide-[#1B202C] border border-[#1B202C] bg-[#0B0D12]">
          {GUARANTEES.map((g) => (
            <li
              key={g.code}
              className="grid gap-4 p-5 sm:grid-cols-12 sm:items-center sm:p-6"
            >
              <div className="sm:col-span-2">
                <span className="inline-block border border-[#B8FF2E]/40 bg-[#B8FF2E]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#B8FF2E]">
                  {g.code}
                </span>
              </div>
              <div className="sm:col-span-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#5A6478]">
                  {g.kicker}
                </div>
                <div className="mt-0.5 font-display text-base font-bold text-[#F3F5F8]">
                  {g.title}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-[#8B94A7] sm:col-span-6 sm:text-sm">
                {g.text}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Deployed Contract Ledger with Copy & Explorer Links */}
      <div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#B8FF2E]">
              DEPLOYED CONTRACTS · CHAIN {chainId}
            </div>
            <h3 className="mt-1 font-display text-2xl font-bold text-[#F3F5F8] sm:text-3xl">
              Auditable On-Chain Architecture
            </h3>
          </div>
          <span className="font-mono text-[11px] text-[#5A6478]">
            {contracts.length} CANONICAL CONTRACTS ACTIVE
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contracts.map((c) => {
            const isCopied = copiedAddr === c.address;
            return (
              <div
                key={c.name}
                data-spot
                className="panel-surface flex flex-col justify-between p-4"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-[#B8FF2E]">{c.name}</span>
                    <span className="text-[#23F7DD]">VERIFIED</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B94A7]">{c.role}</p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#1B202C] pt-3 font-mono text-[11px]">
                  <span className="truncate tabular-nums text-[#F3F5F8]">
                    {truncateHex(c.address, 8, 6)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopy(c.address)}
                      aria-label={`Copy ${c.name} address`}
                      className="inline-flex cursor-pointer items-center gap-1 border border-[#1B202C] bg-[#06070A] px-2 py-1 text-[10px] text-[#8B94A7] hover:border-[#B8FF2E]/50 hover:text-[#B8FF2E]"
                    >
                      {isCopied ? <Check className="h-3 w-3 text-[#B8FF2E]" /> : <Copy className="h-3 w-3" />}
                      <span>{isCopied ? "COPIED" : "COPY"}</span>
                    </button>
                    <a
                      href={`${explorerBase}/address/${c.address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`View ${c.name} on explorer`}
                      className="inline-flex items-center border border-[#1B202C] bg-[#06070A] p-1 text-[#8B94A7] hover:border-[#23F7DD]/60 hover:text-[#23F7DD]"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 12-Tile Protocol Snapshot Grid (BELL FactsSection Pattern) */}
      <div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#23F7DD]">
              PROTOCOL SNAPSHOT
            </div>
            <h3 className="mt-1 font-display text-2xl font-bold text-[#F3F5F8] sm:text-3xl">
              Live Specification Reference
            </h3>
          </div>
          <span className="font-mono text-[11px] text-[#8B94A7]">
            ALL PARAMETERS READ FROM SDK &amp; CHAIN {chainId}
          </span>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {snapshotFacts.map((fact) => (
            <div
              key={fact.dt}
              data-spot
              className="panel-surface border-[#1B202C] p-4"
            >
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5A6478]">
                {fact.dt}
              </dt>
              <dd className="mt-1.5 text-xs font-medium leading-relaxed text-[#F3F5F8]">
                {fact.dd}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
