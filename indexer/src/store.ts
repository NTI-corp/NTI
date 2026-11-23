import type { Address, Hex } from "viem";
import type { ChainEventRow, IndexerStore, MirrorUpsert, ReplayStore } from "./types.js";

const BYTEA_COLUMNS = new Set([
  "tx_hash",
  "contract_address",
  "dataset_hash",
  "config_hash",
  "commit_tx",
  "arweave_tx_bytes32",
  "address",
  "challenger",
  "evidence_hash",
  "wallet",
  "basket_address",
  "factory_address",
  "governor_address",
  "bettor",
  "proposer",
  "recipient",
  "metadata_hash",
  "voter",
  "account",
  "handle_hash",
  "nti_token",
  "staking",
  "buyback_adapter",
]);

function encodeByteaValue(val: unknown): unknown {
  if (typeof val === "string" && /^0x[0-9a-fA-F]+$/.test(val)) {
    return `\\x${val.slice(2).toLowerCase()}`;
  }
  return val;
}

function formatRowForPostgres(row: Record<string, unknown>): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    formatted[k] = BYTEA_COLUMNS.has(k) ? encodeByteaValue(v) : v;
  }
  return formatted;
}

export interface SupabaseRestStoreOptions {
  supabaseUrl: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}

export class SupabaseRestStore implements ReplayStore {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SupabaseRestStoreOptions) {
    this.baseUrl = options.supabaseUrl.replace(/\/+$/, "");
    this.serviceKey = options.serviceKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(prefer?: string): Record<string, string> {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    };
  }

  async getLastBlock(chainId: number): Promise<bigint> {
    const url = `${this.baseUrl}/rest/v1/indexer_state?chain_id=eq.${chainId}&select=last_block&limit=1`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Supabase getLastBlock failed (${res.status}): ${await res.text()}`);
    }
    const rows = (await res.json()) as Array<{ last_block: string | number }>;
    if (!rows.length || rows[0]?.last_block === undefined || rows[0]?.last_block === null) {
      return 0n;
    }
    return BigInt(rows[0].last_block);
  }

  async setLastBlock(chainId: number, blockNumber: bigint): Promise<void> {
    const url = `${this.baseUrl}/rest/v1/indexer_state?on_conflict=chain_id`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify([
        {
          chain_id: chainId,
          last_block: blockNumber.toString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
    if (!res.ok) {
      throw new Error(`Supabase setLastBlock failed (${res.status}): ${await res.text()}`);
    }
  }

  async upsertChainEvents(events: ChainEventRow[]): Promise<void> {
    // Keep PostgREST batches uniform. A lookup without a timestamp must leave any stored time intact.
    const undated: Record<string, unknown>[] = [];
    const dated: Record<string, unknown>[] = [];
    for (const { block_time, ...event } of events) {
      if (block_time) dated.push(formatRowForPostgres({ ...event, block_time }));
      else undated.push(formatRowForPostgres(event));
    }
    for (const rows of [undated, dated]) {
      for (let i = 0; i < rows.length; i += 500) {
        await this.postRows("chain_events", ["chain_id", "tx_hash", "log_index"], rows.slice(i, i + 500));
      }
    }
  }

  async readChainEvents(chainId: number, after: ChainEventRow | undefined, limit: number): Promise<ChainEventRow[]> {
    const query = new URLSearchParams({
      chain_id: `eq.${chainId}`,
      select: "chain_id,tx_hash,log_index,block_number,contract_address,event_name,args,block_time",
      order: "block_number.asc,log_index.asc,tx_hash.asc",
      limit: String(limit),
    });
    if (after) {
      const { block_number: block, log_index: index, tx_hash } = after;
      const tx = encodeByteaValue(tx_hash);
      query.set("or", `(block_number.gt.${block},and(block_number.eq.${block},log_index.gt.${index}),and(block_number.eq.${block},log_index.eq.${index},tx_hash.gt."${String(tx).replace(/\\/g, "\\\\")}"))`);
    }
    const res = await this.fetchImpl(`${this.baseUrl}/rest/v1/chain_events?${query}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Supabase readChainEvents failed (${res.status}): ${await res.text()}`);
    const rows = await res.json() as ChainEventRow[];
    return rows.map((row) => ({
      ...row,
      block_number: String(row.block_number),
      tx_hash: row.tx_hash.replace(/^\\x/, "0x") as Hex,
      contract_address: row.contract_address.replace(/^\\x/, "0x") as Address,
    }));
  }

  async upsertMirror(upserts: MirrorUpsert[]): Promise<void> {
    // Keep event order, including transitions whose column sets differ or whose parents just appeared.
    for (const { table, conflictColumns, row, updateOnly, insertDefaults, fillMissing } of upserts) {
      const formatted = formatRowForPostgres(row);
      const key = new URLSearchParams();
      for (const column of conflictColumns) {
        if (formatted[column] == null) throw new Error(`Missing ${table} mirror key ${column}`);
        key.set(column, `eq.${formatted[column]}`);
      }
      if (updateOnly) {
        const patch = Object.fromEntries(Object.entries(formatted).filter(([column]) => !conflictColumns.includes(column)));
        if (await this.patchRow(table, key, patch)) continue;
        if (insertDefaults) {
          const inserted = await this.postRows(
            table, conflictColumns, [formatRowForPostgres({ ...insertDefaults, ...row })], true,
          );
          // A concurrent insert can win between the PATCH and POST. Reapply just the intended fields.
          if (inserted || await this.patchRow(table, key, patch)) continue;
        }
        throw new Error(`Supabase patch(${table}) missing mirror row for ${key}`);
      }

      if (fillMissing && formatted.arweave_tx_bytes32 != null) {
        const supersedeKey = new URLSearchParams(key);
        supersedeKey.set("arweave_tx_bytes32", `neq.${formatted.arweave_tx_bytes32}`);
        await this.patchRow(table, supersedeKey, { [fillMissing.column]: fillMissing.value });
      }
      await this.postRows(table, conflictColumns, [formatted]);
      if (fillMissing) {
        const { column, value, legacyValue } = fillMissing;
        const filters = [`${column}.eq.${legacyValue}`];
        if (value !== null) filters.push(`${column}.is.null`);
        key.set("or", `(${filters.join(",")})`);
        await this.patchRow(table, key, { [column]: value });
      }
    }
  }

  private async postRows(
    table: string,
    conflictColumns: string[],
    rows: Record<string, unknown>[],
    ignoreDuplicates = false,
  ): Promise<boolean> {
    const query = new URLSearchParams({ on_conflict: conflictColumns.join(",") });
    const strategy = ignoreDuplicates ? "ignore-duplicates,return=representation" : "merge-duplicates,return=minimal";
    const res = await this.fetchImpl(`${this.baseUrl}/rest/v1/${encodeURIComponent(table)}?${query}`, {
      method: "POST",
      headers: this.headers(`resolution=${strategy},missing=default`),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase upsert(${table}) failed (${res.status}): ${await res.text()}`);
    return !ignoreDuplicates || (await res.json() as unknown[]).length === 1;
  }

  private async patchRow(table: string, query: URLSearchParams, patch: Record<string, unknown>): Promise<boolean> {
    const res = await this.fetchImpl(`${this.baseUrl}/rest/v1/${encodeURIComponent(table)}?${query}`, {
      method: "PATCH",
      headers: this.headers("return=representation"),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Supabase patch(${table}) failed (${res.status}): ${await res.text()}`);
    return (await res.json() as unknown[]).length === 1;
  }
}

export interface InMemorySnapshot {
  checkpoints: Record<number, string>;
  chainEvents: ChainEventRow[];
  mirrors: Record<string, Record<string, unknown>[]>;
}

export class InMemoryStore implements IndexerStore {
  private readonly checkpoints = new Map<number, bigint>();
  private readonly events = new Map<string, ChainEventRow>();
  private readonly mirrors = new Map<string, Map<string, Record<string, unknown>>>();

  async getLastBlock(chainId: number): Promise<bigint> {
    return this.checkpoints.get(chainId) ?? 0n;
  }

  async setLastBlock(chainId: number, blockNumber: bigint): Promise<void> {
    this.checkpoints.set(chainId, blockNumber);
  }

  async upsertChainEvents(events: ChainEventRow[]): Promise<void> {
    for (const ev of events) {
      const key = `${ev.chain_id}:${ev.tx_hash.toLowerCase()}:${ev.log_index}`;
      this.events.set(key, structuredClone(ev));
    }
  }

  async upsertMirror(upserts: MirrorUpsert[]): Promise<void> {
    for (const u of upserts) {
      let tableMap = this.mirrors.get(u.table);
      if (!tableMap) {
        tableMap = new Map();
        this.mirrors.set(u.table, tableMap);
      }
      const pk = u.conflictColumns
        .map((col) => String(u.row[col] ?? "").toLowerCase())
        .join("|");
      const existing = tableMap.get(pk);
      if (u.updateOnly && !existing && !u.insertDefaults) throw new Error(`Missing ${u.table} mirror row for ${pk}`);
      const row = { ...(existing ?? u.insertDefaults), ...structuredClone(u.row) };
      const locator = u.fillMissing;
      const commitmentChanged =
        existing != null &&
        existing.arweave_tx_bytes32 != null &&
        u.row.arweave_tx_bytes32 != null &&
        existing.arweave_tx_bytes32 !== u.row.arweave_tx_bytes32;
      if (
        locator &&
        (commitmentChanged ||
          row[locator.column] === locator.legacyValue ||
          (locator.value !== null && row[locator.column] == null))
      ) {
        row[locator.column] = locator.value;
      }
      tableMap.set(pk, row);
    }
  }

  getSnapshot(): InMemorySnapshot {
    const checkpoints: Record<number, string> = {};
    for (const [k, v] of this.checkpoints.entries()) {
      checkpoints[k] = v.toString();
    }

    const chainEvents = [...this.events.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => structuredClone(v));

    const mirrors: Record<string, Record<string, unknown>[]> = {};
    for (const [table, rows] of [...this.mirrors.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      mirrors[table] = [...rows.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, r]) => structuredClone(r));
    }

    return { checkpoints, chainEvents, mirrors };
  }
}
