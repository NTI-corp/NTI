import { parseAbi } from "viem";

/**
 * Generated ABI exports populated as contracts C1-C8 are built (automated in C9).
 */
export const ntiRegistryAbi = parseAbi([
  "function nti() view returns (address)",
  "function weth() view returns (address)",
  "function burnAddress() view returns (address)",
  "function buybackAdapter() view returns (address)",
  "function staking() view returns (address)",
  "function frozen() view returns (bool)",
  "function buybackReady() view returns (bool)",
]);
