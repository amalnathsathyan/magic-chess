import {
  PublicKey,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { MAGICBLOCK_DEVNET_ROUTER } from "./magicblock";
import { formatRawTokenAmount } from "./wager";
import { PieceType, type ChessMatch, type Move } from "./types";
import { boardToFen, type Piece as FenPiece } from "./utils/fen";

/**
 * Settings the ZUG Arena app (https://playzug.xyz) uses on devnet. Matches
 * created with these fee terms and the wrapped-SOL mint show up in the app's
 * lobby, so people can join a match an agent opened, and the other way round.
 */
export const ZUG_DEVNET = {
  rpcUrl: "https://api.devnet.solana.com",
  routerEndpoint: MAGICBLOCK_DEVNET_ROUTER,
  /** Backend that indexes games for the lobby, Recent games and ratings. */
  apiUrl: "https://api.playzug.xyz",
  appUrl: "https://playzug.xyz",
  platformFeeWallet: new PublicKey("ByBqw1sTTPjWQx6DEAvwT4srVyr4wUdf1R4V4wGoh8j6"),
  platformFeeBasisPoints: 100,
  /** Stakes are wrapped SOL (9 decimals). */
  stakeMint: NATIVE_MINT,
  stakeDecimals: 9,
} as const;

/** Link to a match in the ZUG Arena app. */
export function zugPlayUrl(matchId: string, appUrl: string = ZUG_DEVNET.appUrl): string {
  return `${appUrl.replace(/\/$/, "")}/play?id=${encodeURIComponent(matchId)}`;
}

/** A random match id in the app's format (`mc-` + 20 hex chars, under the 32-byte limit). */
export function newMatchId(prefix = "mc-"): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  const id = prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  if (new TextEncoder().encode(id).length > 32) {
    throw new RangeError("Match ids are limited to 32 bytes; use a shorter prefix");
  }
  return id;
}

