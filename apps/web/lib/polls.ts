import { formatUnits } from "viem";

// Off-chain stake-weighted polls. A vote weighs the voter's stake at the poll's snapshot block; results are advisory,
// the protocol admin decides whether to act. Reads and writes use the Supabase REST API; writes need the service key.

export interface PollTally {
  label: string;
  votes: number;
  weight: number;
  weightWei: string;
}

export interface PollItem {
  id: number;
  title: string;
  description: string;
  options: string[];
  snapshotBlock: number;
  createdBy: string;
  createdAt: string;
  endsAt: string;
  open: boolean;
  tally: PollTally[];
  totalWeight: number;
  totalVotes: number;
  myVote: number | null;
  myWeight: number | null;
}

export interface PollRow {
  id: number;
  title: string;
  description: string;
  options: unknown;
  snapshot_block: number | string;
  created_by: string;
  created_at: string;
  ends_at: string;
}

interface VoteRow {
  poll_id: number;
  voter: string;
  option_index: number;
  weight: number | string;
}

function config() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_KEY ?? "";
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, service, read: service || anon };
}

async function rest<T>(path: string, init: RequestInit & { write?: boolean } = {}): Promise<T> {
  const { url, service, read } = config();
  const key = init.write ? service : read;
  if (!url || !key) throw new Error("Supabase is not configured");
  const { write: _write, ...fetchInit } = init;
  void _write;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...fetchInit,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(fetchInit.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : []) as T;
}

function weiOf(raw: number | string): bigint {
  return BigInt(String(raw).split(".")[0] || "0");
}

function toNumber(wei: bigint): number {
  return Number(formatUnits(wei, 18));
}

export async function listPolls(viewer: string | null, limit = 20): Promise<PollItem[]> {
  const polls = await rest<PollRow[]>(`polls?select=*&order=id.desc&limit=${limit}`);
  if (polls.length === 0) return [];
  const ids = polls.map((p) => p.id).join(",");
  const votes = await rest<VoteRow[]>(
    `poll_votes?select=poll_id,voter,option_index,weight&poll_id=in.(${ids})&limit=5000`,
  );
  const now = Date.now();
  const me = viewer?.toLowerCase() ?? null;

  return polls.map((p) => {
    const options = Array.isArray(p.options) ? p.options.map((o) => String(o)) : [];
    const own = votes.filter((v) => v.poll_id === p.id);
    const tally: PollTally[] = options.map((label, index) => {
      const forOption = own.filter((v) => v.option_index === index);
      const weightWei = forOption.reduce((sum, v) => sum + weiOf(v.weight), 0n);
      return { label, votes: forOption.length, weight: toNumber(weightWei), weightWei: weightWei.toString() };
    });
    const mine = me ? own.find((v) => v.voter.toLowerCase() === me) : undefined;
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      options,
      snapshotBlock: Number(p.snapshot_block),
      createdBy: p.created_by,
      createdAt: p.created_at,
      endsAt: p.ends_at,
      open: new Date(p.ends_at).getTime() > now,
      tally,
      totalWeight: tally.reduce((sum, t) => sum + t.weight, 0),
      totalVotes: own.length,
      myVote: mine ? mine.option_index : null,
      myWeight: mine ? toNumber(weiOf(mine.weight)) : null,
    };
  });
}

export interface NewPoll {
  title: string;
  description: string;
  options: string[];
  endsInHours: number;
}

/** Validates user-supplied poll fields; returns an error message or the cleaned values. */
export function validateNewPoll(input: unknown): { error: string } | { value: NewPoll } {
  const body = (input ?? {}) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const rawOptions = Array.isArray(body.options) ? body.options : [];
  const options = rawOptions.map((o) => (typeof o === "string" ? o.trim() : "")).filter((o) => o.length > 0);
  const hours = Number(body.endsInHours);

  if (title.length < 3 || title.length > 140) return { error: "Title must be 3 to 140 characters." };
  if (description.length > 2000) return { error: "Description is limited to 2000 characters." };
  if (options.length < 2 || options.length > 6) return { error: "A poll needs 2 to 6 options." };
  if (options.some((o) => o.length > 80)) return { error: "Each option is limited to 80 characters." };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { error: "Options must be different." };
  }
  if (!Number.isFinite(hours) || hours < 1 || hours > 336) return { error: "A poll runs for 1 to 336 hours." };
  return { value: { title, description, options, endsInHours: Math.floor(hours) } };
}

export async function createPoll(poll: NewPoll, createdBy: string, snapshotBlock: bigint): Promise<number> {
  const endsAt = new Date(Date.now() + poll.endsInHours * 3_600_000).toISOString();
  const rows = await rest<Array<{ id: number }>>("polls", {
    method: "POST",
    write: true,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        title: poll.title,
        description: poll.description,
        options: poll.options,
        snapshot_block: Number(snapshotBlock),
        created_by: createdBy,
        ends_at: endsAt,
      },
    ]),
  });
  const id = rows[0]?.id;
  if (typeof id !== "number") throw new Error("Poll was not created");
  return id;
}

export async function getPoll(id: number): Promise<PollRow | null> {
  const rows = await rest<PollRow[]>(`polls?select=*&id=eq.${id}&limit=1`);
  return rows[0] ?? null;
}

/** One vote per wallet; a later vote on the same poll replaces the earlier one while the poll is open. */
export async function saveVote(pollId: number, voter: string, optionIndex: number, weightWei: bigint): Promise<void> {
  await rest("poll_votes?on_conflict=poll_id,voter", {
    method: "POST",
    write: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        poll_id: pollId,
        voter: voter.toLowerCase(),
        option_index: optionIndex,
        weight: weightWei.toString(),
        voted_at: new Date().toISOString(),
      },
    ]),
  });
}

/** Mutating requests must come from this site: the session cookie is lax, so the origin is checked as well. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? "");
  } catch {
    return false;
  }
}
