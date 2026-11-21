"use client";

import type { ReactNode } from "react";

/**
 * A template (unlike a layout) remounts on every navigation, which replays the entrance animation:
 * the page fades up and its top-level sections cascade in. The shell around it never re-renders.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
