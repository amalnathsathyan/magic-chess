import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { config } from "../config.js";
import { sql } from "../db/pool.js";
import { readLiveMatchState, type LiveMatchState } from "./matchState.js";
import { loadFeePayer, confirmFast } from "./solanaSponsor.js";
import { isFreshPlayerProof, verifySolanaMessageSignature } from "./walletProof.js";

/**
 * ZUGCON rewards: a mainnet memecoin sent to both players of a finished
 * devnet game. The creator (white) gets `creatorAmount`, the joiner (black)
 * `joinerAmount`. A claim needs
 *  1. a finished game with an opponent (never Aborted or WaitingForOpponent),
 *  2. the same result on the devnet chain, read live from the match account
 *     (or, once the account is closed after settlement, the settled row),
 *  3. a message signed by the claiming wallet,
 *  4. room under the per-day caps.
 * One `reward_claims` row per (match, role) is written before the transfer
 * goes out, so a retry after a crash can never pay the same seat twice.
 */

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const CREATE_IDEMPOTENT_ATA_INSTRUCTION = 1;
const TRANSFER_CHECKED_INSTRUCTION = 12;

export type RewardRole = "creator" | "joiner";
export type ClaimStatus = "pending" | "sent" | "failed";

export class RewardError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "reward_unavailable"
  ) {
    super(message);
    this.name = "RewardError";
  }
}

export interface RewardSettings {
  enabled: boolean;
  mint: string;
  symbol: string;
  decimals: number;
  creatorAmount: number;
  joinerAmount: number;
  minPlies: number;
  dailyGamesPerWallet: number;
  dailyGamesPerPair: number;
}

export function rewardSettings(): RewardSettings {
  const r = config.rewards;
  return {
    enabled: r.enabled && Boolean(r.mint) && Boolean(r.walletAddress),
    mint: r.mint,
    symbol: r.symbol,
    decimals: r.decimals,
    creatorAmount: r.creatorAmount,
    joinerAmount: r.joinerAmount,
    minPlies: r.minPlies,
    dailyGamesPerWallet: r.dailyGamesPerWallet,
    dailyGamesPerPair: r.dailyGamesPerPair,
  };
}

/** The exact text the wallet signs. The backend rebuilds it; nothing is trusted from the client. */
export function rewardClaimMessage(matchId: string, wallet: string, issuedAt: number): string {
  return [
    "ZUG Arena reward claim",
    `match:${matchId}`,
    `wallet:${wallet}`,
    `issued-at:${issuedAt}`,
  ].join("\n");
}

/** What the index knows about the game. */
export interface RewardMatchRow {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  gameStatus: string;
  plies: number;
  payoutProcessed: boolean;
  endedAt: Date | null;
}

export interface Eligibility {
  eligible: boolean;
  role: RewardRole | null;
  /** Whole tokens. */
  amount: number;
  /** Why not, worded for the player. Null when eligible. */
  reason: string | null;
  /** Machine-readable reason. */
  code:
    | null
    | "not_player"
    | "no_opponent"
    | "not_finished"
    | "aborted"
    | "too_short"
    | "chain_mismatch"
    | "chain_unavailable"
    | "daily_cap"
    | "pair_cap";
}

const TERMINAL = new Set(["WhiteWins", "BlackWins", "Draw"]);
const CHAIN_TERMINAL = new Set(["whiteWins", "blackWins", "draw"]);

function dbToChainStatus(status: string): string {
  return status.charAt(0).toLowerCase() + status.slice(1);
}

/**
 * Pure eligibility rule over the index row and the live chain read.
 * `live` is the on-chain account (null once it is closed), or "unavailable"
 * when the chain couldn't be read right now.
 */
