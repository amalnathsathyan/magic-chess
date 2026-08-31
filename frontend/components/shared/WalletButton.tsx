"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import {
  ArrowLeftRight,
  Check,
  Copy,
  LoaderCircle,
  LogOut,
  Wallet,
} from "lucide-react";
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
  const [walletAction, setWalletAction] = useState<
    "disconnecting" | "switching" | null
  >(null);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
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

  const disconnectWallets = useCallback(async () => {
    await Promise.allSettled(
      wallets.map((connectedWallet) => connectedWallet.disconnect())
    );
  }, [wallets]);

  const handleDisconnect = useCallback(async () => {
    setDropdownOpen(false);
    setWalletAction("disconnecting");
    try {
      await disconnectWallets();
      await logout();
      toast.success("Signed out");
    } catch (error) {
      console.error("Failed to sign out", error);
      toast.error("Could not sign out. Please try again.");
    } finally {
      setWalletAction(null);
    }
  }, [disconnectWallets, logout]);

  const handleSwitchAccount = useCallback(async () => {
    setDropdownOpen(false);
    setWalletAction("switching");
    try {
      await disconnectWallets();
      await logout();
      window.setTimeout(() => login({ loginMethods: ["wallet"] }), 0);
    } catch (error) {
      console.error("Failed to switch wallet", error);
      toast.error("Could not switch wallets. Please try again.");
    } finally {
      setWalletAction(null);
    }
  }, [disconnectWallets, login, logout]);

  // ── Loading ──
  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div
        role="status"
        aria-label="Loading wallet"
        className="h-11 w-11 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none"
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
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,230,118,0.3)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Wallet aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="sr-only">Sign in</span>
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
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCreatingWallet ? (
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Wallet aria-hidden="true" className="h-5 w-5" />
        )}
        <span className="sr-only">
          {isCreatingWallet ? "Creating wallet" : "Create wallet"}
        </span>
      </button>
    );
  }

  // ── Connected ──
  return (
    <div ref={dropdownRef} className="relative flex h-11 w-11 shrink-0">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        disabled={walletAction !== null}
        aria-expanded={dropdownOpen}
        aria-controls="wallet-menu"
        aria-busy={walletAction !== null}
        aria-label={shortAddress ? `Wallet ${shortAddress}` : "Wallet menu"}
        title={shortAddress ?? "Wallet menu"}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dropdownOpen
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-border bg-card/50 text-primary hover:border-border-hover hover:bg-card-hover"
        )}
      >
        {walletAction ? (
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Wallet aria-hidden="true" className="h-5 w-5" />
        )}
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-card bg-primary" />
      </button>

      {dropdownOpen && (
        <div
          id="wallet-menu"
          aria-label="Wallet actions"
          className="absolute bottom-full right-0 z-50 mb-3 w-[min(18rem,calc(100vw-1rem))] rounded-xl border border-border bg-card p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] md:bottom-0 md:left-full md:right-auto md:mb-0 md:ml-3"
        >
          <div className="mb-2 px-1">
            <p className="text-xs text-muted-foreground">Connected with</p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {wallet.standardWallet.name}
            </p>
          </div>

          {/* Full address with copy icon */}
          <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <span className="flex-1 break-all font-mono text-xs leading-relaxed text-foreground">
              {address}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy wallet address"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="mt-1.5 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            Copy address
          </button>

          {/* Separator */}
          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            onClick={handleSwitchAccount}
            disabled={walletAction !== null}
            aria-busy={walletAction === "switching"}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {walletAction === "switching" ? (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
            )}
            Switch account
          </button>

          {/* Disconnect */}
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={walletAction !== null}
            aria-busy={walletAction === "disconnecting"}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {walletAction === "disconnecting" ? (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <LogOut aria-hidden="true" className="h-4 w-4" />
            )}
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
