import { NextResponse } from "next/server";
import { fetchKolLeaderboard } from "@/lib/supabase";

export const revalidate = 60;

export async function GET() {
  const data = await fetchKolLeaderboard();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
