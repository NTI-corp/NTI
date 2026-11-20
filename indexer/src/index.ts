import { createPublicClient, http, type Address } from "viem";
import {
  PROTOCOL_ADDRESSES,
  ROBINHOOD_MAINNET_ID,
  ROBINHOOD_TESTNET_ID,
  getChain,
  type SupportedChainId,
} from "@nti/sdk";
import {
  DEFAULT_BATCH_BLOCKS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REORG_BUFFER_BLOCKS,
  IndexerPoller,
  type LogFetcherClient,
} from "./poller.js";
import { InMemoryStore, SupabaseRestStore } from "./store.js";
import type { IndexerStore } from "./types.js";

export * from "./abis.js";
export * from "./types.js";
export * from "./store.js";
export * from "./poller.js";
export * from "./handlers/index.js";

export interface IndexerConfig {
  chainId: SupportedChainId;
  rpcUrl: string;
  pollIntervalMs: number;
  batchBlocks: bigint;
  reorgBufferBlocks: bigint;
  startBlock: bigint;
  addresses: Address[];
  supabaseUrl: string | null;
  supabaseServiceKey: string | null;
}

export function resolveProtocolAddresses(chainId: SupportedChainId): Address[] {
  const addrs = PROTOCOL_ADDRESSES[chainId];
  return Object.values(addrs).filter((v): v is Address => v !== null);
}

export function loadIndexerConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const rawChainId = Number(env.CHAIN_ID ?? ROBINHOOD_TESTNET_ID);
  const chainId: SupportedChainId =
    rawChainId === ROBINHOOD_MAINNET_ID ? ROBINHOOD_MAINNET_ID : ROBINHOOD_TESTNET_ID;

  const rpcUrl =
    env.INDEXER_RPC_URL ||
    (chainId === ROBINHOOD_MAINNET_ID
      ? env.RPC_URL_MAINNET ?? getChain(chainId).rpcUrls.default.http[0]!
      : env.RPC_URL_TESTNET ?? getChain(chainId).rpcUrls.default.http[0]!);

  const envAddresses = (env.INDEXER_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Address => /^0x[0-9a-fA-F]{40}$/.test(s));

  return {
    chainId,
    rpcUrl,
    pollIntervalMs: Number(env.INDEXER_POLL_MS ?? DEFAULT_POLL_INTERVAL_MS),
    batchBlocks: BigInt(env.INDEXER_BATCH_BLOCKS ?? DEFAULT_BATCH_BLOCKS),
    reorgBufferBlocks: BigInt(env.INDEXER_REORG_BUFFER ?? DEFAULT_REORG_BUFFER_BLOCKS),
    startBlock: BigInt(env.INDEXER_START_BLOCK ?? 0),
    addresses: envAddresses.length > 0 ? envAddresses : resolveProtocolAddresses(chainId),
    supabaseUrl: env.SUPABASE_URL ?? null,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY ?? null,
  };
}

export function createIndexerClient(cfg: IndexerConfig): LogFetcherClient {
  const client = createPublicClient({
    chain: getChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });

  return {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: async ({ address, fromBlock, toBlock }) => {
      const logs = await client.getLogs({
        address,
        fromBlock,
        toBlock,
      });
      return logs.map((l) => ({
        address: l.address,
        blockNumber: l.blockNumber,
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
        data: l.data,
        topics: l.topics as [`0x${string}`, ...`0x${string}`[]] | [],
      }));
    },
  };
}

export function createIndexerStore(cfg: IndexerConfig): IndexerStore {
  if (cfg.supabaseUrl && cfg.supabaseServiceKey) {
    return new SupabaseRestStore({
      supabaseUrl: cfg.supabaseUrl,
      serviceKey: cfg.supabaseServiceKey,
    });
  }
  return new InMemoryStore();
}

const BASKET_FACTORY_ABI = [
  {
    type: "function",
    name: "allBaskets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
] as const;

/**
 * Basket vaults are deployed by BasketFactory, so their addresses are not in PROTOCOL_ADDRESSES.
 * Without them Deposited/Redeemed/Rebalanced events would never be indexed.
 * Mutates cfg.addresses in place (the poller holds the same array reference).
 */
export async function discoverBasketAddresses(cfg: IndexerConfig): Promise<number> {
  const factory = PROTOCOL_ADDRESSES[cfg.chainId].basketFactory;
  if (!factory) return 0;
  const client = createPublicClient({ chain: getChain(cfg.chainId), transport: http(cfg.rpcUrl) });
  const baskets = await client.readContract({
    address: factory,
    abi: BASKET_FACTORY_ABI,
    functionName: "allBaskets",
  });
  let added = 0;
  for (const b of baskets) {
    if (!cfg.addresses.some((a) => a.toLowerCase() === b.toLowerCase())) {
      cfg.addresses.push(b);
      added++;
    }
  }
  return added;
}

async function main() {
  const cfg = loadIndexerConfig();
  const client = createIndexerClient(cfg);
  const store = createIndexerStore(cfg);
  const once = process.argv.includes("--once");

  try {
    const added = await discoverBasketAddresses(cfg);
    if (added > 0) console.log(`[nti-indexer] discovered ${added} basket vault(s)`);
  } catch (err) {
    console.error("[nti-indexer] basket discovery failed:", err);
  }
  if (!once) {
    const timer = setInterval(() => {
      discoverBasketAddresses(cfg).catch(() => undefined);
    }, 5 * 60_000);
    timer.unref();
  }

  const poller = new IndexerPoller(client, store, {
    chainId: cfg.chainId,
    addresses: cfg.addresses,
    startBlock: cfg.startBlock,
    batchBlocks: cfg.batchBlocks,
    reorgBufferBlocks: cfg.reorgBufferBlocks,
    pollIntervalMs: cfg.pollIntervalMs,
  });

  if (once) {
    const res = await poller.pollOnce();
    console.log(
      JSON.stringify({
        service: "nti-indexer",
        mode: "once",
        chainId: cfg.chainId,
        headBlock: res.headBlock.toString(),
        safeHead: res.safeHead.toString(),
        chunksProcessed: res.chunksProcessed,
        eventsIndexed: res.eventsIndexed,
      }),
    );
    return;
  }

  const shutdown = () => {
    poller.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  poller.start(
    (res) => {
      console.log(
        JSON.stringify({
          service: "nti-indexer",
          chainId: cfg.chainId,
          headBlock: res.headBlock.toString(),
          safeHead: res.safeHead.toString(),
          chunksProcessed: res.chunksProcessed,
          eventsIndexed: res.eventsIndexed,
          mirrorUpserts: res.mirrorUpserts,
        }),
      );
    },
    (err) => {
      console.error("[nti-indexer] poll error:", err);
    },
  );
}

const isEntrypoint =
  process.argv[1] &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/").replace(/^\/+/, "")}`;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
