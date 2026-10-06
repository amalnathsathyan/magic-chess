import Link from "next/link";
import { AuthGate } from "@/components/shared/AuthGate";
import { ZugLockup } from "@/components/brand/ZugLogo";

export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/arena" aria-label="ZUG Arena" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ZugLockup descriptor="Arena" />
          </Link>
          <span className="stage-tag text-success">Live on devnet</span>
        </div>
      </header>

      <AuthGate>{children}</AuthGate>
    </div>
  );
}
