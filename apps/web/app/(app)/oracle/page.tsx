import { Suspense } from "react";
import { fetchEpochDetail } from "@/lib/supabase";
import { OracleClient } from "@/components/OracleClient";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function OracleContent() {
  const initial = await fetchEpochDetail();
  return (
    <div className="tab-panel-enter">
      <OracleClient initial={initial} />
    </div>
  );
}

export default function OraclePage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/oracle" />}>
      <OracleContent />
    </Suspense>
  );
}
