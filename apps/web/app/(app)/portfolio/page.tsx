import { fetchBasketsData, fetchMarketsData } from "@/lib/supabase";
import { PortfolioClient } from "@/components/PortfolioClient";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const [basketsRes, marketsRes] = await Promise.all([
    fetchBasketsData(),
    fetchMarketsData(),
  ]);
  return <PortfolioClient baskets={basketsRes.baskets} markets={marketsRes.markets} basketsUnavailable={basketsRes.awaitingDeployment} marketsUnavailable={marketsRes.awaitingDeployment} />;
}
