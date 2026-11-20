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
  const normalized = id.toLowerCase().replaceAll("_", "-");
  const basket = baskets.find(
    (b) =>
      b.id.toLowerCase().replaceAll("_", "-") === normalized ||
      b.symbol.toLowerCase().replaceAll("_", "-") === normalized ||
      b.basketAddress.toLowerCase() === id.toLowerCase() ||
      String(b.narrativeId) === normalized,
  );

  if (!basket) notFound();

  return <BasketVaultClient basket={basket} />;
}
