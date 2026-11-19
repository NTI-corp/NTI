"use client";

import { useReadContract } from "wagmi";
import { getActiveChainId, getProtocolAddresses, ntiRegistryAbi } from "@/lib/contracts";
import { ROBINHOOD_MAINNET_ID } from "@nti/sdk";

export function TestnetBanner() {
  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);

  const { data: frozen } = useReadContract({
    address: addresses.registry ?? undefined,
    abi: ntiRegistryAbi,
    functionName: "frozen",
    query: {
      enabled: Boolean(addresses.registry),
      staleTime: 60_000,
    },
  });

  // Only hide once registry.frozen === true on mainnet.
  if (frozen === true) return null;

  const isMainnet = chainId === ROBINHOOD_MAINNET_ID;

  return (
    <div
      role="status"
      className="border-b border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-1.5 text-[11px] font-mono text-[#F59E0B]"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
          <span className="font-semibold tracking-wider">
            {isMainnet ? "PRE-FREEZE REGISTRY MODE" : "TESTNET MODE · NTITestToken ACTIVE"}
          </span>
          <span className="text-[#F59E0B]/80">
            Registry not yet frozen (`registry.frozen == false`). Staking, markets &amp; disputes use test tokens until live $NTI CA is locked.
          </span>
        </div>
        <span className="text-[#F59E0B]/90 tabular-nums">
          CHAIN ID {chainId}
        </span>
      </div>
    </div>
  );
}
