import { AppShell } from "@/components/AppShell";

export default function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
