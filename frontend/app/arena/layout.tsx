import Link from "next/link";
import { AuthGate } from "@/components/shared/AuthGate";
import { Swords, User } from "lucide-react";

export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Arena header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-heading text-lg font-bold tracking-tight"
            >
              <span className="text-primary">Magic</span> Chess
            </Link>
            <nav className="hidden items-center gap-4 sm:flex">
              <Link
                href="/arena"
                className="flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                <Swords className="h-4 w-4" />
                Arena
              </Link>
              <Link
                href="/profile"
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Page content */}
      <AuthGate>{children}</AuthGate>
    </div>
  );
}
