"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { cn } from "@/lib/utils";
import { Home, Swords, User, Trophy, Settings } from "lucide-react";

const NAV_LINKS = [
  { name: "Home", href: "/", icon: Home },
  { name: "Arena", href: "/arena", icon: Swords },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 z-50 w-full border-t border-white/5 bg-[#101015] md:sticky md:top-0 md:h-dvh md:w-20 md:shrink-0 md:border-r md:border-t-0 md:border-white/5">
      <div className="flex h-full min-w-0 items-center justify-between px-3 pb-[env(safe-area-inset-bottom)] md:flex-col md:px-0 md:py-6">
        {/* Top: Logo */}
        <div className="hidden md:flex items-center justify-center">
          <Link
            href="/"
            aria-label="Magic Chess home"
            className="group flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-white/95 p-1.5 transition-all hover:border-emerald-400/50 hover:shadow-[0_0_15px_rgba(0,230,118,0.3)]"
          >
            <Image
              src="/logo.png"
              alt="Magic Chess"
              width={36}
              height={36}
              priority
              className="h-full w-full object-contain"
            />
          </Link>
        </div>

        {/* Middle: Navigation */}
        <nav aria-label="Primary navigation" className="flex min-w-0 flex-1 justify-around md:w-full md:flex-none md:flex-col md:items-center md:justify-center md:gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.name}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <Icon aria-hidden="true" className="h-6 w-6 stroke-[1.5]" />
                <span className="sr-only">{link.name}</span>
                {isActive && (
                  <span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(0,230,118,0.5)] md:bottom-auto md:left-0 md:top-1/2 md:h-8 md:w-1 md:-translate-y-1/2" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Wallet */}
        <div className="flex min-w-11 shrink-0 items-center justify-center md:w-full md:pb-2">
          <WalletButton />
        </div>
      </div>
    </aside>
  );
}
