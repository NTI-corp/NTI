import { NextResponse } from "next/server";
import { fetchMarketsData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await fetchMarketsData();
  return NextResponse.json(data);
}
