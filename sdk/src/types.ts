import type { PublicKey } from "@solana/web3.js";

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
}

export enum GameEndReason {
  Checkmate = "checkmate",
  Stalemate = "stalemate",
  Resignation = "resignation",
  Timeout = "timeout",
  FiftyMoveRule = "fiftyMoveRule",
  ThreefoldRepetition = "threefoldRepetition",
}

export enum MoveResult {
  Normal = "normal",
  Checkmate = "checkmate",
  Stalemate = "stalemate",
  ThreefoldRepetition = "threefoldRepetition",
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
  lastMoveTimestamp: number;
  moveTimeoutDuration: number;
  gameStatus: GameStatus;
  gameEndReason: GameEndReason | null;
  board: (Piece | null)[][];
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  positionHistory: number[];
  bettingTokenMint: PublicKey;
  betAmountPlayerOne: number;
  betAmountPlayerTwo: number;
  totalPot: number;
  platformFeeBasisPoints: number;
  platformFeeWallet: PublicKey;
  payoutProcessed: boolean;
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
  /** Bet amount in raw token units (minimum 1) */
  betAmount: number;
  /** Seconds allowed per move (0 = no timeout) */
  moveTimeoutDuration: number;
  /** Platform fee in basis points (max 10000) */
  platformFeeBasisPoints: number;
  /** Wallet that receives platform fees */
  platformFeeWallet: PublicKey;
  /** SPL token mint for the wager */
  bettingTokenMint: PublicKey;
  /** Player 1's associated token account for the betting mint */
  playerTokenAccount: PublicKey;
}

// ── JoinMatchParams ──

export interface JoinMatchParams {
  /** ID of the match to join */
  matchId: string;
  /** Bet amount (must match creator's bet) */
  betAmount: number;
  /** Player 2's associated token account for the match's betting mint */
  playerTokenAccount: PublicKey;
}

// ── MatchInfo (lightweight, for list views) ──

export interface MatchInfo {
  matchId: string;
  players: [PublicKey, PublicKey];
  gameStatus: GameStatus;
  bettingTokenMint: PublicKey;
  betAmountPlayerOne: number;
  totalPot: number;
  moveTimeoutDuration: number;
  lastMoveTimestamp: number;
}

// ── Event types (matching the on-chain event structs) ──

export interface MatchCreatedEvent {
  matchId: string;
  creator: PublicKey;
  bettingTokenMint: PublicKey;
  betAmount: number;
  moveTimeoutDuration: number;
  platformFeeBasisPoints: number;
}

export interface PlayerJoinedEvent {
  matchId: string;
  playerOne: PublicKey;
  playerTwo: PublicKey;
  bettingTokenMint: PublicKey;
  betAmountPerPlayer: number;
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
  amount: number;
  fee: number;
}

export interface DrawPayoutEvent {
  matchId: string;
  whitePlayer: PublicKey;
  blackPlayer: PublicKey;
  amountEach: number;
  fee: number;
}
