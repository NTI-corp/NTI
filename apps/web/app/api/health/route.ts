import { NextResponse } from "next/server";
import { NARRATIVES, ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID } from "@nti/sdk";
import { getActiveChainId, getProtocolAddresses } from "@/lib/contracts";
import { fetchIndexesSnapshot } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const activeChainId = getActiveChainId();
  const addresses = getProtocolAddresses(activeChainId);
  const snapshot = await fetchIndexesSnapshot();

  return NextResponse.json({
    ok: true,
    service: "nti-web",
    activeChainId,
    chains: {
      mainnet: ROBINHOOD_MAINNET_ID,
      testnet: ROBINHOOD_TESTNET_ID,
    },
    narrativesCount: NARRATIVES.length,
    awaitingFirstEpoch: snapshot.awaitingFirstEpoch,
    latestEpochStatus: snapshot.latestObservedEpoch?.status ?? "collecting",
    registryConfigured: Boolean(addresses.registry),
    stakingConfigured: Boolean(addresses.staking),
    timestamp: new Date().toISOString(),
  });
}
