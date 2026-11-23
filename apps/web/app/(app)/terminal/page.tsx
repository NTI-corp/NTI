import { Suspense } from "react";
import { cookies } from "next/headers";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { getActiveChainId, getProtocolAddresses } from "@/lib/contracts";
import { sectorColor } from "@/lib/sectors";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";
import { MindshareTerminalWorkspace } from "@/components/MindshareTerminalWorkspace";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function TerminalContent() {
  const cookieStore = await cookies();
  const siwe = await getSiweSessionState(cookieStore.get(SIWE_SESSION_COOKIE)?.value);

  const [snapshot, radar] = await Promise.all([
    fetchIndexesSnapshot(),
    fetchRadarAlerts({
      realtimeUnlocked: siwe.authenticated && siwe.hasRadarAccess,
      wallet: siwe.address,
      stakeFormatted: siwe.stakeFormatted,
      minStakeRequired: siwe.radarMinStakeFormatted,
    }),
  ]);

  const chainId = getActiveChainId();
  const addresses = getProtocolAddresses(chainId);
  const sortedNarratives = [...snapshot.narratives].sort((a, b) => b.iBps - a.iBps);
  const topFive = sortedNarratives.slice(0, 5);
  const combinedSeries = topFive.map((n) => ({
    id: n.narrativeId,
    label: n.label,
    color: sectorColor(n.narrativeId),
    points: snapshot.recentSeries[n.narrativeId] ?? [],
  }));
  const activeEpoch = snapshot.latestFinalEpoch;

  return (
    <div className="tab-panel-enter space-y-4">
      {snapshot.awaitingFirstEpoch && <AwaitingEpochBanner />}
      {snapshot.dataSource === "unavailable" && <AwaitingEpochBanner unavailable message="Official index is temporarily unavailable." />}
      <MindshareTerminalWorkspace
        narratives={snapshot.narratives}
        recentSeries={snapshot.recentSeries}
        combinedSeries={combinedSeries}
        radar={radar}
        activeEpoch={activeEpoch}
        oracleAddress={addresses.oracleCommit ?? null}
        pendingFinalization={snapshot.pendingFinalization}
      />
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/terminal" />}>
      <TerminalContent />
    </Suspense>
  );
}
