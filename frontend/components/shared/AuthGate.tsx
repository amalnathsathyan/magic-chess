"use client";

import { useAppLogin } from "@/hooks/useAppLogin";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { LoaderCircle, LogIn, Wallet } from "lucide-react";
import { ZugSymbol } from "@/components/brand/ZugLogo";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const login = useAppLogin();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle
            aria-hidden="true"
            className="h-5 w-5 animate-spin motion-reduce:animate-none"
          />
          Loading…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <ZugSymbol className="h-10 w-10" />
          <h1 className="mt-6 font-display text-4xl">Sign in to play</h1>
          <p className="mt-3 text-muted-foreground">
            Email, Google or Discord is enough: we create a Solana wallet for you. Already have
            Phantom or another wallet? Connect it instead.
          </p>
          <button
            type="button"
            onClick={() => login()}
            className="btn btn-primary mt-8 w-full"
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Sign in
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
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <ZugSymbol className="h-10 w-10" />
          <h1 className="mt-6 font-display text-4xl">One more step</h1>
          <p className="mt-3 text-muted-foreground">
            Your stakes and results live in a Solana wallet. We create one for you now; no
            seed phrase to write down, and you can export it later from Settings.
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
            className="btn btn-primary mt-8 w-full"
          >
            {isCreatingWallet ? (
              <LoaderCircle
                aria-hidden="true"
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Wallet aria-hidden="true" className="h-4 w-4" />
            )}
            {isCreatingWallet ? "Creating wallet…" : "Create Solana wallet"}
          </button>
        </div>
      </div>
    );
  }

  return children;
}