export function decideEligibility(
  row: RewardMatchRow,
  wallet: string,
  live: LiveMatchState | null | "unavailable",
  settings: Pick<RewardSettings, "creatorAmount" | "joinerAmount" | "minPlies">
): Eligibility {
  const role: RewardRole | null =
    row.whitePlayer === wallet ? "creator" : row.blackPlayer === wallet ? "joiner" : null;
  const amount = role === "creator" ? settings.creatorAmount : role === "joiner" ? settings.joinerAmount : 0;
  const no = (code: NonNullable<Eligibility["code"]>, reason: string): Eligibility => ({
    eligible: false,
    role,
    amount,
    reason,
    code,
  });

  if (!role) return no("not_player", "Only the two players of this game can claim.");
  if (!row.blackPlayer) return no("no_opponent", "Nobody joined this game, so there is nothing to claim.");
  if (row.gameStatus === "Aborted") return no("aborted", "Aborted games earn no reward.");
  if (!TERMINAL.has(row.gameStatus)) return no("not_finished", "Finish the game first.");
  if (row.plies < settings.minPlies) {
    return no("too_short", `Games under ${Math.ceil(settings.minPlies / 2)} moves earn no reward.`);
  }

  if (live === "unavailable") {
    return no("chain_unavailable", "We couldn't read the result from Solana just now. Try again in a moment.");
  }
  if (live) {
    const [white, black] = live.players;
    if (white !== row.whitePlayer || black !== row.blackPlayer) {
      return no("chain_mismatch", "The players on chain don't match this game.");
    }
    if (!CHAIN_TERMINAL.has(live.gameStatus) || live.gameStatus !== dbToChainStatus(row.gameStatus)) {
      return no("chain_mismatch", "The result on Solana doesn't match yet. Try again in a moment.");
    }
  } else if (!row.payoutProcessed) {
    // No account and no settlement on record: the index can't be trusted alone.
    return no("chain_mismatch", "This game isn't on Solana anymore and was never settled.");
  }

  return { eligible: true, role, amount, reason: null, code: null };
}

export interface ClaimRow {
  matchId: string;
  role: RewardRole;
  wallet: string;
  amount: string;
  status: ClaimStatus;
  txSignature: string | null;
  error: string | null;
}

export async function loadMatchRow(matchId: string): Promise<RewardMatchRow | null> {
  const rows = await sql`
    SELECT match_id, white_player, black_player, game_status, payout_processed, ended_at,
      GREATEST(COALESCE(m.ply_count, 0), (SELECT COUNT(*) FROM moves WHERE moves.match_id = m.match_id)) AS plies
    FROM matches m WHERE match_id = ${matchId}
  `;
  const m = rows[0] as Record<string, unknown> | undefined;
  if (!m) return null;
  return {
    matchId: String(m.matchId),
    whitePlayer: String(m.whitePlayer),
    blackPlayer: (m.blackPlayer as string | null) ?? null,
    gameStatus: String(m.gameStatus),
    plies: Number(m.plies ?? 0),
    payoutProcessed: Boolean(m.payoutProcessed),
    endedAt: (m.endedAt as Date | null) ?? null,
  };
}

export async function loadClaim(matchId: string, role: RewardRole): Promise<ClaimRow | null> {
  const rows = await sql`
    SELECT match_id, role, wallet, amount, status, tx_signature, error
    FROM reward_claims WHERE match_id = ${matchId} AND role = ${role}
  `;
  const c = rows[0] as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    matchId: String(c.matchId),
    role: c.role as RewardRole,
    wallet: String(c.wallet),
    amount: String(c.amount),
    status: c.status as ClaimStatus,
    txSignature: (c.txSignature as string | null) ?? null,
    error: (c.error as string | null) ?? null,
  };
}

