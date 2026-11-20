import { cookies } from "next/headers";
import { fetchIndexesSnapshot, fetchRadarAlerts } from "@/lib/supabase";
import { getSiweSessionState, SIWE_SESSION_COOKIE } from "@/lib/siwe";
import { getActiveChainId, getProtocolAddresses } from "@/lib/contracts";
import { NARRATIVE_CHART_COLORS } from "@/components/IndexChart";
import { AwaitingEpochBanner } from "@/components/AwaitingEpochBanner";
import { MindshareTerminalWorkspace } from "@/components/MindshareTerminalWorkspace";

export const revalidate = 60;

export default async function TerminalPage() {
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
  const combinedSeries = topFive.map((n, idx) => ({
    id: n.narrativeId,
    label: n.label,
    color: NARRATIVE_CHART_COLORS[idx % NARRATIVE_CHART_COLORS.length]!,
    points: snapshot.recentSeries[n.narrativeId] ?? [],
  }));
  const activeEpoch = snapshot.latestObservedEpoch ?? snapshot.latestFinalEpoch;

  return (
    <div className="space-y-4">
      {snapshot.awaitingFirstEpoch && <AwaitingEpochBanner />}
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
