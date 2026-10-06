"use client";

import { useMemo } from "react";
import { AnchorProvider, Program } from "@anchor-lang/core";
import { getAccessToken } from "@privy-io/react-auth";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  type Signer,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import {
  useSignAndSendTransaction,
  useSignTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import {
  MAGIC_CHESS_IDL,
  type MagicChess,
} from "@magic-chess/sdk";
import { MagicChessProvider } from "@magic-chess/sdk/react";
import {
  isPrivyEmbeddedWallet,
  selectSolanaWallet,
} from "@/lib/privy-wallet";
import { getBackendFeePayer, solanaConfig } from "@/lib/solana-config";
import { MagicSessionProvider } from "@/components/shared/MagicSessionProvider";

const RPC_ENDPOINT = solanaConfig.rpcEndpoint;
const PROGRAM_ID = solanaConfig.programId;
const PRIVY_SOLANA_CHAIN = "solana:devnet" as const;
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const SPONSOR_AUTHORIZATION_MEMO = "magic-chess:sponsor";
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
  "ComputeBudget111111111111111111111111111111"
);

/**
 * Magic Chess instructions that can't move funds: playing a move, managing the
 * per-match fast-play key, and committing/undelegating the rollup state.
 * Embedded wallets sign these without a modal so play feels instant; anything
 * else (wagers, joins, settlement, resignation) keeps the approval screen.
 */
const GAMEPLAY_DISCRIMINATORS = new Set(
  [
    [78, 77, 152, 203, 222, 211, 208, 233], // make_move
    [13, 147, 179, 38, 67, 1, 69, 132], // set_session_key
    [81, 192, 32, 110, 104, 116, 144, 151], // revoke_session_key
    [201, 80, 148, 145, 9, 196, 225, 56], // commit_state
    [142, 117, 126, 27, 242, 11, 103, 14], // undelegate_match
  ].map((bytes) => Buffer.from(bytes).toString("hex"))
);

function isGameplayOnly(transaction: Transaction | VersionedTransaction): boolean {
  if ("version" in transaction) return false;
  const programId = new PublicKey(PROGRAM_ID);
  return (
    transaction.instructions.length > 0 &&
    transaction.instructions.every((instruction) => {
      if (instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) return true;
      return (
        instruction.programId.equals(programId) &&
        GAMEPLAY_DISCRIMINATORS.has(
          Buffer.from(instruction.data.subarray(0, 8)).toString("hex")
        )
      );
    })
  );
}

function serializeTransaction(
  transaction: Transaction | VersionedTransaction
): Uint8Array {
  if ("version" in transaction) return transaction.serialize();
  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
}

function deserializeSignedTransaction<T extends Transaction | VersionedTransaction>(
  original: T,
  serialized: Uint8Array
): T {
  const constructor = original.constructor as {
    from?: (bytes: Uint8Array) => Transaction;
    deserialize?: (bytes: Uint8Array) => VersionedTransaction;
  };

  if ("version" in original && constructor.deserialize) {
    return constructor.deserialize(serialized) as T;
  }
  if (!("version" in original) && constructor.from) {
    return constructor.from(serialized) as T;
  }
  throw new Error("Unsupported Solana transaction type returned by Privy");
}

type BrowserAnchorWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]>;
};

export type SponsorAwareProvider = AnchorProvider & {
  sponsorPayer?: PublicKey;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

async function relaySponsoredTransaction(input: {
  transaction: Uint8Array;
  walletAddress: string;
  lastValidBlockHeight: number;
}): Promise<string> {
  if (!solanaConfig.apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured for sponsorship.");
  }
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Your Privy session expired. Sign in again.");

  const sponsorUrl = `${solanaConfig.apiUrl.replace(/\/$/, "")}/api/transactions/sponsor`;
  let response: Response;
  try {
    response = await fetch(sponsorUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: toBase64(input.transaction),
        walletAddress: input.walletAddress,
        lastValidBlockHeight: input.lastValidBlockHeight,
      }),
    });
  } catch (cause) {
    console.error("Gas sponsor unreachable", sponsorUrl, cause);
    throw new Error(
      "The gas sponsorship server is unreachable, so nothing was sent. Try again in a minute."
    );
  }
  const body = (await response.json().catch(() => null)) as
    | { signature?: string; error?: string; code?: string }
    | null;
  if (!response.ok || !body?.signature) {
    console.error("Sponsored transaction rejected", response.status, body);
    if (response.status === 401) {
      throw new Error(
        `Gas sponsorship rejected your sign-in token. Sign out and in again; if it persists, check the backend's Privy settings at ${solanaConfig.apiUrl.replace(/\/$/, "")}/api/health.` +
          (body?.error ? ` Server said: ${body.error}` : "")
      );
    }
    if (response.status >= 502 && !body?.error) {
      throw new Error("The gas sponsorship server is starting or down. Try again in a minute.");
    }
    throw new Error(body?.error ?? `Sponsor rejected the transaction (${response.status}).`);
  }
  return body.signature;
}

