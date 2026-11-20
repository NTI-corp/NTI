import type { ChainEventRow, IndexerStore, MirrorUpsert } from "./types.js";

const BYTEA_COLUMNS = new Set([
  "tx_hash",
  "contract_address",
  "dataset_hash",
  "config_hash",
  "commit_tx",
  "address",
  "challenger",
  "evidence_hash",
  "wallet",
  "basket_address",
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
  /** When true, 404/PGRST205 on optional mirror tables logs a warning instead of throwing. */
  tolerateMissingMirrorTables?: boolean;
}

export class SupabaseRestStore implements IndexerStore {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tolerateMissingMirrorTables: boolean;

  constructor(options: SupabaseRestStoreOptions) {
    this.baseUrl = options.supabaseUrl.replace(/\/+$/, "");
    this.serviceKey = options.serviceKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tolerateMissingMirrorTables = options.tolerateMissingMirrorTables ?? true;
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
    if (events.length === 0) return;
    const url = `${this.baseUrl}/rest/v1/chain_events?on_conflict=chain_id,tx_hash,log_index`;
    const payload = events.map((e) => formatRowForPostgres(e as unknown as Record<string, unknown>));
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Supabase upsertChainEvents failed (${res.status}): ${await res.text()}`);
    }
  }

  async upsertMirror(upserts: MirrorUpsert[]): Promise<void> {
    if (upserts.length === 0) return;

    // Group by table + conflict columns so each group is batched cleanly.
    // PostgREST requires every object in one batch to share the same key set, and Postgres rejects an
    // upsert that touches the same conflict key twice, so group by key signature and collapse duplicates
    // (later rows win, in event order).
    const grouped = new Map<
      string,
      { table: string; conflict: string; rows: Map<string, Record<string, unknown>> }
    >();
    for (const u of upserts) {
      const conflict = u.conflictColumns.join(",");
      const formatted = formatRowForPostgres(u.row);
      const signature = Object.keys(formatted).sort().join(",");
      const key = `${u.table}::${conflict}::${signature}`;
      const bucket = grouped.get(key) ?? { table: u.table, conflict, rows: new Map() };
      const rowKey = u.conflictColumns.map((c) => String(formatted[c])).join("|");
      bucket.rows.set(rowKey, formatted);
      grouped.set(key, bucket);
    }

    for (const { table, conflict, rows: rowMap } of grouped.values()) {
      const rows = [...rowMap.values()];
      const url = `${this.baseUrl}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(conflict)}`;
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.headers("resolution=merge-duplicates,return=minimal"),
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        const body = await res.text();
        if (this.tolerateMissingMirrorTables && (res.status === 404 || body.includes("PGRST205"))) {
          continue;
        }
        // Partial-column rows (e.g. epoch status flips) violate NOT NULL on the INSERT half of an
        // upsert even when the row already exists. Fall back to updating just the provided columns.
        if (body.includes('"23502"')) {
          await this.patchPartialRows(table, conflict.split(","), rows);
          continue;
        }
        // Referenced parent row not mirrored yet (e.g. dispute on an epoch older than the first DB epoch).
        if (body.includes('"23503"')) {
          console.warn(`[nti-indexer] skipped ${table} mirror rows with missing parent row: ${body}`);
          continue;
        }
        throw new Error(`Supabase upsertMirror(${table}) failed (${res.status}): ${body}`);
      }
    }
  }

  private async patchPartialRows(
    table: string,
    conflictColumns: string[],
    rows: Record<string, unknown>[],
  ): Promise<void> {
    for (const row of rows) {
      const filter = conflictColumns
        .map((c) => `${encodeURIComponent(c)}=eq.${encodeURIComponent(String(row[c]))}`)
        .join("&");
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!conflictColumns.includes(k)) patch[k] = v;
      }
      const res = await this.fetchImpl(`${this.baseUrl}/rest/v1/${encodeURIComponent(table)}?${filter}`, {
        method: "PATCH",
        headers: this.headers("return=minimal"),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`Supabase patch(${table}) failed (${res.status}): ${await res.text()}`);
      }
    }
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
      const existing = tableMap.get(pk) ?? {};
      tableMap.set(pk, { ...existing, ...structuredClone(u.row) });
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
