"use client";

import { useMemo, useRef } from "react";
import { AnchorProvider, Program } from "@anchor-lang/core";
import bs58 from "bs58";
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

  // Keep a ref to the live wallet so the provider closure stays current
  const walletRef = useRef(solanaWallet);
  walletRef.current = solanaWallet;

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

  const provider = useMemo(() => {
    if (!anchorWallet) return { connection };

    const baseProvider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    // Override sendAndConfirm to route through Privy's signAndSendTransaction.
    // - Embedded wallet (social/email): Privy sponsors gas (sponsor: true)
    // - External wallet (Phantom etc.): user pays their own gas
    (baseProvider as any).sendAndConfirm = async (tx: Transaction) => {
      const wallet = walletRef.current;
      if (!wallet) throw new Error("No Solana wallet connected");

      // Serialize the Anchor transaction for Privy
      const serialized = tx.serialize({ requireAllSignatures: false });

      // @ts-expect-error — Privy's SolanaChain type is strict; the runtime only needs id + name
      const { signature } = await wallet.signAndSendTransaction({
        transaction: serialized,
        address: wallet.address,
        chain: { id: 103, name: "solana-devnet" },
        options: { sponsor: true },
      });

      const sigBytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
      return bs58.encode(sigBytes);
    };

    return baseProvider;
  }, [anchorWallet, connection]);

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
