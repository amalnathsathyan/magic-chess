// ── Barrel export — all public API ──

// Generated IDL and type
export { MAGIC_CHESS_IDL } from "./idl";
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
  MagicChessWallet,
  Piece,
  CastlingRights,
  EnPassantSquare,
  ChessMatch,
  Move,
  CreateMatchParams,
  JoinMatchParams,
  MatchInfo,
  WagerInfo,
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

// MagicBlock helpers
export {
  MAGICBLOCK_DEVNET_RPC,
  MAGICBLOCK_DEVNET_ROUTER,
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  getDelegationStatus,
  getERConnection,
  resolveAccountRuntime,
  waitForDelegation,
  waitForUndelegation,
  confirmCommitmentOnBase,
} from "./magicblock";
export type {
  AccountRuntime,
  DelegationStatus,
  LifecyclePollOptions,
} from "./magicblock";

// Wager display helpers
export { formatRawTokenAmount, isFreeWager } from "./wager";

// FEN utilities
export { boardToFen, fenToBoard } from "./utils/fen";
export type {
  FenState,
} from "./utils/fen";
