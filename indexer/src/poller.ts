import { decodeEventLog, type Address, type Hex } from "viem";
import { ALL_NTI_EVENTS_ABI } from "./abis.js";
import { projectChainEvent, requiresBlockTime } from "./replay.js";
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
  getBasketAddresses?(factory: Address, blockNumber?: bigint): Promise<readonly Address[]>;
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
  basketFactory?: Address;
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
  blockTimeIso?: string,
): { eventRow: ChainEventRow; mirrors: MirrorUpsert[] } | null {
  const eventRow = decodeEventRow(chainId, log);
  if (!eventRow) return null;
  if (blockTimeIso) eventRow.block_time = blockTimeIso;
  return { eventRow, mirrors: projectChainEvent(eventRow) };
}

function decodeEventRow(chainId: number, log: RawChainLog): ChainEventRow | null {
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
    }) as { eventName: string; args?: unknown };
  } catch {
    return null;
  }

  const rawArgs =
    decoded.args && typeof decoded.args === "object" && !Array.isArray(decoded.args)
      ? (decoded.args as Record<string, unknown>)
      : {};
  const serializedArgs = serializeArgs(rawArgs);

  return {
    chain_id: chainId,
    tx_hash: log.transactionHash,
    log_index: log.logIndex,
    block_number: log.blockNumber.toString(),
    contract_address: log.address,
    event_name: decoded.eventName,
    args: serializedArgs,
  };

}

export class IndexerPoller {
  private readonly client: LogFetcherClient;
  private readonly store: IndexerStore;
  private readonly chainId: number;
  private readonly addresses: Set<Address>;
  private readonly basketFactory: Address | undefined;
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
    this.addresses = new Set(config.addresses.map((address) => address.toLowerCase() as Address));
    if (this.addresses.size === 0) throw new Error("Indexer requires at least one contract address");
    this.basketFactory = config.basketFactory?.toLowerCase() as Address | undefined;
    this.startBlock = config.startBlock ?? 0n;
    this.batchBlocks = config.batchBlocks ?? DEFAULT_BATCH_BLOCKS;
    this.reorgBufferBlocks = config.reorgBufferBlocks ?? DEFAULT_REORG_BUFFER_BLOCKS;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (this.batchBlocks < 1n || this.reorgBufferBlocks < 0n || this.startBlock < 0n) {
      throw new Error("Invalid indexer block configuration");
    }
  }

  private safeHead(headBlock: bigint): bigint {
    return headBlock > this.reorgBufferBlocks ? headBlock - this.reorgBufferBlocks : 0n;
  }

  async pollOnce(): Promise<PollCycleResult> {
    const headBlock = await this.client.getBlockNumber();
    const safeHead = this.safeHead(headBlock);

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
      "poll",
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
   * Leaves the live checkpoint alone. Prefer backfill plus stored replay for historical gaps.
   */
  async replayRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<{ chunksProcessed: number; eventsIndexed: number; mirrorUpserts: number }> {
    await this.assertSafeRange(fromBlock, toBlock);
    return this.processRange(fromBlock, toBlock, "replay");
  }

  /** Archive a finalized range without applying its historical transitions to current projections. */
  async backfillRange(fromBlock: bigint, toBlock: bigint) {
    await this.assertSafeRange(fromBlock, toBlock);
    if (this.basketFactory && this.addresses.has(this.basketFactory) && this.client.getBasketAddresses) {
      const baskets = await this.client.getBasketAddresses(this.basketFactory, toBlock);
      for (const basket of baskets) this.addresses.add(basket.toLowerCase() as Address);
    }
    return this.processRange(fromBlock, toBlock, "archive");
  }

  private async assertSafeRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    if (fromBlock < 0n || toBlock < fromBlock) throw new Error("Invalid replay block range");
    const safeHead = this.safeHead(await this.client.getBlockNumber());
    if (toBlock > safeHead) throw new Error(`Replay block ${toBlock} exceeds safe head ${safeHead}`);
  }

  private async fetchEvents(addresses: Address[], fromBlock: bigint, toBlock: bigint): Promise<ChainEventRow[]> {
    const events: ChainEventRow[] = [];
    for (let i = 0; i < addresses.length; i += 8) {
      const logs = await this.client.getLogs({ address: addresses.slice(i, i + 8), fromBlock, toBlock });
      for (const log of logs) {
        const event = decodeEventRow(this.chainId, log);
        if (event) events.push(event);
      }
    }
    return events;
  }

  private async processRange(
    fromBlock: bigint,
    toBlock: bigint,
    mode: "poll" | "replay" | "archive",
  ): Promise<{ chunksProcessed: number; eventsIndexed: number; mirrorUpserts: number }> {
    let cursor = fromBlock;
    let chunksProcessed = 0;
    let eventsIndexed = 0;
    let mirrorUpserts = 0;

    while (cursor <= toBlock) {
      const chunkEnd =
        cursor + this.batchBlocks - 1n < toBlock ? cursor + this.batchBlocks - 1n : toBlock;

      const eventRows = await this.fetchEvents([...this.addresses], cursor, chunkEnd);
      const newBaskets = new Set<Address>();
      for (const event of eventRows) {
        if (event.event_name !== "BasketCreated") continue;
        if (this.basketFactory && event.contract_address.toLowerCase() !== this.basketFactory) continue;
        const basket = String(event.args.basket).toLowerCase() as Address;
        if (/^0x[0-9a-f]{40}$/.test(basket) && !this.addresses.has(basket)) newBaskets.add(basket);
      }
      // A vault can emit events in its creation block. Fetch it before advancing this chunk.
      eventRows.push(...await this.fetchEvents([...newBaskets], cursor, chunkEnd));
      eventRows.sort((a, b) => {
        const first = BigInt(a.block_number);
        const second = BigInt(b.block_number);
        return first === second ? a.log_index - b.log_index : first < second ? -1 : 1;
      });

      const blockTimes = new Map<bigint, string>();
      for (const event of eventRows) {
        if (!requiresBlockTime(event) || !this.client.getBlockTimestamp) continue;
        const block = BigInt(event.block_number);
        let time = blockTimes.get(block);
        if (time === undefined) {
          time = new Date(await this.client.getBlockTimestamp(block) * 1000).toISOString();
          blockTimes.set(block, time);
        }
        event.block_time = time;
      }

      await this.store.upsertChainEvents(eventRows);
      eventsIndexed += eventRows.length;
      if (mode !== "archive") {
        const mirrors = eventRows.flatMap(projectChainEvent);
        await this.store.upsertMirror(mirrors);
        mirrorUpserts += mirrors.length;
      }

      for (const basket of newBaskets) this.addresses.add(basket);
      if (mode === "poll") {
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
