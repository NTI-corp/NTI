import { NextResponse } from "next/server";
import { fetchBasketsData } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await fetchBasketsData();
  return NextResponse.json(data);
}
