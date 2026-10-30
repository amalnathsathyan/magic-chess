import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import type { MagicChessClient } from "@magic-chess/sdk";
import { WRAPPED_SOL_MINT } from "@/lib/solana-config";

type TransactionProvider = {
  connection?: Pick<Connection, "getBalance" | "getTokenAccountBalance">;
  sponsorPayer?: PublicKey;
};

/** "1.5 ZUG" from raw units, for error messages. */
function formatUnits(raw: bigint, decimals: number, symbol: string | null): string {
  const base = 10n ** BigInt(decimals);
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const amount = fraction ? `${raw / base}.${fraction}` : (raw / base).toString();
  return symbol ? `${amount} ${symbol}` : `${amount} tokens`;
}

export function getTransactionPayer(
  client: MagicChessClient,
  wallet: PublicKey
): PublicKey {
  const provider = client.program.provider as TransactionProvider;
  return provider.sponsorPayer ?? wallet;
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
  amount: bigint,
  options?: { symbol?: string | null; decimals?: number | null }
): Promise<{
  instructions: TransactionInstruction[];
  tokenAccount: PublicKey;
  payer: PublicKey;
}> {
  if (amount < 0n) throw new Error("The stake can't be negative.");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("That stake is too large.");
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
        `This stake needs ${requiredSol} SOL in your wallet. Network fees are covered, the stake is not. Add SOL or create a free match.`
      );
    }
  }

  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);

  // Any other token: check the balance up front, so the player reads "you
  // need X" instead of a failed transaction's error code.
  if (!mint.equals(WRAPPED_SOL_MINT) && amount > 0n && provider.connection) {
    // A missing token account means nothing held. Any other failure (RPC
    // down) skips the check rather than wrongly refusing the stake.
    const held = await provider.connection
      .getTokenAccountBalance(tokenAccount, "confirmed")
      .then((result): { amount: string; decimals: number } | null => result.value)
      .catch((cause: unknown) =>
        /could not find|invalid param|account not found/i.test(String(cause)) ? null : undefined
      );
    const balance = held === undefined ? null : held ? BigInt(held.amount) : 0n;
    if (balance !== null && balance < amount) {
      const decimals = held?.decimals ?? options?.decimals ?? 0;
      const need = formatUnits(amount, decimals, options?.symbol ?? null);
      throw new Error(
        balance === 0n
          ? `This stake needs ${need}, and this wallet holds none. Get some first or create a free match.`
          : `This stake needs ${need}; this wallet holds ${formatUnits(balance, decimals, options?.symbol ?? null)}.`
      );
    }
  }

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

/**
 * Idempotently create every payout ATA settlement needs, as instructions to
 * bundle into the settlement transaction (the sponsor only pays for ATAs
 * that a Magic Chess instruction in the same transaction consumes).
 */
export function buildSettlementInstructions(
  client: MagicChessClient,
  payer: PublicKey,
  mint: PublicKey,
  owners: [PublicKey, PublicKey, PublicKey]
): {
  accounts: [PublicKey, PublicKey, PublicKey];
  instructions: TransactionInstruction[];
  /** Where the escrow's rent goes back: the sponsor if it paid it. */
  rentRecipient: PublicKey;
} {
  const accounts = owners.map((owner) =>
    getAssociatedTokenAddressSync(mint, owner)
  ) as [PublicKey, PublicKey, PublicKey];
  const provider = client.program.provider as TransactionProvider;
  const transactionPayer = provider.sponsorPayer ?? payer;
  const seen = new Set<string>();
  const instructions: TransactionInstruction[] = [];
  accounts.forEach((account, index) => {
    if (seen.has(account.toBase58())) return;
    seen.add(account.toBase58());
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        transactionPayer,
        account,
        owners[index],
        mint
      )
    );
  });
  return { accounts, instructions, rentRecipient: transactionPayer };
}
