import { NextResponse } from "next/server";
import { NARRATIVES, ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID } from "@nti/sdk";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "nti-web",
    chains: {
      mainnet: ROBINHOOD_MAINNET_ID,
      testnet: ROBINHOOD_TESTNET_ID,
    },
    narrativesCount: NARRATIVES.length,
  });
}
