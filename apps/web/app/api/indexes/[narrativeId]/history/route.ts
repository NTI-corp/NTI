import { NextRequest, NextResponse } from "next/server";
import { NARRATIVE_BY_ID, NARRATIVE_BY_SLUG } from "@nti/sdk";
import { fetchNarrativeHistory } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ narrativeId: string }> },
) {
  const { narrativeId: rawId } = await context.params;
  const numericId = Number(rawId);
  const meta = Number.isInteger(numericId)
    ? NARRATIVE_BY_ID.get(numericId)
    : NARRATIVE_BY_SLUG.get(rawId.toLowerCase());

  if (!meta) {
    return NextResponse.json(
      { error: `Unknown narrative identifier: ${rawId}` },
      { status: 404 },
    );
  }

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const fromEpoch = fromParam ? Number(fromParam) : undefined;
  const toEpoch = toParam ? Number(toParam) : undefined;

  const data = await fetchNarrativeHistory(meta.id, fromEpoch, toEpoch);
  return NextResponse.json(data, {
    status: data.dataSource === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
