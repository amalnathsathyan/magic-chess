import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import type { MagicChessClient } from "@magic-chess/sdk";
import { WRAPPED_SOL_MINT } from "@/lib/solana-config";

type TransactionProvider = {
  connection?: Pick<Connection, "getBalance">;
  sendAndConfirm?: (transaction: Transaction) => Promise<string>;
  sponsorPayer?: PublicKey;
};

export function getTransactionPayer(
  client: MagicChessClient,
  wallet: PublicKey
): PublicKey {
  const provider = client.program.provider as TransactionProvider;
  return provider.sponsorPayer ?? wallet;
}

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

  const provider = client.program.provider as TransactionProvider;
  if (typeof provider.sendAndConfirm !== "function") {
    throw new Error("A connected Solana wallet is required to prepare the wager.");
  }

  if (mint.equals(WRAPPED_SOL_MINT) && amount > 0n) {
    if (!provider.connection) {
      throw new Error("The Solana connection is unavailable. Try again shortly.");
    }

    const balance = await provider.connection.getBalance(owner, "confirmed");
    if (BigInt(balance) < amount) {
      const requiredSol = Number(amount) / 1_000_000_000;
      throw new Error(
        `This wager needs ${requiredSol} SOL in your wallet. Gas sponsorship covers network fees, not the wager. Fund the wallet or create a free match.`
      );
    }
  }

  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);
  const payer = provider.sponsorPayer ?? owner;
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
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

  await provider.sendAndConfirm(transaction);
  return tokenAccount;
}

/**
 * Build the wager ATA creation instruction(s) without sending.
 *
 * Use this when you need to bundle the ATA prep into a larger transaction
 * alongside join / delegate instructions — everything goes out in one wallet
 * approval instead of two or three.
 *
 * For the native-SOL mint the returned array also includes the SOL transfer
 * and syncNative instructions so the ATA is funded before the join CPI.
 */
export async function buildWagerInstruction(
  client: MagicChessClient,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint
): Promise<{
  instructions: TransactionInstruction[];
  tokenAccount: PublicKey;
  payer: PublicKey;
}> {
  if (amount < 0n) throw new Error("Wager cannot be negative.");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Wager amount is too large for this browser client.");
  }

  const provider = client.program.provider as TransactionProvider;

  if (mint.equals(WRAPPED_SOL_MINT) && amount > 0n) {
    if (!provider.connection) {
      throw new Error("The Solana connection is unavailable. Try again shortly.");
    }

    const balance = await provider.connection.getBalance(owner, "confirmed");
    if (BigInt(balance) < amount) {
      const requiredSol = Number(amount) / 1_000_000_000;
      throw new Error(
        `This wager needs ${requiredSol} SOL in your wallet. Gas sponsorship covers network fees, not the wager. Fund the wallet or create a free match.`
      );
    }
  }

  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);
  const payer = provider.sponsorPayer ?? owner;
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      tokenAccount,
      owner,
      mint
    ),
  ];

  if (mint.equals(WRAPPED_SOL_MINT) && amount > 0n) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: tokenAccount,
        lamports: Number(amount),
      }),
      createSyncNativeInstruction(tokenAccount)
    );
  }

  return { instructions, tokenAccount, payer };
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
  const provider = client.program.provider as TransactionProvider;
  const transactionPayer = provider.sponsorPayer ?? payer;
  accounts.forEach((account, index) => {
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        transactionPayer,
        account,
        owners[index],
        mint
      )
    );
  });

  if (typeof provider.sendAndConfirm !== "function") {
    throw new Error("A connected Solana wallet is required to prepare settlement.");
  }
  await provider.sendAndConfirm(transaction);
  return accounts;
}
