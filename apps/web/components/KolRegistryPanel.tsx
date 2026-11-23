"use client";

import { useState } from "react";
import { zeroHash } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { getActiveChainId, getProtocolAddresses, kolRegistryAbi, ROBINHOOD_TESTNET_ID } from "@/lib/contracts";
import { parseKolAttestation } from "@/lib/kolAttestation";
import { useChainAction } from "@/lib/useChainAction";
import { TxStatusBanner } from "./TxStatusBanner";

const BUTTON = "border border-[#26262A] bg-[#111113] px-3 py-1.5 font-mono text-[11px] text-[#F5F5F7] hover:border-[#CCFF00] disabled:cursor-not-allowed disabled:opacity-45";

export function KolRegistryPanel() {
  const chainId = getActiveChainId();
  const registry = getProtocolAddresses(chainId).kolRegistry;
  const { address, isConnected } = useAccount();
  const [proof, setProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: handle, refetch } = useReadContract({
    address: registry ?? undefined,
    abi: kolRegistryAbi,
    functionName: "handleOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(registry && address) },
  });
  const { execute, isBusy, txState, explorerBase, resetTx } = useChainAction(async () => { await refetch(); });

  if (!registry) return null;

  async function register() {
    if (!registry || !address) return;
    setError(null);
    try {
      const args = parseKolAttestation(proof, address, Date.now());
      const receipt = await execute("Register X handle hash", {
        address: registry, abi: kolRegistryAbi, functionName: "register", args,
      });
      if (receipt) setProof("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter a valid signed attestation.");
    }
  }

  async function unregister() {
    if (!registry) return;
    setError(null);
    await execute("Unregister X handle", { address: registry, abi: kolRegistryAbi, functionName: "unregister" });
  }

  return (
    <section className="space-y-3 border border-[#26262A] bg-[#161618] p-4">
      <h2 className="text-sm font-semibold text-[#F5F5F7]">KOL Wallet Registry</h2>
      <p className="text-xs text-[#A1A1AA]">
        Request a signed attestation from the registry operator after verifying ownership of your X handle.
        {chainId === ROBINHOOD_TESTNET_ID && " Use an attestation issued for Robinhood Testnet."}
      </p>
      {!isConnected ? (
        <p className="text-xs text-[#A1A1AA]">Connect a wallet to check or update your registration.</p>
      ) : (
        <>
          <p role="status" className="break-all font-mono text-[11px] text-[#A1A1AA]">
            {handle === undefined ? "Registration status unavailable." :
              handle === zeroHash ? "No handle registered for this wallet." : `Registered handle hash ${handle}`}
          </p>
          <label className="block text-xs text-[#A1A1AA]">
            Signed attestation JSON
            <textarea value={proof} onChange={(event) => setProof(event.target.value)} rows={3}
              placeholder="wallet, handleHash, deadline, signature"
              className="mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 font-mono text-xs text-[#F5F5F7]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} type="button" disabled={isBusy || !proof.trim()} onClick={() => void register()}>REGISTER HANDLE</button>
            {handle && handle !== zeroHash && (
              <button className={BUTTON} type="button" disabled={isBusy} onClick={() => void unregister()}>UNREGISTER HANDLE</button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-[#EF4444]">{error}</p>}
      <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
    </section>
  );
}
