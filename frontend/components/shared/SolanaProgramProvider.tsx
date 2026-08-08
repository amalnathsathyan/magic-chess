"use client";

import { useMemo } from "react";
import { AnchorProvider, Program } from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  MAGIC_CHESS_IDL,
  type MagicChess,
} from "@magic-chess/sdk";
import { MagicChessProvider } from "@magic-chess/sdk/react";
import { solanaConfig } from "@/lib/solana-config";

const RPC_ENDPOINT = solanaConfig.rpcEndpoint;
const PROGRAM_ID = solanaConfig.programId;

type BrowserAnchorWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]>;
};

export function SolanaProgramProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { wallets } = useSolanaWallets();
  const solanaWallet = wallets[0];

  const connection = useMemo(
    () => new Connection(RPC_ENDPOINT, "confirmed"),
    []
  );

  const anchorWallet = useMemo<BrowserAnchorWallet | undefined>(() => {
    if (!solanaWallet) return undefined;

    return {
      publicKey: new PublicKey(solanaWallet.address),
      signTransaction: (transaction) =>
        solanaWallet.signTransaction(transaction),
      signAllTransactions: (transactions) =>
        solanaWallet.signAllTransactions(transactions),
    };
  }, [solanaWallet]);

  const provider = useMemo(
    () =>
      anchorWallet
        ? new AnchorProvider(connection, anchorWallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
          })
        : { connection },
    [anchorWallet, connection]
  );

  const program = useMemo(() => {
    const idl = {
      ...MAGIC_CHESS_IDL,
      address: PROGRAM_ID,
    } as MagicChess;

    return new Program<MagicChess>(idl, provider);
  }, [provider]);

  return (
    <MagicChessProvider
      program={program}
      wallet={anchorWallet}
      routerEndpoint={solanaConfig.routerEndpoint}
    >
      {children}
    </MagicChessProvider>
  );
}
