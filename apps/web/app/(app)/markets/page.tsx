import { NARRATIVE_BY_ID, NARRATIVE_BY_SLUG } from "@nti/sdk";
import { fetchMarketsData, fetchIndexesSnapshot } from "@/lib/supabase";
import { MarketsListClient } from "@/components/MarketsListClient";

export const dynamic = "force-dynamic";

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ narrative?: string }>;
}) {
  const [{ narrative }, data, indexes] = await Promise.all([
    searchParams,
    fetchMarketsData(),
    fetchIndexesSnapshot(),
  ]);

  let initialNarrativeId: number | null = null;
  if (narrative) {
    const asNum = Number(narrative);
    if (Number.isInteger(asNum) && NARRATIVE_BY_ID.has(asNum)) {
      initialNarrativeId = asNum;
    } else {
      const bySlug = NARRATIVE_BY_SLUG.get(narrative.toLowerCase());
      if (bySlug) initialNarrativeId = bySlug.id;
    }
  }

  return (
    <MarketsListClient
      markets={data.markets}
      awaitingDeployment={data.awaitingDeployment}
      initialNarrativeId={initialNarrativeId}
      latestFinalEpoch={indexes.latestFinalEpoch?.epochId ?? null}
    />
  );
}
