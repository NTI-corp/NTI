import { notFound } from "next/navigation";
import { fetchMarketsData } from "@/lib/supabase";
import { MarketDetailClient } from "@/components/MarketDetailClient";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const marketId = Number(id);
  const { markets } = await fetchMarketsData();
  const market = markets.find((m) => m.marketId === marketId);

  if (!market) notFound();

  return <MarketDetailClient market={market} />;
}
