"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Github,
  Palette,
  User,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { sounds } from "@/lib/sounds";
import { selectSolanaWallet } from "@/lib/privy-wallet";

const APP_VERSION = "0.1.0";
const GITHUB_URL = "https://github.com/amalnathsathyan/magic-chess";
const DOCS_URL = "https://github.com/amalnathsathyan/magic-chess/tree/main/docs";

export default function SettingsPage() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = selectSolanaWallet(wallets);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSoundEnabled(sounds.isEnabled());
  }, []);

  const toggleSound = () => {
    const nextValue = !soundEnabled;
    sounds.setEnabled(nextValue);
    setSoundEnabled(nextValue);
  };

  const copyAddress = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      toast.success("Wallet address copied");
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy address");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure your Magic Chess experience.
        </p>
      </div>

      {/* ── Wallet ── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
          <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Wallet
        </h2>
        <div className="glass-card p-5">
          {authenticated && wallet ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-mono text-sm font-medium">
                    {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connected via Privy
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
                <Link
                  href="/profile"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Profile
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30">
                <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium">No wallet connected</p>
                <p className="text-xs text-muted-foreground">
                  Sign in to enable wallet features.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Preferences ── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
          <Volume2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Preferences
        </h2>
        <div className="space-y-3">
          {/* Sound toggle */}
          <div className="glass-card flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <VolumeX
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div>
                <p id="sound-effects-label" className="text-sm font-medium">
                  Sound effects
                </p>
                <p className="text-xs text-muted-foreground">
                  Play sounds for moves, captures, and game events. This setting
                  is saved on this device.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-labelledby="sound-effects-label"
              onClick={toggleSound}
              className={`relative inline-flex h-10 w-16 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                soundEnabled
                  ? "border-primary/50 bg-primary"
                  : "border-border bg-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-7 w-7 rounded-full bg-background shadow-sm transition-transform ${
                  soundEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Board theme placeholder */}
          <div className="glass-card flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Board theme</p>
                <p className="text-xs text-muted-foreground">
                  Choose a visual theme for the chess board.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Coming soon
            </span>
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          About
        </h2>
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Version</p>
              <p className="font-mono text-sm font-medium">{APP_VERSION}</p>
            </div>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Documentation
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              GitHub
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
