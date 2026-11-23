import { isAddressEqual, isAddress, maxUint256, zeroHash, type Address, type Hex } from "viem";

export function parseKolAttestation(input: string, connectedWallet: Address, now: number) {
  const proof: unknown = JSON.parse(input);
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    throw new Error("Paste the operator's signed attestation JSON.");
  }
  const { wallet, handleHash, deadline, signature } = proof as Record<string, unknown>;
  if (typeof wallet !== "string" || !isAddress(wallet, { strict: false }) || !isAddressEqual(wallet, connectedWallet)) {
    throw new Error("The attestation wallet must match the connected wallet.");
  }
  if (typeof handleHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(handleHash) || handleHash === zeroHash ||
      typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("The attestation must include a 32-byte handle hash and 65-byte signature.");
  }
  const seconds = typeof deadline === "number" && Number.isSafeInteger(deadline) ? String(deadline) : deadline;
  if (typeof seconds !== "string" || !/^\d{1,78}$/.test(seconds) ||
      BigInt(seconds) > maxUint256 || BigInt(seconds) < BigInt(Math.floor(now / 1000))) {
    throw new Error("The signed attestation deadline has expired or is invalid.");
  }

  return [connectedWallet, handleHash as Hex, BigInt(seconds), signature as Hex] as const;
}
