import { Suspense } from "react";
import { cookies } from "next/headers";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { RadarClient } from "@/components/RadarClient";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function RadarContent() {
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

  return (
    <div className="tab-panel-enter">
      <RadarClient initialData={initialData} sectors={snapshot.narratives} />
    </div>
  );
}

export default function RadarPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/radar" />}>
      <RadarContent />
    </Suspense>
  );
}
