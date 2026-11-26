import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public IPFS gateways differ in speed, availability and rate limits (and some are blocked on some networks), so the
// image is fetched here, from the first gateway that answers, and cached for a year: a CID never changes.
const GATEWAYS = ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 2_000_000;
const CID_PATTERN = /^[A-Za-z0-9]{46,100}$/;
// SVG can carry script and would run on this origin if opened directly; only raster images are served.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

async function fetchFromGateway(base: string, cid: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(`${base}${cid}`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!CID_PATTERN.test(cid)) return new NextResponse(null, { status: 400 });

  for (const gateway of GATEWAYS) {
    const found = await fetchFromGateway(gateway, cid);
    if (found) {
      return new NextResponse(found.bytes, {
        headers: {
          "Content-Type": found.type,
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  // Short cache so a gateway outage is retried soon instead of being remembered for a year.
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
