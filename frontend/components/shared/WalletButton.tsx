"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { Wallet, LogOut } from "lucide-react";
import { toast } from "sonner";
import { selectSolanaWallet } from "@/lib/privy-wallet";

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const wallet = selectSolanaWallet(wallets);
  const shortAddress = wallet?.address
    ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`
    : null;

  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div
        role="status"
        aria-label="Loading wallet"
        className="h-10 w-10 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none md:w-full"
      />
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={login}
        aria-label="Sign in or connect a wallet"
        title="Sign in or connect a wallet"
        className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-primary-foreground shadow-[0_0_15px_rgba(0,230,118,0.3)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Wallet aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="hidden text-sm font-semibold md:block">Sign in</span>
      </button>
    );
  }

  if (!wallet) {
    const handleCreateWallet = async () => {
      setIsCreatingWallet(true);
      try {
        await createWallet();
        toast.success("Solana wallet ready");
      } catch (error) {
        console.error("Failed to create Solana wallet", error);
        toast.error("Could not create your Solana wallet. Please try again.");
      } finally {
        setIsCreatingWallet(false);
      }
    };

    return (
      <button
        type="button"
        onClick={handleCreateWallet}
        disabled={isCreatingWallet}
        aria-label={isCreatingWallet ? "Creating Solana wallet" : "Create Solana wallet"}
        className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Wallet aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="hidden text-sm font-semibold md:block">
          {isCreatingWallet ? "Creating..." : "Create wallet"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={logout}
      aria-label={shortAddress ? `Disconnect wallet ${shortAddress}` : "Disconnect wallet"}
      title={shortAddress ? `Disconnect ${shortAddress}` : "Disconnect"}
      className="group relative flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-border bg-card/50 px-3 text-primary transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Wallet aria-hidden="true" className="h-5 w-5 shrink-0 group-hover:hidden" />
      <LogOut aria-hidden="true" className="hidden h-5 w-5 shrink-0 group-hover:block" />
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
