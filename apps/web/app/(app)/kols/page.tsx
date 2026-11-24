import { fetchKolLeaderboard } from "@/lib/supabase";
import { KolLeaderboardClient } from "@/components/KolLeaderboardClient";

export const revalidate = 60;

export default async function KolsPage() {
  const data = await fetchKolLeaderboard();
  return <KolLeaderboardClient initial={data} />;
}