/** Parse a decimal amount ("0.05") into raw token units without floating point. */
export function parseTokenAmount(amount: string | number, decimals: number): bigint {
  const text = String(amount).trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid amount "${text}"`);
  const [, whole, fraction = ""] = match;
  if (fraction.length > decimals) {
    throw new RangeError(`Amount "${text}" has more than ${decimals} decimal places`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

const FEN_PIECE_NAMES = {
  pawn: "Pawn",
  knight: "Knight",
  bishop: "Bishop",
  rook: "Rook",
  queen: "Queen",
  king: "King",
} as const;

/** FEN of a match's current position, ready for chess.js or a UCI engine. */
export function matchToFen(match: ChessMatch): string {
  const board = match.board.map((row) =>
    row.map((piece): FenPiece | null =>
      piece
        ? {
            pieceType: FEN_PIECE_NAMES[piece.pieceType],
            color: piece.color === "white" ? "White" : "Black",
          }
        : null
    )
  );
  return boardToFen(
    board,
    match.currentTurn,
    match.castlingRights,
    match.enPassantTarget,
    match.halfmoveClock,
    match.fullmoveNumber
  );
}

const PROMOTIONS: Record<string, PieceType> = {
  q: PieceType.Queen,
  r: PieceType.Rook,
  b: PieceType.Bishop,
  n: PieceType.Knight,
};

/** Convert a UCI move ("e2e4", "e7e8q") into the program's row/col move. */
export function uciToMove(uci: string): Move {
  const match = /^([a-h])([1-8])([a-h])([1-8])([qrbn])?$/.exec(uci.trim().toLowerCase());
  if (!match) throw new RangeError(`Invalid UCI move "${uci}" (expected e.g. e2e4 or e7e8q)`);
  const [, fromFile, fromRank, toFile, toRank, promotion] = match;
  return {
    fromCol: fromFile.charCodeAt(0) - 97,
    fromRow: Number(fromRank) - 1,
    toCol: toFile.charCodeAt(0) - 97,
    toRow: Number(toRank) - 1,
    promotion: promotion ? PROMOTIONS[promotion] : undefined,
  };
}

/** Convert the program's row/col move back to UCI. */
export function moveToUci(move: Move): string {
  const square = (row: number, col: number) => `${String.fromCharCode(97 + col)}${row + 1}`;
  const promotion = move.promotion
    ? Object.entries(PROMOTIONS).find(([, piece]) => piece === move.promotion)?.[0] ?? ""
    : "";
  return square(move.fromRow, move.fromCol) + square(move.toRow, move.toCol) + promotion;
}

/** The side `player` plays in `match`, or null when they aren't in it. */
export function playerColor(match: ChessMatch, player: PublicKey): "white" | "black" | null {
  if (match.players[0].equals(player)) return "white";
  if (match.players[1].equals(player)) return "black";
  return null;
}

/** True once a match has a result (or was cancelled). */
export function isMatchOver(match: Pick<ChessMatch, "gameStatus">): boolean {
  return (
    match.gameStatus === "whiteWins" ||
    match.gameStatus === "blackWins" ||
    match.gameStatus === "draw" ||
    match.gameStatus === "aborted"
  );
}

/**
 * Seconds until the side to move runs out of time, by the given clock
 * (unix seconds). Null for untimed matches or matches that aren't running.
 */
export function secondsLeftToMove(
  match: Pick<ChessMatch, "gameStatus" | "lastMoveTimestamp" | "moveTimeoutDuration">,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): number | null {
  if (match.gameStatus !== "active" || match.moveTimeoutDuration <= 0n) return null;
  return Number(match.lastMoveTimestamp + match.moveTimeoutDuration) - nowSeconds;
}

/**
 * Instructions that make sure `owner` has a token account for `mint` holding
 * at least `amount`: an idempotent ATA create, plus for wrapped SOL a
 * transfer and sync. Put them before create/join in the same transaction.
 */
export async function buildStakeInstructions(params: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
  amount: bigint;
  /** Pays the token account's rent. Defaults to `owner`. */
  payer?: PublicKey;
}): Promise<{ tokenAccount: PublicKey; instructions: TransactionInstruction[] }> {
  const { connection, owner, mint, amount } = params;
  if (amount < 0n) throw new RangeError("Stake cannot be negative");
  const payer = params.payer ?? owner;
  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer, tokenAccount, owner, mint),
  ];
  if (amount === 0n) return { tokenAccount, instructions };

  if (mint.equals(NATIVE_MINT)) {
    // Wrap only what the token account doesn't already hold.
    const existing = await connection
      .getTokenAccountBalance(tokenAccount, "confirmed")
      .then((balance) => BigInt(balance.value.amount))
      .catch(() => 0n);
    const missing = amount - existing;
    if (missing > 0n) {
      const lamports = BigInt(await connection.getBalance(owner, "confirmed"));
      if (lamports < missing) {
        throw new Error(
          `This stake needs ${formatRawTokenAmount(missing, 9)} SOL more than the wallet ${owner.toBase58()} holds (${formatRawTokenAmount(lamports, 9)} SOL). Fund it first, or play a free match.`
        );
      }
      instructions.push(
        SystemProgram.transfer({ fromPubkey: owner, toPubkey: tokenAccount, lamports: missing }),
        createSyncNativeInstruction(tokenAccount)
      );
    }
  }
  return { tokenAccount, instructions };
}

/**
 * Idempotently create every payout token account settlement needs (white,
 * black and the platform fee wallet), deduplicated.
 */
export function buildPayoutAccountInstructions(
  payer: PublicKey,
  mint: PublicKey,
  owners: [PublicKey, PublicKey, PublicKey]
): { accounts: [PublicKey, PublicKey, PublicKey]; instructions: TransactionInstruction[] } {
  const accounts = owners.map((owner) => getAssociatedTokenAddressSync(mint, owner)) as [
    PublicKey,
    PublicKey,
    PublicKey,
  ];
  const seen = new Set<string>();
  const instructions: TransactionInstruction[] = [];
  accounts.forEach((account, index) => {
    if (seen.has(account.toBase58())) return;
    seen.add(account.toBase58());
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(payer, account, owners[index], mint)
    );
  });
  return { accounts, instructions };
}
