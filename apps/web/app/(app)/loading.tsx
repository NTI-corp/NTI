import { InstantRouteShell } from "@/components/InstantRouteShell";

/** Fallback shown while Next.js streams an app segment directly without client optimistic shell. */
export default function AppLoading() {
  return <InstantRouteShell path="/terminal" />;
}
