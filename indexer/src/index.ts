import { createPublicClient, http } from "viem";
import {
  ROBINHOOD_MAINNET_ID,
  ROBINHOOD_TESTNET_ID,
  getChain,
  type SupportedChainId,
} from "@nti/sdk";

export interface IndexerConfig {
  chainId: SupportedChainId;
  rpcUrl: string;
  pollIntervalMs: number;
  batchBlocks: bigint;
  reorgBufferBlocks: bigint;
}

export function loadIndexerConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const rawChainId = Number(env.CHAIN_ID ?? ROBINHOOD_TESTNET_ID);
  const chainId: SupportedChainId =
    rawChainId === ROBINHOOD_MAINNET_ID ? ROBINHOOD_MAINNET_ID : ROBINHOOD_TESTNET_ID;

  const rpcUrl =
    chainId === ROBINHOOD_MAINNET_ID
      ? env.RPC_URL_MAINNET ?? getChain(chainId).rpcUrls.default.http[0]!
      : env.RPC_URL_TESTNET ?? getChain(chainId).rpcUrls.default.http[0]!;

  return {
    chainId,
    rpcUrl,
    pollIntervalMs: Number(env.INDEXER_POLL_MS ?? 5_000),
    batchBlocks: BigInt(env.INDEXER_BATCH_BLOCKS ?? 2_000),
    reorgBufferBlocks: BigInt(env.INDEXER_REORG_BUFFER ?? 50),
  };
}

export function createIndexerClient(cfg: IndexerConfig) {
  return createPublicClient({
    chain: getChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
}

async function main() {
  const cfg = loadIndexerConfig();
  const client = createIndexerClient(cfg);
  const blockNumber = await client.getBlockNumber();
  console.log(
    JSON.stringify({
      service: "nti-indexer",
      status: "ready",
      chainId: cfg.chainId,
      headBlock: blockNumber.toString(),
      safeBlock: (blockNumber > cfg.reorgBufferBlocks ? blockNumber - cfg.reorgBufferBlocks : 0n).toString(),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
