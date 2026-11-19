import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import {
  SIWE_NONCE_COOKIE,
  SIWE_SESSION_COOKIE,
  createSessionCookie,
  getSiweSessionState,
  issueNonce,
  verifyNonceCookie,
  verifySiweSubmission,
} from "@/lib/siwe";

export const dynamic = "force-dynamic";

const isProd = process.env.NODE_ENV === "production";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const wantNonce = request.nextUrl.searchParams.get("nonce") === "1";

  if (wantNonce) {
    const { nonce, cookieValue, maxAge } = issueNonce();
    const res = NextResponse.json({ nonce });
    res.cookies.set(SIWE_NONCE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge,
    });
    return res;
  }

  const sessionCookie = cookieStore.get(SIWE_SESSION_COOKIE)?.value;
  const state = await getSiweSessionState(sessionCookie);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let body: {
    action?: "nonce" | "verify" | "logout";
    message?: string;
    signature?: Hex;
    address?: Address;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true, authenticated: false });
    res.cookies.delete(SIWE_SESSION_COOKIE);
    return res;
  }

  if (body.action === "nonce") {
    const { nonce, cookieValue, maxAge } = issueNonce();
    const res = NextResponse.json({ nonce });
    res.cookies.set(SIWE_NONCE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge,
    });
    return res;
  }

  if (!body.message || !body.signature || !body.address) {
    return NextResponse.json(
      { error: "Missing message, signature, or address" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const expectedNonce = verifyNonceCookie(cookieStore.get(SIWE_NONCE_COOKIE)?.value);
  if (!expectedNonce) {
    return NextResponse.json(
      { error: "Missing or expired SIWE nonce. Request a fresh nonce first." },
      { status: 401 },
    );
  }

  const verified = await verifySiweSubmission({
    message: body.message,
    signature: body.signature,
    address: body.address,
    expectedNonce,
  });

  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  const { cookieValue, maxAge } = createSessionCookie(verified.address, verified.chainId);
  const state = await getSiweSessionState(cookieValue);

  const res = NextResponse.json(state);
  res.cookies.set(SIWE_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge,
  });
  res.cookies.delete(SIWE_NONCE_COOKIE);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, authenticated: false });
  res.cookies.delete(SIWE_SESSION_COOKIE);
  return res;
}
