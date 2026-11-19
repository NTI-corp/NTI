import { fetchMarketsData } from "@/lib/supabase";
import { MarketsListClient } from "@/components/MarketsListClient";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const data = await fetchMarketsData();
  return (
    <MarketsListClient
      markets={data.markets}
      awaitingDeployment={data.awaitingDeployment}
    />
  );
}
