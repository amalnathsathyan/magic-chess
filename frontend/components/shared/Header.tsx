"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { ZugSymbol, ZugWordmark } from "@/components/brand/ZugLogo";
import { cn } from "@/lib/utils";
import { Settings, Swords, Trophy, User } from "lucide-react";

const NAV_LINKS = [
  { name: "Play", href: "/arena", icon: Swords, match: ["/arena", "/play", "/spectate", "/review"] },
  { name: "Ladder", href: "/leaderboard", icon: Trophy, match: ["/leaderboard"] },
  { name: "Profile", href: "/profile", icon: User, match: ["/profile"] },
  { name: "Settings", href: "/settings", icon: Settings, match: ["/settings"] },
];

function useActive() {
  const pathname = usePathname() ?? "/";
  return (paths: string[]) => paths.some((path) => pathname.startsWith(path));
}

/**
 * The ZUG Arena shell: a top bar with the mark, the four places and the
 * wallet, plus a tab bar on phones.
 */
export function Header() {
  const isActive = useActive();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4 sm:px-6">
          <Link
            href="/"
            aria-label="ZUG home"
            className="flex items-center gap-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ZugSymbol className="h-7 w-7" />
            <ZugWordmark className="h-4 w-auto" title="ZUG" />
          </Link>

          <nav aria-label="Primary navigation" className="hidden h-full items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.match);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full items-center px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {link.name}
                  {active ? (
                    <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="stage-tag hidden text-success lg:inline-flex">Devnet</span>
            <WalletButton />
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.match);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {active ? (
                  <span aria-hidden="true" className="absolute inset-x-6 top-0 h-0.5 bg-primary" />
                ) : null}
                <Icon aria-hidden="true" className="h-5 w-5 stroke-[1.6]" />
                {link.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
