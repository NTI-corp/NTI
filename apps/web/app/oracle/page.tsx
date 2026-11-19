import { fetchEpochDetail } from "@/lib/supabase";
import { OracleClient } from "@/components/OracleClient";

export const dynamic = "force-dynamic";

export default async function OraclePage() {
  const initial = await fetchEpochDetail();
  return <OracleClient initial={initial} />;
}
