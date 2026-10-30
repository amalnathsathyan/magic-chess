/**
 * Devnet ZUG faucet.
 *
 * Testers on devnet hold no SOL and no tokens, so the app hands out a devnet
 * SPL token ("ZUG") to stake with: a signup bonus on the first claim and a
 * smaller drip once per UTC day after that. The whole supply sits in one
 * treasury wallet whose key the backend holds; it signs the token transfer,
 * and the gas-sponsor fee payer pays the fee and the player's token-account
 * rent, so the treasury itself needs no SOL. Claims run until it is empty.
 *
 * Devnet only. Delete this file, `routes/faucet.ts`, migration 010 and the
 * `faucet` config block when the app moves to mainnet.
 */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Sql } from "postgres";
import { confirmFast, loadFeePayer, parseSecretKey } from "./solanaSponsor.js";

export type FaucetClaimKind = "signup" | "daily";

export class FaucetError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "faucet_error"
  ) {
    super(message);
    this.name = "FaucetError";
  }
}

export interface FaucetOptions {
  enabled: boolean;
  mint: string;
  treasuryPrivateKey: string;
  feePayerPrivateKey: string;
  feePayerAddress: string;
  signupAmount: number;
  dailyAmount: number;
}

/** What a wallet has already claimed, as read from `faucet_claims`. */
export interface ClaimHistory {
  /** UTC day (YYYY-MM-DD) of the signup bonus, if it was paid. */
  signupDay: string | null;
  /** UTC day (YYYY-MM-DD) of the latest daily drip, if any. */
  lastDailyDay: string | null;
}

export interface ClaimDecision {
  available: FaucetClaimKind | null;
  /** When the next claim opens (the next UTC midnight) while none is available. */
  nextAt: string | null;
}

/** YYYY-MM-DD in UTC. */
export function utcDay(at: Date | number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The next UTC midnight after `at`. */
export function nextUtcMidnight(at: Date | number = Date.now()): Date {
  const date = new Date(at);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  );
}

/**
 * The first claim is the signup bonus. From the next UTC day on, one daily
 * drip per day. The signup day itself has no extra daily claim.
 */
export function decideClaim(history: ClaimHistory, now: Date | number = Date.now()): ClaimDecision {
  if (!history.signupDay) return { available: "signup", nextAt: null };
  const today = utcDay(now);
  if (history.signupDay === today || history.lastDailyDay === today) {
    return { available: null, nextAt: nextUtcMidnight(now).toISOString() };
  }
  return { available: "daily", nextAt: null };
}

