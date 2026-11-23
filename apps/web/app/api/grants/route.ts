import { NextResponse } from "next/server";
import { fetchGrantsData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await fetchGrantsData();
  return NextResponse.json(data, {
    status: data.awaitingDeployment ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
