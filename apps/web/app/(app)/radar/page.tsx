import { cookies } from "next/headers";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { RadarClient } from "@/components/RadarClient";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const cookieStore = await cookies();
  const session = await getSiweSessionState(cookieStore.get(SIWE_SESSION_COOKIE)?.value);

  const [initialData, snapshot] = await Promise.all([
    fetchRadarAlerts({
      realtimeUnlocked: session.authenticated && session.hasRadarAccess,
      wallet: session.address,
      stakeFormatted: session.stakeFormatted,
      minStakeRequired: session.radarMinStakeFormatted,
    }),
    fetchIndexesSnapshot(),
  ]);

  return <RadarClient initialData={initialData} sectors={snapshot.narratives} />;
}
