import { notFound } from "next/navigation";
import { fetchBasketsData } from "@/lib/supabase";
import { BasketVaultClient } from "@/components/BasketVaultClient";

export const dynamic = "force-dynamic";

export default async function BasketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { baskets } = await fetchBasketsData();
  const normalized = id.toLowerCase();
  const basket =
    baskets.find(
      (b) =>
        b.id.toLowerCase() === normalized ||
        b.symbol.toLowerCase() === normalized ||
        String(b.narrativeId) === normalized,
    ) ?? baskets[0];

  if (!basket) notFound();

  return <BasketVaultClient basket={basket} />;
}
