import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { fetchRadarAlerts } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SIWE_SESSION_COOKIE)?.value;
  const session = await getSiweSessionState(sessionCookie);

  const radar = await fetchRadarAlerts({
    realtimeUnlocked: session.authenticated && session.hasRadarAccess,
    wallet: session.address,
    stakeFormatted: session.stakeFormatted,
    minStakeRequired: session.radarMinStakeFormatted,
  });

  return NextResponse.json(radar, {
    status: radar.dataSource === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
