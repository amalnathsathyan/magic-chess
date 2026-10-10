"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useExportWallet,
  type ConnectedStandardSolanaWallet,
} from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { isPrivyEmbeddedWallet } from "@/lib/privy-wallet";

/**
 * Exports the private key of a Privy embedded Solana wallet. Privy shows the
 * key in its own secure modal (an isolated iframe), so the key never reaches
 * this app. External wallets can't be exported, so `canExport` is false for them.
 */
export function useExportPrivyKey(wallet: ConnectedStandardSolanaWallet | undefined) {
  const { ready, authenticated } = usePrivy();
  const { exportWallet } = useExportWallet();
  const [exporting, setExporting] = useState(false);

  const canExport =
    ready && authenticated && !!wallet && isPrivyEmbeddedWallet(wallet);

  const exportKey = useCallback(async () => {
    if (!canExport || !wallet) return;
    setExporting(true);
    try {
      await exportWallet({ address: wallet.address });
    } catch (error) {
      // Closing the modal rejects too; only surface real failures.
      const message = error instanceof Error ? error.message : String(error);
      if (!/clos|cancel|exited/i.test(message)) {
        console.error("Failed to export wallet", error);
        toast.error("Could not open the key export. Please try again.");
      }
    } finally {
      setExporting(false);
    }
  }, [canExport, exportWallet, wallet]);

  return { canExport, exportKey, exporting };
}
