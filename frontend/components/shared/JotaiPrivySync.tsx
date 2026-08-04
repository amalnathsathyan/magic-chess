"use client";

import { useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetAtom } from "jotai";
import { 
  isPrivyReadyAtom, 
  isAuthenticatedAtom, 
  walletAddressAtom, 
  isWalletConnectedAtom 
} from "@/store/wallet";

export function JotaiPrivySync() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const setIsPrivyReady = useSetAtom(isPrivyReadyAtom);
  const setIsAuthenticated = useSetAtom(isAuthenticatedAtom);
  const setWalletAddress = useSetAtom(walletAddressAtom);
  const setIsWalletConnected = useSetAtom(isWalletConnectedAtom);

  useEffect(() => {
    setIsPrivyReady(ready);
    setIsAuthenticated(authenticated);

    if (ready && authenticated) {
      // Find the first solana wallet
      const solanaWallet = wallets.find((w) => w.walletClientType === "privy" && w.address) || 
                           wallets.find((w: any) => w.chainType === "solana") ||
                           user?.linkedAccounts.find((a: any) => a.type === "wallet" && a.chainType === "solana");
      
      const address = (solanaWallet as any)?.address || user?.wallet?.address;

      if (address) {
        setWalletAddress(address);
        setIsWalletConnected(true);
      } else {
        setWalletAddress(null);
        setIsWalletConnected(false);
      }
    } else {
      setWalletAddress(null);
      setIsWalletConnected(false);
    }
  }, [ready, authenticated, user, wallets, setIsPrivyReady, setIsAuthenticated, setWalletAddress, setIsWalletConnected]);

  return null;
}
