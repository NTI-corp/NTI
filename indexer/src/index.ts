import { BaseError, ContractFunctionZeroDataError, createPublicClient, http, type Address } from "viem";
import { pathToFileURL } from "node:url";
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
import { replayStoredEvents } from "./replay.js";
import type { IndexerStore } from "./types.js";

export * from "./abis.js";
export * from "./types.js";
export * from "./store.js";
export * from "./poller.js";
export * from "./replay.js";
export * from "./handlers/index.js";

export interface IndexerConfig {
  chainId: SupportedChainId;
  rpcUrl: string;
  pollIntervalMs: number;
  batchBlocks: bigint;
  reorgBufferBlocks: bigint;
  startBlock: bigint;
  addresses: Address[];
  addressOverride: boolean;
  supabaseUrl: string | null;
  supabaseServiceKey: string | null;
}

export function resolveProtocolAddresses(chainId: SupportedChainId): Address[] {
  const addrs = PROTOCOL_ADDRESSES[chainId];
  return Object.values(addrs).filter((v): v is Address => v !== null);
}

export function loadIndexerConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const rawChainId = env.CHAIN_ID ?? String(ROBINHOOD_TESTNET_ID);
  if (rawChainId !== String(ROBINHOOD_TESTNET_ID) && rawChainId !== String(ROBINHOOD_MAINNET_ID)) {
    throw new Error("CHAIN_ID must select a supported Robinhood chain");
  }
  const chainId = Number(rawChainId) as SupportedChainId;

  const rpcUrl =
    env.INDEXER_RPC_URL ||
    (chainId === ROBINHOOD_MAINNET_ID
      ? env.RPC_URL_MAINNET ?? getChain(chainId).rpcUrls.default.http[0]!
      : env.RPC_URL_TESTNET ?? getChain(chainId).rpcUrls.default.http[0]!);

  const envAddresses = env.INDEXER_ADDRESSES?.split(",").map((s) => s.trim());
  if (envAddresses?.some((address) => !/^0x[0-9a-fA-F]{40}$/.test(address))) {
    throw new Error("INDEXER_ADDRESSES must be a comma-separated list of valid addresses");
  }

  return {
    chainId,
    rpcUrl,
    pollIntervalMs: Number(env.INDEXER_POLL_MS ?? DEFAULT_POLL_INTERVAL_MS),
    batchBlocks: BigInt(env.INDEXER_BATCH_BLOCKS ?? DEFAULT_BATCH_BLOCKS),
    reorgBufferBlocks: BigInt(env.INDEXER_REORG_BUFFER ?? DEFAULT_REORG_BUFFER_BLOCKS),
    startBlock: BigInt(env.INDEXER_START_BLOCK ?? 0),
    addresses: envAddresses as Address[] | undefined ?? resolveProtocolAddresses(chainId),
    addressOverride: envAddresses !== undefined,
    supabaseUrl: env.SUPABASE_URL ?? null,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY ?? null,
  };
}

export function createIndexerClient(cfg: IndexerConfig): LogFetcherClient & { getChainId(): Promise<number> } {
  const client = createPublicClient({
    chain: getChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });

  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    getBlockTimestamp: async (blockNumber) =>
      Number((await client.getBlock({ blockNumber })).timestamp),
    getBasketAddresses: async (address, blockNumber) => {
      try {
        return await client.readContract({ address, blockNumber, abi: BASKET_FACTORY_ABI, functionName: "allBaskets" });
      } catch (error) {
        // A historical range can end before this factory was deployed.
        if (blockNumber !== undefined && error instanceof BaseError &&
          error.walk((cause) => cause instanceof ContractFunctionZeroDataError)) return [];
        throw error;
      }
    },
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
 * Seed the poller before it starts. It discovers newly created vaults as it indexes factory logs.
 */
export async function discoverBasketAddresses(cfg: IndexerConfig, client = createIndexerClient(cfg)): Promise<number> {
  const factory = PROTOCOL_ADDRESSES[cfg.chainId].basketFactory;
  if (!factory || !cfg.addresses.some((a) => a.toLowerCase() === factory.toLowerCase())) return 0;
  const baskets = await client.getBasketAddresses?.(factory) ?? [];
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
  const [mode, from, to, ...extra] = process.argv.slice(2);
  const backfill = mode === "--backfill";
  if (backfill) {
    if (!from || !to || !/^\d+$/.test(from) || !/^\d+$/.test(to) || extra.length > 0 || BigInt(to) < BigInt(from)) {
      throw new Error("Usage: node dist/index.js --backfill FROM_BLOCK TO_BLOCK");
    }
  } else {
    if ((mode !== "--once" && mode !== "--replay-stored" && mode !== undefined) || from !== undefined) {
      throw new Error("Expected --once, --replay-stored, or --backfill FROM_BLOCK TO_BLOCK");
    }
    if (cfg.addressOverride) {
      throw new Error("INDEXER_ADDRESSES is only supported for bounded backfill with no checkpoint changes");
    }
  }
  const client = createIndexerClient(cfg);
  const rpcChainId = await client.getChainId();
  if (rpcChainId !== cfg.chainId) throw new Error(`RPC chain ID ${rpcChainId} does not match configured chain ID ${cfg.chainId}`);
  const store = createIndexerStore(cfg);
  if (mode === "--replay-stored") {
    if (!(store instanceof SupabaseRestStore)) throw new Error("Stored replay requires Supabase credentials");
    const result = await replayStoredEvents(store, {
      chainId: cfg.chainId,
      activeContracts: PROTOCOL_ADDRESSES[cfg.chainId],
      getBlockTimestamp: client.getBlockTimestamp,
    });
    console.log(JSON.stringify({ service: "nti-indexer", mode, chainId: cfg.chainId, ...result }));
    return;
  }

  if (!backfill) {
    const added = await discoverBasketAddresses(cfg, client);
    if (added > 0) console.log(`[nti-indexer] discovered ${added} basket vault(s)`);
  }

  const poller = new IndexerPoller(client, store, {
    chainId: cfg.chainId,
    addresses: cfg.addresses,
    basketFactory: PROTOCOL_ADDRESSES[cfg.chainId].basketFactory ?? undefined,
    startBlock: cfg.startBlock,
    batchBlocks: cfg.batchBlocks,
    reorgBufferBlocks: cfg.reorgBufferBlocks,
    pollIntervalMs: cfg.pollIntervalMs,
  });

  if (backfill && from && to) {
    if (!(store instanceof SupabaseRestStore)) throw new Error("Backfill requires Supabase credentials");
    const result = await poller.backfillRange(BigInt(from), BigInt(to));
    console.log(JSON.stringify({ service: "nti-indexer", mode, chainId: cfg.chainId, from, to, ...result }));
    return;
  }

  if (mode === "--once") {
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
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
