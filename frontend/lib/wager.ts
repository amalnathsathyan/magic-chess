import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import type { MagicChessClient } from "@magic-chess/sdk";
import { WRAPPED_SOL_MINT } from "@/lib/solana-config";

type TransactionProvider = {
  sendAndConfirm?: (transaction: Transaction) => Promise<string>;
};

/**
 * Create the wager ATA and, for the configured native-SOL mint, wrap exactly
 * the amount the next match instruction will transfer into escrow.
 */
export async function prepareWagerAccount(
  client: MagicChessClient,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint
): Promise<PublicKey> {
  if (amount < 0n) throw new Error("Wager cannot be negative.");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Wager amount is too large for this browser client.");
  }

  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      tokenAccount,
      owner,
      mint
    )
  );

  if (mint.equals(WRAPPED_SOL_MINT) && amount > 0n) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: tokenAccount,
        lamports: Number(amount),
      }),
      createSyncNativeInstruction(tokenAccount)
    );
  }

  const provider = client.program.provider as TransactionProvider;
  if (typeof provider.sendAndConfirm !== "function") {
    throw new Error("A connected Solana wallet is required to prepare the wager.");
  }
  await provider.sendAndConfirm(transaction);
  return tokenAccount;
}

/** Create required recipient ATAs idempotently before settlement. */
export async function prepareSettlementAccounts(
  client: MagicChessClient,
  payer: PublicKey,
  mint: PublicKey,
  owners: [PublicKey, PublicKey, PublicKey]
): Promise<[PublicKey, PublicKey, PublicKey]> {
  const accounts = owners.map((owner) =>
    getAssociatedTokenAddressSync(mint, owner)
  ) as [PublicKey, PublicKey, PublicKey];
  const transaction = new Transaction();
  accounts.forEach((account, index) => {
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        account,
        owners[index],
        mint
      )
    );
  });

  const provider = client.program.provider as TransactionProvider;
  if (typeof provider.sendAndConfirm !== "function") {
    throw new Error("A connected Solana wallet is required to prepare settlement.");
  }
  await provider.sendAndConfirm(transaction);
  return accounts;
}
