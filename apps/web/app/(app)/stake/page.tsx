import { Suspense } from "react";
import { fetchGovernorProposals } from "@/lib/supabase";
import { StakeClient } from "@/components/StakeClient";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const dynamic = "force-dynamic";

async function StakeContent() {
  const proposals = await fetchGovernorProposals();
  return (
    <div className="tab-panel-enter">
      <StakeClient proposals={proposals} />
    </div>
  );
}

export default function StakePage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/stake" />}>
      <StakeContent />
    </Suspense>
  );
}
