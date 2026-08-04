"use client";

import Link from "next/link";
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
    <aside className="fixed bottom-0 left-0 z-50 w-full border-t border-white/5 bg-[#101015] md:sticky md:top-0 md:h-screen md:w-20 md:flex-col md:border-r md:border-t-0 md:border-white/5">
      <div className="flex h-full w-full items-center justify-between px-4 md:flex-col md:px-0 md:py-6">
        {/* Top: Logo */}
        <div className="hidden md:flex items-center justify-center">
          <Link href="/" className="group flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 transition-all hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(0,230,118,0.3)]">
            MC
          </Link>
        </div>

        {/* Middle: Navigation */}
        <nav className="flex w-full justify-around md:flex-col md:justify-center md:gap-6 md:w-auto">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.name}
                className={cn(
                  "group relative flex items-center justify-center p-3 transition-all rounded-xl",
                  isActive
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <Icon className="h-6 w-6 stroke-[1.5]" />
                {isActive && (
                  <span className="absolute bottom-1 md:bottom-auto md:left-0 md:top-1/2 md:-translate-y-1/2 h-1 w-1 md:h-8 md:w-1 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(0,230,118,0.5)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Wallet */}
        <div className="flex items-center justify-center md:pb-2">
          <WalletButton />
        </div>
      </div>
    </aside>
  );
}
