// ── Barrel export — all public API ──

// IDL type
export type { MagicChess } from "./idl";

// Types
export {
  PieceType,
  PlayerColor,
  GameStatus,
  GameEndReason,
  MoveResult,
} from "./types";
export type {
  Piece,
  CastlingRights,
  EnPassantSquare,
  ChessMatch,
  Move,
  CreateMatchParams,
  JoinMatchParams,
  MatchInfo,
  MatchCreatedEvent,
  PlayerJoinedEvent,
  MoveMadeEvent,
  GameEndedEvent,
  PayoutEvent,
  DrawPayoutEvent,
} from "./types";

// Client
export { MagicChessClient } from "./client";

// PDA helpers
export {
  findChessMatchPda,
  findMatchEscrowPda,
  findPredictionPoolPda,
} from "./pda";
