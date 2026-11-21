import { Suspense } from "react";
import { fetchGrantsData } from "@/lib/supabase";
import { GrantsClient } from "@/components/GrantsClient";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function GrantsContent() {
  const data = await fetchGrantsData();
  return (
    <div className="tab-panel-enter">
      <GrantsClient
        rounds={data.rounds}
        awaitingDeployment={data.awaitingDeployment}
      />
    </div>
  );
}

export default function GrantsPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/grants" />}>
      <GrantsContent />
    </Suspense>
  );
}
