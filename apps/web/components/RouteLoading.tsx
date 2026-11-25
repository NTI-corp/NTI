"use client";

import { usePathname } from "next/navigation";
import { InstantRouteShell } from "./InstantRouteShell";

/** Loading UI that matches the page being opened instead of always showing the terminal shell. */
export function RouteLoading() {
  const pathname = usePathname() || "/terminal";
  return <InstantRouteShell path={pathname} />;
}
