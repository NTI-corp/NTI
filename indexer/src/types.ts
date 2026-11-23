import type { Address, Hex } from "viem";

export type ContractDomain =
  | "oracle"
  | "staking"
  | "market"
  | "basket"
  | "grants"
  | "governance";

export interface ChainEventRow {
  chain_id: number;
  tx_hash: Hex;
  log_index: number;
  block_number: string;
  contract_address: Address;
  event_name: string;
  args: Record<string, unknown>;
  block_time?: string | null;
}

export interface MirrorUpsert {
  table: string;
  conflictColumns: string[];
  row: Record<string, unknown>;
  /** Update an existing projection. Supply insert defaults only for events that can create it. */
  updateOnly?: boolean;
  insertDefaults?: Record<string, unknown>;
  /** Safely fill one missing locator or replace the exact legacy value. */
  fillMissing?: { column: string; value: string | null; legacyValue: string };
}

export interface DecodedEventContext {
  chainId: number;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  contractAddress: Address;
  eventName: string;
  args: Record<string, unknown>;
  /** ISO timestamp of the block containing the log, if known. */
  blockTimeIso?: string;
}

export type EventHandler = (ctx: DecodedEventContext) => MirrorUpsert[];

export interface IndexerStore {
  getLastBlock(chainId: number): Promise<bigint>;
  setLastBlock(chainId: number, blockNumber: bigint): Promise<void>;
  upsertChainEvents(events: ChainEventRow[]): Promise<void>;
  upsertMirror(upserts: MirrorUpsert[]): Promise<void>;
}

export interface ReplayStore extends IndexerStore {
  readChainEvents(chainId: number, after: ChainEventRow | undefined, limit: number): Promise<ChainEventRow[]>;
}

export function serializeArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "bigint") {
      out[k] = v.toString();
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === "bigint"
          ? item.toString()
          : item && typeof item === "object"
            ? serializeArgs(item as Record<string, unknown>)
            : item,
      );
    } else if (v && typeof v === "object") {
      out[k] = serializeArgs(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
