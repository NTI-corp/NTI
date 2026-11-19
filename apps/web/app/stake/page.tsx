import { fetchGovernorProposals } from "@/lib/supabase";
import { StakeClient } from "@/components/StakeClient";

export const dynamic = "force-dynamic";

export default async function StakePage() {
  const proposals = await fetchGovernorProposals();
  return <StakeClient proposals={proposals} />;
}
