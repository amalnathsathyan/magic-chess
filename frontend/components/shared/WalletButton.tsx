"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Wallet, LogOut, Copy, ExternalLink, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  const wallet = wallets[0];
  const address = wallet?.address;

  // Mock balance for now
  const mockBalance = "24.5";

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  if (!ready) {
    return (
      <div className="h-10 w-36 animate-pulse rounded-lg bg-white/5" />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 font-heading text-sm font-semibold text-[#0a0a0f] transition-all hover:bg-emerald-400 shadow-[0_0_15px_rgba(0,230,118,0.3)]"
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* SOL Balance */}
      <div className="glass-card hidden sm:flex items-center gap-1.5 px-3 py-2 border-white/5 bg-[#14141f]/50">
        <Coins className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-mono text-xs font-medium text-foreground">
          {mockBalance} SOL
        </span>
      </div>

      {/* Balance / Address */}
      <div className="glass-card flex items-center gap-2 px-3 py-2 border-white/5 bg-[#14141f]/50">
        <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          Devnet
        </span>
        <button
          onClick={handleCopy}
          className="font-mono text-xs font-medium transition-colors hover:text-emerald-400"
          title="Copy address"
        >
          {address ? shortenAddress(address) : "No wallet"}
        </button>
        <button
          onClick={handleCopy}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-colors",
            copied && "text-emerald-400"
          )}
          title="Copy address"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {address && (
          <a
            href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="View on Explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="glass-card p-2 text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10 border-white/5 bg-[#14141f]/50"
        title="Disconnect"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
