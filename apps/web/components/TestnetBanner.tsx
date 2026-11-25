"use client";

import { FlaskConical } from "lucide-react";
import { useReadContract } from "wagmi";
import { getActiveChainId, getProtocolAddresses, ntiRegistryAbi } from "@/lib/contracts";
import { ROBINHOOD_MAINNET_ID } from "@nti/sdk";

/** Slim notice while the registry still points at the test token. Hidden once `registry.frozen`. */
export function TestnetBanner() {
  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);

  const { data: frozen } = useReadContract({
    address: addresses.registry ?? undefined,
    abi: ntiRegistryAbi,
    functionName: "frozen",
    query: { enabled: Boolean(addresses.registry), staleTime: 60_000 },
  });

  if (frozen === true) return null;

  const isMainnet = chainId === ROBINHOOD_MAINNET_ID;

  return (
    <div role="status" className="border-b border-[#26262A] bg-[#0D0D0E]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.08em] sm:px-7">
        <span className="inline-flex items-center gap-2 text-[#E2A856]">
          <FlaskConical className="h-3 w-3" aria-hidden="true" />
          {isMainnet ? "Pre-freeze registry" : "Testnet · test token"}
          <span className="hidden text-[#71717A] normal-case tracking-normal sm:inline">
            {isMainnet
              ? "Staking, markets and disputes open once the $NTI contract is attached and the registry is frozen."
              : "Staking, markets and disputes use tNTI until the live $NTI address is locked."}
          </span>
        </span>
        <span className="text-[#71717A] tabular-nums">Chain {chainId}</span>
      </div>
    </div>
  );
}