/** Rewarded games today for this wallet, and against this opponent. */
async function dailyCounts(wallet: string, opponent: string): Promise<{ wallet: number; pair: number }> {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE c.wallet = ${wallet}) AS wallet_count,
      COUNT(*) FILTER (
        WHERE c.wallet = ${wallet}
          AND (m.white_player = ${opponent} OR m.black_player = ${opponent})
      ) AS pair_count
    FROM reward_claims c
    JOIN matches m ON m.match_id = c.match_id
    WHERE c.status <> 'failed'
      AND c.created_at >= date_trunc('day', NOW() AT TIME ZONE 'utc') AT TIME ZONE 'utc'
  `;
  const r = rows[0] as Record<string, unknown>;
  return { wallet: Number(r.walletCount ?? 0), pair: Number(r.pairCount ?? 0) };
}

async function readChain(matchId: string): Promise<LiveMatchState | null | "unavailable"> {
  try {
    return await readLiveMatchState(matchId);
  } catch {
    return "unavailable";
  }
}

export interface RewardStatus {
  enabled: boolean;
  mint: string | null;
  symbol: string;
  eligibility: Eligibility | null;
  claim: ClaimRow | null;
}

/** Everything the banner needs: whether to show, how much, and what happened. */
export async function rewardStatus(matchId: string, wallet: string | null): Promise<RewardStatus> {
  const settings = rewardSettings();
  const base: RewardStatus = {
    enabled: settings.enabled,
    mint: settings.enabled ? settings.mint : null,
    symbol: settings.symbol,
    eligibility: null,
    claim: null,
  };
  if (!settings.enabled || !wallet) return base;
  const row = await loadMatchRow(matchId);
  if (!row) return base;

  // Cheap checks first; only a finished game with the right wallet costs an RPC read.
  let eligibility = decideEligibility(row, wallet, null, settings);
  if (eligibility.role && (eligibility.eligible || eligibility.code === "chain_mismatch")) {
    eligibility = decideEligibility(row, wallet, await readChain(matchId), settings);
  }
  const claim = eligibility.role ? await loadClaim(matchId, eligibility.role) : null;
  if (eligibility.eligible && !claim && row.blackPlayer) {
    const opponent = eligibility.role === "creator" ? row.blackPlayer : row.whitePlayer;
    const counts = await dailyCounts(wallet, opponent);
    if (counts.wallet >= settings.dailyGamesPerWallet) {
      eligibility = { ...eligibility, eligible: false, code: "daily_cap", reason: "You've claimed today's limit. Come back tomorrow." };
    } else if (counts.pair >= settings.dailyGamesPerPair) {
      eligibility = { ...eligibility, eligible: false, code: "pair_cap", reason: "You've claimed today's limit against this opponent. Play someone else." };
    }
  }
  return { ...base, eligibility, claim };
}

export function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isInteger(amount) || amount < 0) throw new RewardError("Reward amount must be a whole number", 500);
  return BigInt(amount) * 10n ** BigInt(decimals);
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Create the recipient's token account if needed, then `transfer_checked`
 * from the reward wallet. The reward wallet signs and pays the fee.
 */
export function buildRewardTransfer(args: {
  rewardWallet: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
}): TransactionInstruction[] {
  const source = associatedTokenAddress(args.rewardWallet, args.mint);
  const destination = associatedTokenAddress(args.recipient, args.mint);
  const createAta = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: args.rewardWallet, isSigner: true, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: args.recipient, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CREATE_IDEMPOTENT_ATA_INSTRUCTION]),
  });
  const data = Buffer.alloc(10);
  data[0] = TRANSFER_CHECKED_INSTRUCTION;
  data.writeBigUInt64LE(args.amount, 1);
  data[9] = args.decimals;
  const transfer = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: args.rewardWallet, isSigner: true, isWritable: false },
    ],
    data,
  });
  return [createAta, transfer];
}

let rewardWallet: Keypair | null = null;
let mainnet: Connection | null = null;

function wallet(): Keypair {
  if (!rewardWallet) {
    try {
      rewardWallet = loadFeePayer(config.rewards.walletPrivateKey, config.rewards.walletAddress);
    } catch (error) {
      throw new RewardError(
        `ZUGCON reward wallet is not configured (${error instanceof Error ? error.message : String(error)})`,
        503
      );
    }
  }
  return rewardWallet;
}

function connection(): Connection {
  if (!mainnet) mainnet = new Connection(config.rewards.rpcEndpoint, "confirmed");
  return mainnet;
}

async function sendReward(
  recipient: string,
  amount: bigint,
  onBroadcast: (signature: string) => Promise<void>
): Promise<string> {
  const payer = wallet();
  const conn = connection();
  const transaction = new Transaction().add(
    ...buildRewardTransfer({
      rewardWallet: payer.publicKey,
      recipient: new PublicKey(recipient),
      mint: new PublicKey(config.rewards.mint),
      amount,
      decimals: config.rewards.decimals,
    })
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer.publicKey;
  transaction.sign(payer);
  const signature = await conn.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  // Record the signature before waiting, so a crash mid-confirmation is
  // checked against the chain on retry instead of paid again.
  await onBroadcast(signature);
  const confirmation = await confirmFast(conn, { signature, blockhash, lastValidBlockHeight });
  if (confirmation.value.err) {
    throw new RewardError(`Transfer failed on chain: ${JSON.stringify(confirmation.value.err)}`, 502, "transfer_failed");
  }
  return signature;
}

let claimChain: Promise<unknown> = Promise.resolve();

/** A pending row older than this is treated as crashed and retried. */
const STALE_PENDING_MS = 2 * 60_000;

export async function claimReward(args: {
  matchId: string;
  wallet: string;
  issuedAt: number;
  signature: string;
}): Promise<ClaimRow> {
  const settings = rewardSettings();
  if (!settings.enabled) throw new RewardError("ZUGCON rewards aren't on right now", 503);
  if (!isFreshPlayerProof(args.issuedAt)) {
    throw new RewardError("The signature expired. Claim again.", 401, "unauthorized");
  }
  if (
    !verifySolanaMessageSignature(
      args.wallet,
      rewardClaimMessage(args.matchId, args.wallet, args.issuedAt),
      args.signature
    )
  ) {
    throw new RewardError("The wallet signature didn't match.", 401, "unauthorized");
  }

  const status = await rewardStatus(args.matchId, args.wallet);
  const { eligibility } = status;
  if (!eligibility?.role) throw new RewardError("Only the two players of this game can claim.", 403, "not_player");
  if (status.claim?.status === "sent") return status.claim;
  if (!eligibility.eligible) {
    throw new RewardError(eligibility.reason ?? "Not eligible", 409, eligibility.code ?? "not_eligible");
  }
  const role = eligibility.role;
  const amount = toBaseUnits(eligibility.amount, settings.decimals);

  // Transfers go out one at a time: the wallet's blockhash/nonce handling is
  // simpler and a burst of claims can't overrun the RPC.
  const run = claimChain.then(async (): Promise<ClaimRow> => {
    // Insert-or-take-over the row before anything leaves the process.
    const claimed = await sql`
      INSERT INTO reward_claims (match_id, role, wallet, mint, amount, status)
      VALUES (${args.matchId}, ${role}, ${args.wallet}, ${settings.mint}, ${amount.toString()}, 'pending')
      ON CONFLICT (match_id, role) DO UPDATE
        SET status = 'pending', error = NULL, updated_at = NOW()
        WHERE reward_claims.status = 'failed'
          OR (reward_claims.status = 'pending'
              AND reward_claims.updated_at < NOW() - make_interval(secs => ${STALE_PENDING_MS / 1000}))
      RETURNING match_id, role, wallet, amount, status, tx_signature, error
    `;
    const existing = claimed[0] as Record<string, unknown> | undefined;
    if (!existing) {
      const row = await loadClaim(args.matchId, role);
      if (row?.status === "sent") return row;
      throw new RewardError("This reward is already being sent. Check back in a minute.", 409, "claim_in_progress");
    }
    if (existing.wallet !== args.wallet) {
      // The seat's wallet is fixed by the match; a row with another wallet is corrupt.
      throw new RewardError("This seat's reward belongs to a different wallet.", 409, "wallet_mismatch");
    }
    // A retried row that already has a signature may have landed: never pay twice.
    const previous = existing.txSignature as string | null;
    if (previous) {
      const { value } = await connection().getSignatureStatuses([previous], { searchTransactionHistory: true });
      const found = value[0];
      if (found && !found.err) {
        await sql`UPDATE reward_claims SET status = 'sent', updated_at = NOW()
          WHERE match_id = ${args.matchId} AND role = ${role}`;
        return (await loadClaim(args.matchId, role))!;
      }
    }

    try {
      const signature = await sendReward(args.wallet, amount, async (sig) => {
        await sql`UPDATE reward_claims SET tx_signature = ${sig}, updated_at = NOW()
          WHERE match_id = ${args.matchId} AND role = ${role}`;
      });
      await sql`UPDATE reward_claims SET status = 'sent', tx_signature = ${signature}, error = NULL, updated_at = NOW()
        WHERE match_id = ${args.matchId} AND role = ${role}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`UPDATE reward_claims SET status = 'failed', error = ${message.slice(0, 500)}, updated_at = NOW()
        WHERE match_id = ${args.matchId} AND role = ${role}`;
      throw error instanceof RewardError
        ? error
        : new RewardError(`The transfer didn't go through: ${message}`, 502, "transfer_failed");
    }
    return (await loadClaim(args.matchId, role))!;
  });
  claimChain = run.catch(() => undefined);
  return run;
}

/** Reward wallet balances, for /api/health and the ops runbook. */
export async function rewardWalletReport(): Promise<{
  address: string | null;
  mint: string | null;
  solLamports: string | null;
  tokenBalance: string | null;
  error: string | null;
}> {
  const settings = rewardSettings();
  if (!settings.enabled) return { address: null, mint: null, solLamports: null, tokenBalance: null, error: null };
  try {
    const owner = new PublicKey(config.rewards.walletAddress);
    const mint = new PublicKey(settings.mint);
    const conn = connection();
    const [lamports, token] = await Promise.all([
      conn.getBalance(owner, "confirmed"),
      conn.getTokenAccountBalance(associatedTokenAddress(owner, mint), "confirmed").catch(() => null),
    ]);
    return {
      address: owner.toBase58(),
      mint: mint.toBase58(),
      solLamports: String(lamports),
      tokenBalance: token?.value.uiAmountString ?? "0",
      error: null,
    };
  } catch (error) {
    return {
      address: config.rewards.walletAddress || null,
      mint: settings.mint,
      solLamports: null,
      tokenBalance: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
