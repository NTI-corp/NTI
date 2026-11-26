"use client";

import React, { useCallback, useEffect, useState } from "react";
import { formatCompactNumber, formatCountdown } from "@/lib/format";
import type { PollItem } from "@/lib/polls";
import { useSiweSession } from "./Providers";

interface PollsResponse {
  polls: PollItem[];
  me: { address: string | null; isAdmin: boolean };
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: "Network error, try again." };
  }
}

function CreatePoll({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState("Yes\nNo");
  const [hours, setHours] = useState("72");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await postJson("/api/polls", {
      title,
      description,
      options: options.split("\n"),
      endsInHours: Number(hours),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not open the poll.");
      return;
    }
    setTitle("");
    setDescription("");
    onCreated();
  }

  const field =
    "w-full border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1.5 font-mono text-xs text-[#F5F5F7] outline-none focus:border-[#CCFF00]/50";
  return (
    <div className="border border-[#26262A] bg-[#111113] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717A]">Open a poll · admin only</div>
      <div className="mt-3 grid gap-3">
        <input className={field} placeholder="Question" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        <textarea
          className={field}
          placeholder="Details (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
        <textarea
          className={field}
          placeholder="One option per line (2 to 6)"
          rows={3}
          value={options}
          onChange={(e) => setOptions(e.target.value)}
        />
        <label className="flex items-center gap-2 font-mono text-[11px] text-[#A1A1AA]">
          Runs for
          <input className={`${field} w-20`} value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" />
          hours
        </label>
        {error && <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">{error}</div>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full bg-[#CCFF00] py-2 font-mono text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#B8E600] disabled:opacity-45"
        >
          {busy ? "OPENING…" : "OPEN POLL"}
        </button>
      </div>
    </div>
  );
}

function PollCard({
  poll,
  signedIn,
  onVote,
  onSignIn,
  signingIn,
}: {
  poll: PollItem;
  signedIn: boolean;
  onVote: (pollId: number, option: number) => Promise<string | null>;
  onSignIn: () => void;
  signingIn: boolean;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function vote(option: number) {
    setBusy(option);
    setMessage(null);
    const error = await onVote(poll.id, option);
    setBusy(null);
    if (error) setMessage(error);
  }

  return (
    <div className="border border-[#26262A] bg-[#161618] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#F5F5F7]">{poll.title}</h3>
        <span
          className={`border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
            poll.open
              ? "border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]"
              : "border-[#3A3A40] bg-[#1A1A1D] text-[#8A8A93]"
          }`}
        >
          {poll.open ? "open" : "ended"}
        </span>
      </div>
      {poll.description && <p className="mt-1.5 whitespace-pre-line text-xs text-[#8A8A93]">{poll.description}</p>}

      <div className="mt-3 space-y-2">
        {poll.tally.map((t, index) => {
          const share = poll.totalWeight > 0 ? (t.weight / poll.totalWeight) * 100 : 0;
          const mine = poll.myVote === index;
          return (
            <div key={t.label}>
              <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className={mine ? "text-[#CCFF00]" : "text-[#F5F5F7]"}>
                  {t.label}
                  {mine ? " · your vote" : ""}
                </span>
                <span className="tabular-nums text-[#A1A1AA]">
                  {share.toFixed(1)}% · {formatCompactNumber(t.weight)} · {t.votes} vote{t.votes === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-[#1F1F23]">
                <div className="h-full bg-[#CCFF00]" style={{ width: `${Math.min(100, share)}%`, opacity: mine ? 1 : 0.6 }} />
              </div>
              {poll.open && signedIn && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void vote(index)}
                  className="mt-1.5 border border-[#26262A] bg-[#111113] px-2.5 py-1 font-mono text-[10px] text-[#F5F5F7] transition-colors hover:border-[#CCFF00]/50 disabled:opacity-45"
                >
                  {busy === index ? "SAVING…" : mine ? "VOTED" : "VOTE"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {poll.open && !signedIn && (
        <button
          type="button"
          disabled={signingIn}
          onClick={onSignIn}
          className="mt-3 border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-3 py-1.5 font-mono text-[11px] text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:opacity-45"
        >
          {signingIn ? "SIGNING IN…" : "SIGN IN WITH WALLET TO VOTE"}
        </button>
      )}
      {message && <div className="mt-3 border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">{message}</div>}

      <div className="mt-3 border-t border-[#1F1F23] pt-2 font-mono text-[10px] text-[#71717A]">
        Weight = stake at block {poll.snapshotBlock.toLocaleString("en-US")} ·{" "}
        {poll.open ? `ends in ${formatCountdown(poll.endsAt)}` : "closed"}
        {poll.myWeight !== null ? ` · your weight ${formatCompactNumber(poll.myWeight)}` : ""}
      </div>
    </div>
  );
}

/** Stake-weighted polls without a Governor: signed in with the wallet, counted from stake at a snapshot block. */
export function PollsPanel() {
  const { session, signIn, signingIn } = useSiweSession();
  const signedIn = Boolean(session?.authenticated);
  const [data, setData] = useState<PollsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/polls", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as PollsResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Reload when the signed-in wallet changes so "your vote" and the admin form match the wallet.
  useEffect(() => {
    void load();
  }, [load, session?.address]);

  async function vote(pollId: number, option: number): Promise<string | null> {
    const result = await postJson(`/api/polls/${pollId}/vote`, { option });
    if (result.ok) await load();
    return result.ok ? null : (result.error ?? "Could not save your vote.");
  }

  return (
    <section className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">Community polls · stake-weighted</div>
        <p className="mt-1 max-w-2xl text-xs text-[#71717A]">
          Your vote weighs your stake at the poll&apos;s snapshot block, so moving tokens afterwards changes nothing. Results are
          advisory: the protocol admin decides whether to act on them.
        </p>
      </div>

      {failed && <div className="border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-2.5 font-mono text-xs text-[#F59E0B]">Polls are temporarily unavailable.</div>}
      {data?.me.isAdmin && <CreatePoll onCreated={() => void load()} />}
      {data && data.polls.length === 0 && (
        <div className="border border-[#26262A] bg-[#161618] p-6 text-center font-mono text-xs text-[#71717A]">No polls yet.</div>
      )}
      {data?.polls.map((poll) => (
        <PollCard key={poll.id} poll={poll} signedIn={signedIn} onVote={vote} onSignIn={() => void signIn()} signingIn={signingIn} />
      ))}
    </section>
  );
}
