import { AuthGate } from "@/components/shared/AuthGate";

export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
