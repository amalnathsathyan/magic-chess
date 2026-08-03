import { atom } from "jotai";

// Wallet connection state
export const isWalletConnectedAtom = atom<boolean>(false);

export const walletAddressAtom = atom<string | null>(null);

export const walletBalanceAtom = atom<number | null>(null);

// Derived: shortened address for display
export const shortAddressAtom = atom<string | null>((get) => {
  const address = get(walletAddressAtom);
  if (!address) return null;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
});

// Privy auth state
export const isPrivyReadyAtom = atom<boolean>(false);

export const isAuthenticatedAtom = atom<boolean>(false);

// Transaction state
export type TxStatus = "idle" | "submitting" | "confirming" | "success" | "error";

export const txStatusAtom = atom<TxStatus>("idle");

export const txSignatureAtom = atom<string | null>(null);

export const txErrorAtom = atom<string | null>(null);

// Reset all tx state
export const resetTxAtom = atom(null, (_get, set) => {
  set(txStatusAtom, "idle");
  set(txSignatureAtom, null);
  set(txErrorAtom, null);
});
