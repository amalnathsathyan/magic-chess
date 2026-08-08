import type { MagicChess } from "./idl/magic_chess";
import magicChessIdl from "./idl/magic_chess.json";

export type { MagicChess };
export const MAGIC_CHESS_IDL = magicChessIdl as MagicChess;
