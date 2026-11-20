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
}

export interface MirrorUpsert {
  table: string;
  conflictColumns: string[];
  row: Record<string, unknown>;
}

export interface DecodedEventContext {
  chainId: number;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  contractAddress: Address;
  eventName: string;
  args: Record<string, unknown>;
  /** ISO timestamp of the block containing the log (falls back to indexing time when unavailable). */
  blockTimeIso: string;
}

export type EventHandler = (ctx: DecodedEventContext) => MirrorUpsert[];

export interface IndexerStore {
  getLastBlock(chainId: number): Promise<bigint>;
  setLastBlock(chainId: number, blockNumber: bigint): Promise<void>;
  upsertChainEvents(events: ChainEventRow[]): Promise<void>;
  upsertMirror(upserts: MirrorUpsert[]): Promise<void>;
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
