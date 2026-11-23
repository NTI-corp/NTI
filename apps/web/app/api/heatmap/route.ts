import { NextResponse } from "next/server";
import { fetchHeatmapData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const heatmap = await fetchHeatmapData();
  return NextResponse.json(heatmap, {
    status: heatmap.dataSource === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
