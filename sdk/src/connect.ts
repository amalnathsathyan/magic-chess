import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";

import { MagicChessClient } from "./client";
import { MAGIC_CHESS_IDL, type MagicChess } from "./idl";
import { ZUG_DEVNET } from "./play";
import type { MagicChessWallet } from "./types";

/** Wallet adapter for a local keypair (bots, agents, scripts). */
export function keypairWallet(keypair: Keypair): MagicChessWallet {
  const sign = <T extends Transaction | VersionedTransaction>(transaction: T): T => {
    if (transaction instanceof VersionedTransaction) transaction.sign([keypair]);
    else transaction.partialSign(keypair);
    return transaction;
  };
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (transaction) => sign(transaction),
    signAllTransactions: async (transactions) => transactions.map(sign),
  };
}

export interface ConnectOptions {
  /** A local keypair to sign with. */
  keypair?: Keypair;
  /** Or any wallet with the browser-wallet signing surface. */
  wallet?: MagicChessWallet;
  /** Base-layer RPC. Defaults to Solana devnet. */
  rpcUrl?: string;
  /** MagicBlock router. Defaults to devnet. */
  routerEndpoint?: string;
  /** Backend to send indexing hints to; `null` turns them off. Defaults to ZUG Arena's. */
  indexerUrl?: string | null;
  commitment?: Commitment;
}

/**
 * Build a ready-to-use client in one call. Leave out the keypair and wallet
 * for a read-only client.
 *
 * ```ts
 * const client = connectMagicChess({ keypair });
 * const { matchId } = await client.openMatch({ stake: 10_000_000n });
 * ```
 */
export function connectMagicChess(options: ConnectOptions = {}): MagicChessClient {
  const commitment = options.commitment ?? "confirmed";
  const connection = new Connection(options.rpcUrl ?? ZUG_DEVNET.rpcUrl, commitment);
  const wallet = options.wallet ?? (options.keypair ? keypairWallet(options.keypair) : undefined);
  // A read-only provider still needs a public key; nothing is ever signed with it.
  const providerWallet = wallet ?? keypairWallet(Keypair.generate());
  const provider = new AnchorProvider(connection, providerWallet, {
    commitment,
    preflightCommitment: commitment,
  });
  const program = new Program<MagicChess>(MAGIC_CHESS_IDL, provider);
  return new MagicChessClient(program, wallet, {
    routerEndpoint: options.routerEndpoint ?? ZUG_DEVNET.routerEndpoint,
    indexerUrl: options.indexerUrl === null ? undefined : (options.indexerUrl ?? ZUG_DEVNET.apiUrl),
  });
}
