import { fetchGrantsData } from "@/lib/supabase";
import { GrantsClient } from "@/components/GrantsClient";

export const dynamic = "force-dynamic";

export default async function GrantsPage() {
  const data = await fetchGrantsData();
  return (
    <GrantsClient
      rounds={data.rounds}
      awaitingDeployment={data.awaitingDeployment}
    />
  );
}
