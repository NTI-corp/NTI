import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public IPFS gateways differ in speed, availability and rate limits (and some are blocked on some networks), so the
// image is fetched here, from the first gateway that answers, and cached for a year: a CID never changes.
const GATEWAYS = ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 2_000_000;
const CID_PATTERN = /^[A-Za-z0-9]{46,100}$/;
// SVG can carry script and would run on this origin if opened directly; only raster images are served.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

async function fetchFromGateway(
  base: string,
  cid: string,
  signal: AbortSignal,
): Promise<{ bytes: ArrayBuffer; type: string }> {
  const res = await fetch(`${base}${cid}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) throw new Error("not a raster image");
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("too large");
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new Error("bad size");
  return { bytes, type };
}

export async function GET(_request: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!CID_PATTERN.test(cid)) return new NextResponse(null, { status: 400 });

  // All gateways at once: the fastest valid answer wins, the others are cancelled.
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(9_000)]);
  try {
    const found = await Promise.any(GATEWAYS.map((gateway) => fetchFromGateway(gateway, cid, signal)));
    controller.abort();
    return new NextResponse(found.bytes, {
      headers: {
        "Content-Type": found.type,
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    controller.abort();
    // Short cache so a gateway outage is retried soon instead of being remembered for a year.
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  }
}
