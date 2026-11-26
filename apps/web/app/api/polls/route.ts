import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createPoll, isSameOrigin, listPolls, validateNewPoll } from "@/lib/polls";
import { readIsProtocolAdmin, readStakingClock } from "@/lib/onchain";
import { SIWE_SESSION_COOKIE, readSessionCookie } from "@/lib/siwe";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const cookieStore = await cookies();
  const session = readSessionCookie(cookieStore.get(SIWE_SESSION_COOKIE)?.value);
  try {
    const [polls, isAdmin] = await Promise.all([
      listPolls(session?.address ?? null),
      session ? readIsProtocolAdmin(session.address) : Promise.resolve(false),
    ]);
    return NextResponse.json({ polls, me: { address: session?.address ?? null, isAdmin } }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Polls are temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const cookieStore = await cookies();
  const session = readSessionCookie(cookieStore.get(SIWE_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });
  if (!(await readIsProtocolAdmin(session.address))) {
    return NextResponse.json({ error: "Only the protocol admin can open a poll." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const checked = validateNewPoll(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  const block = await readStakingClock();
  if (block === null || block < 2n) return NextResponse.json({ error: "Could not read the chain." }, { status: 503 });
  try {
    // The snapshot is the previous tick of the staking clock, which is already in the past and counts every stake that exists now.
    const id = await createPoll(checked.value, session.address, block - 1n);
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not save the poll." }, { status: 503 });
  }
}
