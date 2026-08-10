import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

/** Browser-compatible signing surface used by Anchor and Privy wallets. */
export interface MagicChessWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]>;
}

/** Anchor BN-compatible input without forcing consumers to install a second BN copy. */
export type IntegerInput = number | bigint | { toString(radix?: number): string };

// ── Enums (matching the on-chain Rust definitions) ──

export enum PieceType {
  Pawn = "pawn",
  Knight = "knight",
  Bishop = "bishop",
  Rook = "rook",
  Queen = "queen",
  King = "king",
}

export enum PlayerColor {
  White = "white",
  Black = "black",
}

export enum GameStatus {
  WaitingForOpponent = "waitingForOpponent",
  Active = "active",
  WhiteWins = "whiteWins",
  BlackWins = "blackWins",
  Draw = "draw",
  Aborted = "aborted",
}

export enum GameEndReason {
  Checkmate = "checkmate",
  Stalemate = "stalemate",
  Resignation = "resignation",
  Timeout = "timeout",
  FiftyMoveRule = "fiftyMoveRule",
  ThreefoldRepetition = "threefoldRepetition",
  InsufficientMaterial = "insufficientMaterial",
  Aborted = "aborted",
}

export enum MoveResult {
  Normal = "normal",
  Checkmate = "checkmate",
  Stalemate = "stalemate",
  ThreefoldRepetition = "threefoldRepetition",
  InsufficientMaterial = "insufficientMaterial",
  FiftyMoveRule = "fiftyMoveRule",
}

// ── Piece ──

export interface Piece {
  pieceType: PieceType;
  color: PlayerColor;
}

// ── CastlingRights ──

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

// ── EnPassantSquare ──

export interface EnPassantSquare {
  row: number;
  col: number;
}

// ── ChessMatch (full on-chain account) ──

export interface ChessMatch {
  matchId: string;
  players: [PublicKey, PublicKey];
  currentPlayerIdx: number;
  currentTurn: PlayerColor;
  lastMoveTimestamp: bigint;
  moveTimeoutDuration: bigint;
  gameStatus: GameStatus;
  gameEndReason: GameEndReason | null;
  board: (Piece | null)[][];
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  positionHistory: bigint[];
  bettingTokenMint: PublicKey;
  betAmountPlayerOne: bigint;
  betAmountPlayerTwo: bigint;
  totalPot: bigint;
  platformFeeBasisPoints: number;
  platformFeeWallet: PublicKey;
  payoutProcessed: boolean;
  predictionEnabled: boolean;
  delegationUid: string;
  isDelegated: boolean;
  whiteSessionSigner: PublicKey;
  whiteSessionExpiresAt: bigint;
  blackSessionSigner: PublicKey;
  blackSessionExpiresAt: bigint;
  activeTaskId: bigint;
  bump: number;
  matchEscrowBump: number;
}

// ── Move ──

export interface Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotion?: PieceType;
}

// ── CreateMatchParams ──

export interface CreateMatchParams {
  /** Unique match identifier (max 32 bytes) */
  matchId: string;
  /** Bet amount in raw token units (0 = free match) */
  betAmount: IntegerInput;
  /** Seconds allowed per move (0 = no timeout) */
  moveTimeoutDuration: IntegerInput;
  /** Platform fee in basis points (max 10000) */
  platformFeeBasisPoints: number;
  /** Wallet that receives platform fees */
  platformFeeWallet: PublicKey;
  /** SPL token mint for the wager */
  bettingTokenMint: PublicKey;
  /** Player 1's associated token account for the betting mint */
  playerTokenAccount: PublicKey;
  /**
   * Signer that funds the match and escrow account rent. Defaults to the
   * connected wallet for self-paid transactions.
   */
  rentPayer?: PublicKey;
  /** Enable the spectator prediction pool for this match. Defaults to false. */
  predictionEnabled?: boolean;
}

// ── JoinMatchParams ──

export interface JoinMatchParams {
  /** ID of the match to join */
  matchId: string;
  /**
   * Optional expected amount. The SDK always reads the authoritative wager
   * from chain and rejects this value if it is stale or mismatched.
   */
  betAmount?: IntegerInput;
  /** Player 2's associated token account for the match's betting mint */
  playerTokenAccount: PublicKey;
}

// ── MatchInfo (lightweight, for list views) ──

export interface MatchInfo {
  matchId: string;
  players: [PublicKey, PublicKey];
  gameStatus: GameStatus;
  bettingTokenMint: PublicKey;
  betAmountPlayerOne: bigint;
  totalPot: bigint;
  moveTimeoutDuration: bigint;
  lastMoveTimestamp: bigint;
  /** Derived exclusively from the on-chain per-player wager. */
  isFree: boolean;
}

/** Chain-derived wager information suitable for lobby/game displays. */
export interface WagerInfo {
  mint: PublicKey;
  decimals: number;
  rawAmountPerPlayer: bigint;
  rawTotalPot: bigint;
  amountPerPlayer: string;
  totalPot: string;
  isFree: boolean;
}

// ── Prediction Market ──

export interface PredictionPool {
  matchId: string;
  chessMatch: PublicKey;
  totalBetOnWhite: bigint;
  totalBetOnBlack: bigint;
  totalBetOnDraw: bigint;
  platformFeeBps: number;
  settlementProcessed: boolean;
  bump: number;
}

export interface PredictionBet {
  bettor: PublicKey;
  pool: PublicKey;
  amount: bigint;
  predictedOutcome: number; // 0 = White, 1 = Black, 2 = Draw
  claimed: boolean;
  bump: number;
}

// ── Event types (matching the on-chain event structs) ──

export interface MatchCreatedEvent {
  matchId: string;
  creator: PublicKey;
  bettingTokenMint: PublicKey;
  betAmount: bigint;
  moveTimeoutDuration: bigint;
  platformFeeBasisPoints: number;
}

export interface PlayerJoinedEvent {
  matchId: string;
  playerOne: PublicKey;
  playerTwo: PublicKey;
  bettingTokenMint: PublicKey;
  betAmountPerPlayer: bigint;
}

export interface MoveMadeEvent {
  matchId: string;
  player: PublicKey;
  playerColor: PlayerColor;
  algebraicMove: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotionPiece: PieceType | null;
  boardFen: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
}

export interface GameEndedEvent {
  matchId: string;
  status: GameStatus;
  winner: PlayerColor | null;
  reason: GameEndReason;
}

export interface PayoutEvent {
  matchId: string;
  winner: PublicKey;
  amount: bigint;
  fee: bigint;
}

export interface DrawPayoutEvent {
  matchId: string;
  whitePlayer: PublicKey;
  blackPlayer: PublicKey;
  amountEach: bigint;
  fee: bigint;
}
