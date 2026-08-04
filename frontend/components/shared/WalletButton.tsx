"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Wallet, LogOut } from "lucide-react";
import { useAtomValue } from "jotai";
import { shortAddressAtom } from "@/store/wallet";

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const shortAddress = useAtomValue(shortAddressAtom);

  if (!ready) {
    return (
      <div className="h-10 w-10 md:w-full animate-pulse rounded-xl bg-white/5" />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        title="Connect Wallet"
        className="flex h-10 px-3 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-[#0a0a0c] transition-all hover:bg-emerald-400 shadow-[0_0_15px_rgba(0,230,118,0.3)]"
      >
        <Wallet className="h-5 w-5 shrink-0" />
        <span className="text-sm font-semibold hidden md:block">Connect</span>
      </button>
    );
  }

  return (
    <button
      onClick={logout}
      title={shortAddress ? `Disconnect ${shortAddress}` : "Disconnect"}
      className="group relative flex h-10 px-3 items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#14141f]/50 text-emerald-400 transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
    >
      <Wallet className="h-5 w-5 shrink-0 group-hover:hidden" />
      <LogOut className="h-5 w-5 shrink-0 hidden group-hover:block" />
      {shortAddress && (
        <span className="text-xs font-mono font-medium hidden md:block group-hover:hidden">
          {shortAddress}
        </span>
      )}
      <span className="text-xs font-semibold hidden group-hover:md:block">
        Disconnect
      </span>
    </button>
  );
}
