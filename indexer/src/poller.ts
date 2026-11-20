import { decodeEventLog, type Address, type Hex } from "viem";
import { ALL_NTI_EVENTS_ABI } from "./abis.js";
import { dispatchEventHandlers } from "./handlers/index.js";
import {
  serializeArgs,
  type ChainEventRow,
  type IndexerStore,
  type MirrorUpsert,
} from "./types.js";

export interface RawChainLog {
  address: Address;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
  data: Hex;
  topics: [Hex, ...Hex[]] | [];
}

export interface LogFetcherClient {
  getBlockNumber(): Promise<bigint>;
  /** Unix seconds of a block. Optional so minimal test doubles keep working. */
  getBlockTimestamp?(blockNumber: bigint): Promise<number>;
  getLogs(params: {
    address?: Address | Address[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<RawChainLog[]>;
}

export interface PollerConfig {
  chainId: number;
  addresses: Address[];
  startBlock?: bigint;
  batchBlocks?: bigint;
  reorgBufferBlocks?: bigint;
  pollIntervalMs?: number;
}

export interface PollCycleResult {
  headBlock: bigint;
  safeHead: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  chunksProcessed: number;
  eventsIndexed: number;
  mirrorUpserts: number;
}

export const DEFAULT_BATCH_BLOCKS = 2_000n;
export const DEFAULT_REORG_BUFFER_BLOCKS = 50n;
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function decodeNtiLog(
  chainId: number,
  log: RawChainLog,
  blockTimeIso: string = new Date().toISOString(),
): { eventRow: ChainEventRow; mirrors: MirrorUpsert[] } | null {
  if (
    log.blockNumber === null ||
    log.transactionHash === null ||
    log.logIndex === null ||
    log.topics.length === 0
  ) {
    return null;
  }

  let decoded: { eventName: string; args?: unknown };
  try {
    decoded = decodeEventLog({
      abi: ALL_NTI_EVENTS_ABI,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
      strict: false,
    }) as { eventName: string; args?: unknown };
  } catch {
    return null;
  }

  const rawArgs =
    decoded.args && typeof decoded.args === "object" && !Array.isArray(decoded.args)
      ? (decoded.args as Record<string, unknown>)
      : {};
  const serializedArgs = serializeArgs(rawArgs);

  const eventRow: ChainEventRow = {
    chain_id: chainId,
    tx_hash: log.transactionHash,
    log_index: log.logIndex,
    block_number: log.blockNumber.toString(),
    contract_address: log.address,
    event_name: decoded.eventName,
    args: serializedArgs,
  };

  const mirrors = dispatchEventHandlers({
    chainId,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    contractAddress: log.address,
    eventName: decoded.eventName,
    args: serializedArgs,
    blockTimeIso,
  });

  return { eventRow, mirrors };
}

export class IndexerPoller {
  private readonly client: LogFetcherClient;
  private readonly store: IndexerStore;
  private readonly chainId: number;
  private readonly addresses: Address[];
  private readonly startBlock: bigint;
  private readonly batchBlocks: bigint;
  private readonly reorgBufferBlocks: bigint;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(client: LogFetcherClient, store: IndexerStore, config: PollerConfig) {
    this.client = client;
    this.store = store;
    this.chainId = config.chainId;
    this.addresses = config.addresses;
    this.startBlock = config.startBlock ?? 0n;
    this.batchBlocks = config.batchBlocks ?? DEFAULT_BATCH_BLOCKS;
    this.reorgBufferBlocks = config.reorgBufferBlocks ?? DEFAULT_REORG_BUFFER_BLOCKS;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async pollOnce(): Promise<PollCycleResult> {
    const headBlock = await this.client.getBlockNumber();
    const safeHead =
      headBlock > this.reorgBufferBlocks ? headBlock - this.reorgBufferBlocks : 0n;

    const storedLast = await this.store.getLastBlock(this.chainId);
    const fromBlock = storedLast > 0n ? storedLast + 1n : this.startBlock;

    if (safeHead < fromBlock || safeHead === 0n) {
      return {
        headBlock,
        safeHead,
        fromBlock,
        toBlock: storedLast,
        chunksProcessed: 0,
        eventsIndexed: 0,
        mirrorUpserts: 0,
      };
    }

    const { chunksProcessed, eventsIndexed, mirrorUpserts } = await this.processRange(
      fromBlock,
      safeHead,
      true,
    );

    return {
      headBlock,
      safeHead,
      fromBlock,
      toBlock: safeHead,
      chunksProcessed,
      eventsIndexed,
      mirrorUpserts,
    };
  }

  /**
   * Replays an explicit inclusive block range idempotently.
   * Advances stored checkpoint only if `toBlock` exceeds current checkpoint.
   */
  async replayRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<{ chunksProcessed: number; eventsIndexed: number; mirrorUpserts: number }> {
    if (toBlock < fromBlock) {
      return { chunksProcessed: 0, eventsIndexed: 0, mirrorUpserts: 0 };
    }
    const storedLast = await this.store.getLastBlock(this.chainId);
    const res = await this.processRange(fromBlock, toBlock, false);
    if (toBlock > storedLast) {
      await this.store.setLastBlock(this.chainId, toBlock);
    }
    return res;
  }

  private async processRange(
    fromBlock: bigint,
    toBlock: bigint,
    persistEachChunk: boolean,
  ): Promise<{ chunksProcessed: number; eventsIndexed: number; mirrorUpserts: number }> {
    let cursor = fromBlock;
    let chunksProcessed = 0;
    let eventsIndexed = 0;
    let mirrorUpserts = 0;

    while (cursor <= toBlock) {
      const chunkEnd =
        cursor + this.batchBlocks - 1n < toBlock ? cursor + this.batchBlocks - 1n : toBlock;

      const rawLogs: RawChainLog[] = [];
      if (this.addresses.length <= 8) {
        const logs = await this.client.getLogs({
          address: this.addresses.length > 0 ? this.addresses : undefined,
          fromBlock: cursor,
          toBlock: chunkEnd,
        });
        rawLogs.push(...logs);
      } else {
        for (let i = 0; i < this.addresses.length; i += 8) {
          const slice = this.addresses.slice(i, i + 8);
          const logs = await this.client.getLogs({
            address: slice,
            fromBlock: cursor,
            toBlock: chunkEnd,
          });
          rawLogs.push(...logs);
        }
        rawLogs.sort((a, b) => {
          const ab = a.blockNumber ?? 0n;
          const bb = b.blockNumber ?? 0n;
          return ab !== bb ? (ab < bb ? -1 : 1) : (a.logIndex ?? 0) - (b.logIndex ?? 0);
        });
      }

      const eventRows: ChainEventRow[] = [];
      const mirrors: MirrorUpsert[] = [];

      const blockTimes = new Map<bigint, string>();
      if (this.client.getBlockTimestamp) {
        const distinct = new Set<bigint>();
        for (const log of rawLogs) if (log.blockNumber !== null) distinct.add(log.blockNumber);
        for (const bn of distinct) {
          try {
            blockTimes.set(bn, new Date((await this.client.getBlockTimestamp(bn)) * 1000).toISOString());
          } catch {
            // fall back to indexing time for this block
          }
        }
      }

      for (const log of rawLogs) {
        const parsed = decodeNtiLog(
          this.chainId,
          log,
          log.blockNumber !== null ? blockTimes.get(log.blockNumber) : undefined,
        );
        if (!parsed) continue;
        eventRows.push(parsed.eventRow);
        mirrors.push(...parsed.mirrors);
      }

      if (eventRows.length > 0) {
        await this.store.upsertChainEvents(eventRows);
        eventsIndexed += eventRows.length;
      }

      if (mirrors.length > 0) {
        await this.store.upsertMirror(mirrors);
        mirrorUpserts += mirrors.length;
      }

      if (persistEachChunk) {
        await this.store.setLastBlock(this.chainId, chunkEnd);
      }

      chunksProcessed += 1;
      cursor = chunkEnd + 1n;
    }

    return { chunksProcessed, eventsIndexed, mirrorUpserts };
  }

  start(onCycle?: (res: PollCycleResult) => void, onError?: (err: unknown) => void): void {
    if (this.running) return;
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      try {
        const res = await this.pollOnce();
        onCycle?.(res);
      } catch (err) {
        onError?.(err);
      } finally {
        if (this.running) {
          this.timer = setTimeout(tick, this.pollIntervalMs);
        }
      }
    };

    void tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
