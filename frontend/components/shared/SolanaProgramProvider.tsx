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

  const response = await fetch(
    `${solanaConfig.apiUrl.replace(/\/$/, "")}/api/transactions/sponsor`,
    {
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
    }
  );
  const body = (await response.json().catch(() => null)) as
    | { signature?: string; error?: string }
    | null;
  if (!response.ok || !body?.signature) {
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

    const signForAnchor = async <T extends Transaction | VersionedTransaction>(
      transaction: T
    ): Promise<T> => {
      const { signedTransaction } = await signTransaction({
        transaction: serializeTransaction(transaction),
        wallet: solanaWallet,
        chain: PRIVY_SOLANA_CHAIN,
        options: {
          uiOptions: { showWalletUIs: true },
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
    const backendSponsored =
      embeddedWallet && solanaConfig.sponsorMode === "backend";
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
              ? "Magic Chess is sponsoring this Solana devnet transaction."
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
