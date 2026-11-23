import { NextResponse } from "next/server";
import { fetchIndexesSnapshot } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await fetchIndexesSnapshot();
  return NextResponse.json(snapshot, {
    status: snapshot.dataSource === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
