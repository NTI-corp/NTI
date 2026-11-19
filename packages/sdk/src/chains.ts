import { defineChain, type Chain } from "viem";

export const ROBINHOOD_MAINNET_ID = 4663 as const;
export const ROBINHOOD_TESTNET_ID = 46630 as const;

export type SupportedChainId =
  | typeof ROBINHOOD_MAINNET_ID
  | typeof ROBINHOOD_TESTNET_ID;

export const robinhoodMainnet: Chain = defineChain({
  id: ROBINHOOD_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://robinhood-rpc.publicnode.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

export const robinhoodTestnet: Chain = defineChain({
  id: ROBINHOOD_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://robinhood-sepolia-rpc.publicnode.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
});

export function getChain(chainId: SupportedChainId): Chain {
  return chainId === ROBINHOOD_MAINNET_ID ? robinhoodMainnet : robinhoodTestnet;
}
