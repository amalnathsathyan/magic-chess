"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { Wallet, LogOut, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

export function WalletButton() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const wallet = selectSolanaWallet(wallets);
  const address = wallet?.address ?? null;
  const shortAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : null;

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    const ok = await copyToClipboard(address);
    if (ok) {
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  }, [address]);

  const handleDisconnect = useCallback(() => {
    setDropdownOpen(false);
    logout();
  }, [logout]);

  // ── Loading ──
  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div
        role="status"
        aria-label="Loading wallet"
        className="h-10 w-10 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none md:w-full"
      />
    );
  }

  // ── Not authenticated ──
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

  // ── No wallet created yet ──
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

  // ── Connected ──
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        aria-label={shortAddress ? `Wallet ${shortAddress}` : "Wallet menu"}
        className={cn(
          "flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dropdownOpen
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-border bg-card/50 text-primary hover:border-border-hover hover:bg-card-hover"
        )}
      >
        <Wallet aria-hidden="true" className="h-5 w-5 shrink-0" />
        {shortAddress && (
          <span className="hidden text-xs font-mono font-medium md:block">
            {shortAddress}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50"
        >
          {/* Full address with copy icon */}
          <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <span className="flex-1 break-all font-mono text-xs leading-relaxed text-foreground">
              {address}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy wallet address"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Copy address text button */}
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            Copy address
          </button>

          {/* Separator */}
          <div className="my-1 h-px bg-border" />

          {/* Disconnect */}
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
