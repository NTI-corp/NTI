import { NextRequest, NextResponse } from "next/server";
import { fetchEpochDetail } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ epochId: string }> },
) {
  const { epochId: raw } = await context.params;
  const parsed = raw === "latest" ? undefined : Number(raw);
  if (raw !== "latest" && (!Number.isSafeInteger(parsed) || (parsed ?? 0) <= 0 || (parsed ?? 0) > 0xffffffff)) {
    return NextResponse.json(
      { error: `Invalid epochId: ${raw}` },
      { status: 400 },
    );
  }

  const detail = await fetchEpochDetail(parsed);
  return NextResponse.json(detail, {
    status: detail.dataSource === "unavailable" ? 503 : !detail.epoch && parsed !== undefined ? 404 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