export function tokenAmountToBase(whole: number, decimals: number): bigint {
  if (!Number.isInteger(whole) || whole < 0) {
    throw new Error(`Faucet amount must be a whole number of tokens, got ${whole}`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals);
}

export function formatBaseAmount(base: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = base / unit;
  const fraction = (base % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export interface ClaimTransactionInput {
  feePayer: PublicKey;
  treasury: PublicKey;
  mint: PublicKey;
  decimals: number;
  recipient: PublicKey;
  amount: bigint;
}

/**
 * The claim transaction: create the player's token account if missing (rent
 * from the fee payer) and move `amount` from the treasury's token account.
 */
export function buildClaimInstructions(input: ClaimTransactionInput): TransactionInstruction[] {
  const source = getAssociatedTokenAddressSync(input.mint, input.treasury);
  const destination = getAssociatedTokenAddressSync(input.mint, input.recipient);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      input.feePayer,
      destination,
      input.recipient,
      input.mint
    ),
    createTransferCheckedInstruction(
      source,
      input.mint,
      destination,
      input.treasury,
      input.amount,
      input.decimals
    ),
  ];
}

export interface FaucetPublicStatus {
  enabled: true;
  mint: string;
  symbol: string;
  decimals: number;
  signupAmount: number;
  dailyAmount: number;
  /** Whole tokens left in the treasury, or null when the RPC didn't answer. */
  treasuryRemaining: string | null;
}

export interface FaucetWalletStatus extends ClaimDecision {
  signupClaimed: boolean;
  /** Whole tokens this wallet has received so far. */
  totalClaimed: string;
}

export interface FaucetClaimResult {
  kind: FaucetClaimKind;
  amount: number;
  signature: string;
}

interface DbClaimRow {
  kind: FaucetClaimKind;
  claimDay: string | Date;
  amount: string;
}

type ClaimDb = Pick<Sql, "unsafe">;

const TREASURY_CACHE_MS = 30_000;

export class FaucetService {
  readonly symbol = "ZUG";
  private readonly connection: Connection;
  private readonly feePayer: Keypair;
  private readonly treasury: Keypair;
  readonly mint: PublicKey;
  private decimals: number | null = null;
  private treasuryCache: { at: number; remaining: bigint | null } = { at: 0, remaining: null };

  constructor(
    rpcEndpoint: string,
    private readonly options: FaucetOptions,
    connection?: Connection
  ) {
    this.connection = connection ?? new Connection(rpcEndpoint, "confirmed");
    this.mint = new PublicKey(options.mint);
    this.feePayer = loadFeePayer(options.feePayerPrivateKey, options.feePayerAddress);
    try {
      this.treasury = parseSecretKey(options.treasuryPrivateKey, "FAUCET_TREASURY_PRIVATE_KEY");
    } catch (error) {
      throw new FaucetError(
        error instanceof Error ? error.message : "Faucet treasury key is invalid",
        503,
        "faucet_unavailable"
      );
    }
  }

  /** The faucet is on when a mint and a treasury key are configured. */
  static isConfigured(options: Pick<FaucetOptions, "enabled" | "mint" | "treasuryPrivateKey">): boolean {
    return options.enabled && Boolean(options.mint) && Boolean(options.treasuryPrivateKey);
  }

  get treasuryAddress(): PublicKey {
    return this.treasury.publicKey;
  }

  async mintDecimals(): Promise<number> {
    if (this.decimals === null) {
      const mint = await getMint(this.connection, this.mint, "confirmed");
      this.decimals = mint.decimals;
    }
    return this.decimals;
  }

  /** Whole tokens left in the treasury (cached briefly); null when unknown. */
  async treasuryRemaining(): Promise<bigint | null> {
    const now = Date.now();
    if (now - this.treasuryCache.at < TREASURY_CACHE_MS) return this.treasuryCache.remaining;
    let remaining: bigint | null = null;
    try {
      const source = getAssociatedTokenAddressSync(this.mint, this.treasury.publicKey);
      const balance = await this.connection.getTokenAccountBalance(source, "confirmed");
      remaining = BigInt(balance.value.amount);
    } catch {
      remaining = null;
    }
    this.treasuryCache = { at: now, remaining };
    return remaining;
  }

  async publicStatus(): Promise<FaucetPublicStatus> {
    const [decimals, remaining] = await Promise.all([
      this.mintDecimals().catch(() => null),
      this.treasuryRemaining(),
    ]);
    return {
      enabled: true,
      mint: this.mint.toBase58(),
      symbol: this.symbol,
      decimals: decimals ?? 6,
      signupAmount: this.options.signupAmount,
      dailyAmount: this.options.dailyAmount,
      treasuryRemaining:
        remaining !== null && decimals !== null ? formatBaseAmount(remaining, decimals) : null,
    };
  }

  async history(db: ClaimDb, wallet: string, privyUserId: string): Promise<ClaimHistory & { total: bigint }> {
    const rows = (await db.unsafe(
      `SELECT kind, claim_day AS "claimDay", amount
         FROM faucet_claims
        WHERE wallet = $1 OR privy_user_id = $2`,
      [wallet, privyUserId]
    )) as unknown as DbClaimRow[];
    let signupDay: string | null = null;
    let lastDailyDay: string | null = null;
    let total = 0n;
    for (const row of rows) {
      const day = typeof row.claimDay === "string" ? row.claimDay.slice(0, 10) : utcDay(row.claimDay);
      if (row.kind === "signup") signupDay = day;
      else if (!lastDailyDay || day > lastDailyDay) lastDailyDay = day;
      total += BigInt(row.amount);
    }
    return { signupDay, lastDailyDay, total };
  }

  async walletStatus(db: ClaimDb, wallet: string, privyUserId: string): Promise<FaucetWalletStatus> {
    const history = await this.history(db, wallet, privyUserId);
    const decimals = await this.mintDecimals().catch(() => 6);
    return {
      ...decideClaim(history),
      signupClaimed: history.signupDay !== null,
      totalClaimed: formatBaseAmount(history.total, decimals),
    };
  }

  /**
   * Pay the wallet's next claim. The claim row is written first so a second
   * request for the same day fails on the unique index instead of paying
   * twice; it is removed again if the transfer never lands.
   */
  async claim(db: ClaimDb, wallet: string, privyUserId: string): Promise<FaucetClaimResult> {
    const recipient = new PublicKey(wallet);
    const decision = decideClaim(await this.history(db, wallet, privyUserId));
    if (!decision.available) {
      throw new FaucetError(
        "You already claimed today. Come back after midnight UTC.",
        409,
        "already_claimed"
      );
    }
    const kind = decision.available;
    const whole = kind === "signup" ? this.options.signupAmount : this.options.dailyAmount;
    const decimals = await this.mintDecimals();
    const amount = tokenAmountToBase(whole, decimals);

    const remaining = await this.treasuryRemaining();
    if (remaining !== null && remaining < amount) {
      throw new FaucetError("The faucet is empty.", 503, "faucet_empty");
    }

    const inserted = (await db.unsafe(
      `INSERT INTO faucet_claims (privy_user_id, wallet, kind, claim_day, amount, mint)
       VALUES ($1, $2, $3, $4::date, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [privyUserId, wallet, kind, utcDay(), amount.toString(), this.mint.toBase58()]
    )) as unknown as Array<{ id: string }>;
    if (inserted.length === 0) {
      throw new FaucetError("This claim was already paid.", 409, "already_claimed");
    }
    const rowId = inserted[0].id;

    try {
      const signature = await this.send(
        buildClaimInstructions({
          feePayer: this.feePayer.publicKey,
          treasury: this.treasury.publicKey,
          mint: this.mint,
          decimals,
          recipient,
          amount,
        })
      );
      await db.unsafe(`UPDATE faucet_claims SET signature = $1 WHERE id = $2`, [signature, rowId]);
      this.treasuryCache = { at: 0, remaining: null };
      return { kind, amount: whole, signature };
    } catch (error) {
      await db.unsafe(`DELETE FROM faucet_claims WHERE id = $1`, [rowId]).catch(() => undefined);
      if (error instanceof FaucetError) throw error;
      throw new FaucetError(
        `The token transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        502,
        "transfer_failed"
      );
    }
  }

  private async send(instructions: TransactionInstruction[]): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: this.feePayer.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(...instructions);
    transaction.sign(this.feePayer, this.treasury);
    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    const confirmation = await confirmFast(this.connection, {
      signature,
      blockhash,
      lastValidBlockHeight,
    });
    if (confirmation.value.err) {
      throw new Error(JSON.stringify(confirmation.value.err));
    }
    return signature;
  }
}