export function SolanaProgramProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const solanaWallet = selectSolanaWallet(wallets);

  const connection = useMemo(
    () => new Connection(RPC_ENDPOINT, "confirmed"),
    []
  );

  const anchorWallet = useMemo<BrowserAnchorWallet | undefined>(() => {
    if (!solanaWallet) return undefined;

    const embedded = isPrivyEmbeddedWallet(solanaWallet);
    const signForAnchor = async <T extends Transaction | VersionedTransaction>(
      transaction: T
    ): Promise<T> => {
      const quiet = embedded && isGameplayOnly(transaction);
      const { signedTransaction } = await signTransaction({
        transaction: serializeTransaction(transaction),
        wallet: solanaWallet,
        chain: PRIVY_SOLANA_CHAIN,
        options: {
          uiOptions: { showWalletUIs: !quiet },
        },
      });
      return deserializeSignedTransaction(transaction, signedTransaction);
    };

    return {
      publicKey: new PublicKey(solanaWallet.address),
      signTransaction: signForAnchor,
      signAllTransactions: (transactions) =>
        Promise.all(transactions.map(signForAnchor)),
    };
  }, [signTransaction, solanaWallet]);

  const provider = useMemo(() => {
    if (!anchorWallet) return { connection };

    const baseProvider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    }) as SponsorAwareProvider;

    const embeddedWallet = solanaWallet
      ? isPrivyEmbeddedWallet(solanaWallet)
      : false;
    // The backend fee payer covers every wallet, embedded or external;
    // players only ever pay their wager.
    const backendSponsored = solanaConfig.sponsorMode === "backend";
    if (backendSponsored) baseProvider.sponsorPayer = getBackendFeePayer();

    // Anchor normally prepares fee payer + blockhash inside sendAndConfirm.
    // Because sponsored transactions must go through Privy's hook, reproduce
    // that preparation explicitly before serialization and signing.
    baseProvider.sendAndConfirm = async (
      tx: Transaction | VersionedTransaction,
      signers?: Signer[],
      options = baseProvider.opts
    ) => {
      const wallet = solanaWallet;
      if (!wallet) throw new Error("No Solana wallet connected");

      let lastValidBlockHeight: number | undefined;

      if ("version" in tx) {
        if (backendSponsored) {
          throw new Error("Backend sponsorship currently requires a legacy Solana transaction.");
        }
        if (signers?.length) tx.sign(signers);
      } else {
        if (
          backendSponsored &&
          !tx.instructions.some((instruction) =>
            instruction.keys.some(
              (key) => key.isSigner && key.pubkey.equals(anchorWallet.publicKey)
            )
          )
        ) {
          tx.add(
            new TransactionInstruction({
              programId: MEMO_PROGRAM_ID,
              keys: [
                {
                  pubkey: anchorWallet.publicKey,
                  isSigner: true,
                  isWritable: false,
                },
              ],
              data: new TextEncoder().encode(
                SPONSOR_AUTHORIZATION_MEMO
              ) as Buffer,
            })
          );
        }
        const latest = await connection.getLatestBlockhash(
          options.preflightCommitment ?? "confirmed"
        );
        tx.feePayer = backendSponsored
          ? getBackendFeePayer()
          : new PublicKey(wallet.address);
        tx.recentBlockhash = latest.blockhash;
        tx.lastValidBlockHeight = latest.lastValidBlockHeight;
        lastValidBlockHeight = latest.lastValidBlockHeight;
        signers?.forEach((signer) => tx.partialSign(signer));
      }

      if (backendSponsored) {
        if (!("version" in tx) && lastValidBlockHeight) {
          const signed = await anchorWallet.signTransaction(tx);
          return relaySponsoredTransaction({
            transaction: serializeTransaction(signed),
            walletAddress: wallet.address,
            lastValidBlockHeight,
          });
        }
        throw new Error("Unable to prepare the sponsored Solana transaction.");
      }

      const sponsored = embeddedWallet;
      const { signature } = await signAndSendTransaction({
        transaction: serializeTransaction(tx),
        wallet,
        chain: PRIVY_SOLANA_CHAIN,
        options: {
          sponsor: sponsored,
          // Privy's sponsorship service simulates with the final fee payer.
          skipSimulation: false,
          uiOptions: {
            showWalletUIs: true,
            description: sponsored
              ? "ZUG is sponsoring this Solana devnet transaction."
              : "Review this Solana devnet transaction in your wallet.",
          },
        },
      });

      return bs58.encode(signature);
    };

    return baseProvider;
  }, [anchorWallet, connection, signAndSendTransaction, solanaWallet]);

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
      <MagicSessionProvider>{children}</MagicSessionProvider>
    </MagicChessProvider>
  );
}
