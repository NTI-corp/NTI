import { notFound } from "next/navigation";
import { fetchMarketById, fetchMarketsData } from "@/lib/supabase";
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
  let market = markets.find((m) => m.marketId === marketId) ?? null;
  // The list is cached and can lag behind a market created a moment ago; read that id directly.
  if (!market && Number.isInteger(marketId)) market = await fetchMarketById(marketId);

  if (!market) notFound();

  return <MarketDetailClient market={market} />;
}
