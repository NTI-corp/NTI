import { NextResponse } from "next/server";
import { fetchIndexesSnapshot } from "@/lib/supabase";

export const revalidate = 60;

export async function GET() {
  const snapshot = await fetchIndexesSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
