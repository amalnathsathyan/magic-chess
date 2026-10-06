"use client";

import { useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { api, type ApiPlayerProfile } from "@/lib/api";
import { AVATAR_GLYPHS, AVATAR_OPTIONS, apiErrorMessage } from "@/lib/players";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { cn } from "@/lib/utils";

const BIO_MAX = 160;

/**
 * Name, bio and piece. Saving costs one free wallet signature over the exact
 * new values — no transaction, and nobody else can edit the profile.
 */
export function ProfileEditor({
  profile,
  onSaved,
  onClose,
}: {
  profile: ApiPlayerProfile;
  onSaved: (profile: ApiPlayerProfile) => void;
  onClose: () => void;
}) {
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState(profile.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const wallet = selectSolanaWallet(wallets);
    if (!wallet) {
      setError("Connect your Solana wallet to edit your profile.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const edit = { displayName, bio, avatar };
      const challenge = await api.profileChallenge(wallet.address, edit);
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge.message),
        wallet,
        options: {
          uiOptions: {
            title: "Save your profile",
            description: "Free signature, no transaction. It proves this profile is yours.",
          },
        },
      });
      let binary = "";
      signature.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      const saved = await api.saveProfile(wallet.address, {
        ...edit,
        issuedAt: challenge.issuedAt,
        signature: window.btoa(binary),
      });
      onSaved(saved);
      toast.success("Profile saved");
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught, "We couldn't save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="glass-card space-y-5 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold">Edit profile</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile editor"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div>
        <label htmlFor="display-name" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="magnus_c"
          maxLength={20}
          className="mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          3 to 20 letters, numbers, underscores or dashes. Leave it empty to show your wallet.
        </p>
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value.slice(0, BIO_MAX))}
          rows={3}
          placeholder="Blitz player. Italian Game enjoyer."
          className="mt-1.5 w-full rounded-lg border border-border bg-card p-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {bio.length}/{BIO_MAX}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Piece</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAvatar(avatar === option ? "" : option)}
              aria-pressed={avatar === option}
              aria-label={option}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-lg border text-2xl transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                avatar === option
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-card"
              )}
            >
              {AVATAR_GLYPHS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-heading text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {saving ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? "Waiting for your signature" : "Save profile"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
