import type { ProtocolAddresses } from "@nti/sdk";
import { dispatchEventHandlers } from "./handlers/index.js";
import type { ChainEventRow, MirrorUpsert, ReplayStore } from "./types.js";

const TIMESTAMPED_EVENTS = new Set([
  "EpochCommitted", "EpochFinalized", "EpochDisputeResolved", "ValidatorJoined",
  "DisputeOpened", "DisputeResolved", "DisputeExpired",
]);

export function requiresBlockTime(event: ChainEventRow): boolean {
  return TIMESTAMPED_EVENTS.has(event.event_name);
}

export function projectChainEvent(event: ChainEventRow): MirrorUpsert[] {
  return dispatchEventHandlers({
    chainId: event.chain_id,
    blockNumber: BigInt(event.block_number),
    txHash: event.tx_hash,
    logIndex: event.log_index,
    contractAddress: event.contract_address,
    eventName: event.event_name,
    args: event.args,
    blockTimeIso: event.block_time ?? undefined,
  });
}

const ACTIVE_MIRROR_TABLES = {
  markets: "narrativeMarket",
  market_bets: "narrativeMarket",
  market_claims: "narrativeMarket",
  grant_rounds: "grants",
  grant_proposals: "grants",
  grant_votes: "grants",
  grant_claims: "grants",
  disputes: "dispute",
  registry_state: "registry",
  staking_tiers: "staking",
} as const satisfies Record<string, keyof ProtocolAddresses>;

export interface StoredReplayOptions {
  chainId: number;
  pageSize?: number;
  activeContracts?: Partial<ProtocolAddresses>;
  getBlockTimestamp?(blockNumber: bigint): Promise<number>;
}

/** Rebuild projections in canonical log order. Run with the live poller stopped. */
export async function replayStoredEvents(store: ReplayStore, options: StoredReplayOptions) {
  const { chainId, pageSize = 200, activeContracts, getBlockTimestamp } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("Stored replay page size must be an integer between 1 and 1000");
  }
  let after: ChainEventRow | undefined;
  let lastTimedBlock: string | undefined;
  let lastBlockTime: string | undefined;
  let eventsRead = 0;
  let mirrorUpserts = 0;
  let skippedLegacySnapshots = 0;

  for (;;) {
    const events = await store.readChainEvents(chainId, after, pageSize);
    if (events.length === 0) break;
    const enriched: ChainEventRow[] = [];
    const mirrors: MirrorUpsert[] = [];
    for (const event of events) {
      if (event.block_time) {
        lastTimedBlock = event.block_number;
        lastBlockTime = event.block_time;
      } else if (requiresBlockTime(event)) {
        if (lastTimedBlock !== event.block_number && getBlockTimestamp) {
          try {
            lastBlockTime = new Date(await getBlockTimestamp(BigInt(event.block_number)) * 1000).toISOString();
            lastTimedBlock = event.block_number;
          } catch (cause) {
            throw new Error(`Stored replay could not resolve block time for ${event.block_number}`, { cause });
          }
        }
        if (lastTimedBlock === event.block_number && lastBlockTime) {
          event.block_time = lastBlockTime;
          enriched.push(event);
        }
      }
      for (const mirror of projectChainEvent(event)) {
        const key = ACTIVE_MIRROR_TABLES[mirror.table as keyof typeof ACTIVE_MIRROR_TABLES];
        const source = key && activeContracts?.[key];
        // Numeric IDs and singleton states in these tables are reused across deployments.
        if (source && source.toLowerCase() !== event.contract_address.toLowerCase()) {
          skippedLegacySnapshots += 1;
          continue;
        }
        mirrors.push(mirror);
      }
    }
    await store.upsertChainEvents(enriched);
    await store.upsertMirror(mirrors);
    after = events.at(-1);
    eventsRead += events.length;
    mirrorUpserts += mirrors.length;
  }

  return { eventsRead, mirrorUpserts, skippedLegacySnapshots };
}
