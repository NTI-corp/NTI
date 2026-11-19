import { NextResponse } from "next/server";
import { fetchHeatmapData } from "@/lib/supabase";

export const revalidate = 60;

export async function GET() {
  const heatmap = await fetchHeatmapData();
  return NextResponse.json(heatmap, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
