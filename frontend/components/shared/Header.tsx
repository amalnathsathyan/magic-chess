"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { ZugSymbol } from "@/components/brand/ZugLogo";
import { cn } from "@/lib/utils";
import { Home, Swords, User, Trophy, Settings } from "lucide-react";

const NAV_LINKS = [
  { name: "Home", href: "/", icon: Home },
  { name: "Arena", href: "/arena", icon: Swords },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Ladder", href: "/leaderboard", icon: Trophy },
  { name: "Settings", href: "/settings", icon: Settings },
];

/** The ZUG Arena rail: a sidebar on desktop, a tab bar on phones. */
export function Header() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background md:sticky md:top-0 md:h-dvh md:w-20 md:shrink-0 md:border-r md:border-t-0">
      <div className="flex h-full min-w-0 items-center justify-between px-3 pb-[env(safe-area-inset-bottom)] md:flex-col md:px-0 md:py-6">
        <div className="hidden items-center justify-center md:flex">
          <Link
            href="/"
            aria-label="ZUG home"
            className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ZugSymbol className="h-9 w-9" />
          </Link>
        </div>

        <nav
          aria-label="Primary navigation"
          className="flex min-w-0 flex-1 justify-around md:w-full md:flex-none md:flex-col md:items-center md:justify-center md:gap-2"
        >
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.name}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex h-14 w-14 flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:w-full",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon aria-hidden="true" className="h-5 w-5 stroke-[1.5]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{link.name}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 h-0.5 w-6 bg-primary md:bottom-auto md:left-0 md:top-1/2 md:h-8 md:w-0.5 md:-translate-y-1/2"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-11 shrink-0 items-center justify-center md:w-full md:pb-2">
          <WalletButton />
        </div>
      </div>
    </aside>
  );
}
