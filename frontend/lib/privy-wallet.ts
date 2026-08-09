import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";

/** Privy v3 can expose both embedded and external Standard Wallet accounts. */
export function isPrivyEmbeddedWallet(
  wallet: ConnectedStandardSolanaWallet
): boolean {
  return wallet.standardWallet.name.toLowerCase() === "privy";
}

/**
 * Social logins should transact with their embedded Privy wallet. Wallet-only
 * logins fall back to the connected external wallet.
 */
export function selectSolanaWallet(
  wallets: ConnectedStandardSolanaWallet[]
): ConnectedStandardSolanaWallet | undefined {
  return wallets.find(isPrivyEmbeddedWallet) ?? wallets[0];
}
