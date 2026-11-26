import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getPoll, isSameOrigin, saveVote } from "@/lib/polls";
import { readStakeAtBlock } from "@/lib/onchain";
import { SIWE_SESSION_COOKIE, readSessionCookie } from "@/lib/siwe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const cookieStore = await cookies();
  const session = readSessionCookie(cookieStore.get(SIWE_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });

  const { id } = await params;
  const pollId = Number(id);
  if (!Number.isSafeInteger(pollId) || pollId <= 0) {
    return NextResponse.json({ error: "Unknown poll." }, { status: 404 });
  }

  let option: unknown;
  try {
    option = ((await request.json()) as { option?: unknown }).option;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let poll;
  try {
    poll = await getPoll(pollId);
  } catch {
    return NextResponse.json({ error: "Polls are temporarily unavailable." }, { status: 503 });
  }
  if (!poll) return NextResponse.json({ error: "Unknown poll." }, { status: 404 });
  if (new Date(poll.ends_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This poll has ended." }, { status: 409 });
  }

  const optionCount = Array.isArray(poll.options) ? poll.options.length : 0;
  if (typeof option !== "number" || !Number.isInteger(option) || option < 0 || option >= optionCount) {
    return NextResponse.json({ error: "Pick one of the listed options." }, { status: 400 });
  }

  const weight = await readStakeAtBlock(session.address, BigInt(poll.snapshot_block));
  if (weight === null) {
    return NextResponse.json({ error: "Could not read your stake from the chain." }, { status: 503 });
  }
  if (weight === 0n) {
    return NextResponse.json(
      { error: `You had no stake at the snapshot (block ${poll.snapshot_block}), so this poll has no weight for you.` },
      { status: 403 },
    );
  }

  try {
    await saveVote(pollId, session.address, option, weight);
  } catch {
    return NextResponse.json({ error: "Could not save your vote." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, weightWei: weight.toString() }, { headers: { "Cache-Control": "no-store" } });
}
