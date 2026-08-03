"use client";

import { useMemo } from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { AnchorProvider, Program } from "@anchor-lang/core";
import { MagicChessProvider } from "@magic-chess/sdk/react";
import type { MagicChess } from "@magic-chess/sdk";
import { MAGIC_PROGRAM_ID } from "@magic-chess/sdk";

// Reconstruct the IDL object to satisfy Anchor's Program constructor
const IDL: any = {
  address: "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h",
  metadata: {
    name: "magicChess",
    version: "0.1.0",
    spec: "0.1.0",
    description: "On-chain chess engine with wagering"
  },
  instructions: [
    {
      name: "initializeMatch",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "playerSigner", writable: true, signer: true },
        { name: "bettingTokenMintAccount" },
        { name: "playerTokenAccount", writable: true },
        { name: "matchEscrowTokenAccount", writable: true },
        { name: "tokenProgram", address: "" },
        { name: "systemProgram", address: "" }
      ],
      args: [
        { name: "matchIdArg", type: "string" },
        { name: "betAmountArg", type: "u64" },
        { name: "moveTimeoutDurationArg", type: "i64" },
        { name: "platformFeeBasisPointsArg", type: "u16" },
        { name: "platformFeeWalletArg", type: "pubkey" }
      ]
    },
    {
      name: "joinMatch",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "playerTwoSigner", writable: true, signer: true },
        { name: "playerTokenAccount", writable: true },
        { name: "matchEscrowTokenAccount", writable: true },
        { name: "tokenProgram", address: "" },
        { name: "systemProgram", address: "" }
      ],
      args: [{ name: "betAmountArg", type: "u64" }]
    },
    {
      name: "makeMove",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "player", writable: true, signer: true }
      ],
      args: [
        { name: "from", type: "u8" },
        { name: "to", type: "u8" },
        { name: "promotion", type: { option: "u8" } }
      ]
    },
    {
      name: "resignGame",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "playerSigner", writable: true, signer: true }
      ],
      args: []
    },
    {
      name: "claimTimeoutWin",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "claimerSigner", writable: true, signer: true }
      ],
      args: []
    },
    {
      name: "processMatchSettlement",
      accounts: [
        { name: "chessMatch", writable: true },
        { name: "matchEscrowTokenAccount", writable: true },
        { name: "playerOneAta", writable: true },
        { name: "playerTwoAta", writable: true },
        { name: "platformFeeAta", writable: true },
        { name: "tokenProgram", address: "" }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "ChessMatch",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0]
    },
    {
      name: "chessMatch",
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0]
    }
  ],
  events: [
    { name: "matchCreatedEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "playerJoinedEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "moveMadeEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "gameEndedEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "payoutEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: "drawPayoutEvent", discriminator: [0, 0, 0, 0, 0, 0, 0, 0] }
  ],
  errors: [],
  types: [
    { name: "matchCreatedEvent", type: { kind: "struct", fields: [] } },
    { name: "playerJoinedEvent", type: { kind: "struct", fields: [] } },
    { name: "moveMadeEvent", type: { kind: "struct", fields: [] } },
    { name: "gameEndedEvent", type: { kind: "struct", fields: [] } },
    { name: "payoutEvent", type: { kind: "struct", fields: [] } },
    { name: "drawPayoutEvent", type: { kind: "struct", fields: [] } },
    {
      name: "ChessMatch",
      type: { kind: "struct", fields: [] }
    },
    {
      name: "chessMatch",
      type: { kind: "struct", fields: [] }
    },
    {
      name: "makeMoveArgs",
      type: {
        kind: "struct",
        fields: [
          { name: "from", type: "u8" },
          { name: "to", type: "u8" }
        ]
      }
    }
  ]
};

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

export function SolanaProgramProvider({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const solanaWallet = wallets.find((w: any) => w.walletClientType === "privy" || w.chainType === "solana");
  const { signTransaction } = useSignTransaction();

  // Create Connection
  const connection = useMemo(() => new Connection(RPC_ENDPOINT, "confirmed"), []);

  // Adapt Privy wallet to AnchorWallet
  const anchorWallet = useMemo(() => {
    if (!solanaWallet) return undefined;
    return {
      publicKey: new PublicKey(solanaWallet.address),
      signTransaction: async <T extends any>(tx: T): Promise<T> => {
        const signedTx = await signTransaction({
          transaction: tx as any,
          connection,
        });
        return signedTx as T;
      },
      signAllTransactions: async <T extends any>(txs: T[]): Promise<T[]> => {
        const signedTxs = [];
        for (const tx of txs) {
          const signedTx = await signTransaction({
            transaction: tx as any,
            connection,
          });
          signedTxs.push(signedTx as T);
        }
        return signedTxs;
      },
    } as any;
  }, [solanaWallet, signTransaction, connection]);

  const provider = useMemo(() => {
    return new AnchorProvider(
      connection as any,
      anchorWallet || ({
        publicKey: PublicKey.default,
        signTransaction: async () => { throw new Error("Wallet not connected"); },
        signAllTransactions: async () => { throw new Error("Wallet not connected"); },
      } as any),
      { commitment: "confirmed" }
    );
  }, [connection, anchorWallet]);

  // Instantiate Program
  const program = useMemo(() => {
    // If we wanted to use a specific program ID from env, we could override here.
    return new Program(IDL as any, provider) as any;
  }, [provider]);

  return (
    <MagicChessProvider program={program} wallet={anchorWallet}>
      {children}
    </MagicChessProvider>
  );
}
