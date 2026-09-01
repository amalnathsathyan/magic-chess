"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { LoaderCircle, LogIn, Wallet } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle
            aria-hidden="true"
            className="h-5 w-5 animate-spin motion-reduce:animate-none"
          />
          Preparing the arena...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LogIn aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold">
            Sign in to enter the arena
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Continue with email, a social account, or your Solana wallet.
          </p>
          <button
            type="button"
            onClick={() => login({ walletChainType: "solana-only" })}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Sign in or connect wallet
          </button>
        </div>
      </div>
    );
  }

  if (wallets.length === 0) {
    const handleCreateWallet = async () => {
      setWalletError(null);
      setIsCreatingWallet(true);
      try {
        await createWallet();
      } catch (error) {
        console.error("Failed to create Solana wallet", error);
        setWalletError("We couldn't create your Solana wallet. Please try again.");
      } finally {
        setIsCreatingWallet(false);
      }
    };

    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold">
            Set up your Solana wallet
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Magic Chess needs a Solana wallet to create, join, and play on-chain matches.
          </p>
          {walletError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {walletError}
            </p>
          )}
          <button
            type="button"
            onClick={handleCreateWallet}
            disabled={isCreatingWallet}
            aria-busy={isCreatingWallet}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingWallet ? (
              <LoaderCircle
                aria-hidden="true"
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Wallet aria-hidden="true" className="h-4 w-4" />
            )}
            {isCreatingWallet ? "Creating wallet..." : "Create Solana wallet"}
          </button>
        </div>
      </div>
    );
  }

  return children;
}
