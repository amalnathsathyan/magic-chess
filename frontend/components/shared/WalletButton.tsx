"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Wallet, LogOut, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  const wallet = wallets[0];
  const address = wallet?.address;

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
      <div className="h-10 w-36 animate-pulse rounded-lg bg-card" />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover"
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Balance / Address */}
      <div className="glass-card flex items-center gap-2 px-3 py-2">
        <button
          onClick={handleCopy}
          className="font-mono text-xs transition-colors hover:text-primary"
          title="Copy address"
        >
          {address ? shortenAddress(address) : "No wallet"}
        </button>
        <button
          onClick={handleCopy}
          className={cn(
            "text-muted hover:text-foreground",
            copied && "text-primary"
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
            className="text-muted hover:text-foreground"
            title="View on Explorer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="glass-card p-2 text-muted transition-colors hover:text-destructive"
        title="Disconnect"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
