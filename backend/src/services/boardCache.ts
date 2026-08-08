// Board cache service — maintains chess position per active match
// Replays moves from chain events to keep FEN accurate without re-fetching from chain.
//
// ponytail: single in-memory Map. Multi-process would need Redis.
// For MVP single-server deployment, this is fine.

// ── FEN types (inline, avoid SDK subpath export issue) ──

const COL_FILE = "abcdefgh";

interface FenCastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

interface FenPiece {
  pieceType: string;
  color: string;
}

const PIECE_TO_FEN_CHAR: Record<string, Record<string, string>> = {
  White: { King: "K", Queen: "Q", Rook: "R", Bishop: "B", Knight: "N", Pawn: "P" },
  Black: { King: "k", Queen: "q", Rook: "r", Bishop: "b", Knight: "n", Pawn: "p" },
};

/**
 * Serialize board position to FEN string.
 */
function boardToFen(
  board: (FenPiece | null)[][],
  currentTurn: "white" | "black",
  castlingRights: FenCastlingRights,
  enPassantTarget: { row: number; col: number } | null,
  halfmoveClock: number,
  fullmoveNumber: number
): string {
  const ranks: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let rankStr = "";
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        if (emptyCount > 0) { rankStr += String(emptyCount); emptyCount = 0; }
        rankStr += PIECE_TO_FEN_CHAR[piece.color][piece.pieceType];
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) rankStr += String(emptyCount);
    ranks.push(rankStr);
  }

  const active = currentTurn === "white" ? "w" : "b";

  let castling = "";
  if (castlingRights.whiteKingside) castling += "K";
  if (castlingRights.whiteQueenside) castling += "Q";
  if (castlingRights.blackKingside) castling += "k";
  if (castlingRights.blackQueenside) castling += "q";
  if (castling === "") castling = "-";

  let ep = "-";
  if (enPassantTarget) {
    ep = COL_FILE[enPassantTarget.col] + String(enPassantTarget.row + 1);
  }

  return `${ranks.join("/")} ${active} ${castling} ${ep} ${halfmoveClock} ${fullmoveNumber}`;
}

// ── Our internal position type (mirrors on-chain state) ──

interface Piece {
  pieceType: string; // 'Pawn'|'Knight'|'Bishop'|'Rook'|'Queen'|'King'
  color: string;     // 'White'|'Black'
}

interface ChessPosition {
  board: (Piece | null)[][];
  currentTurn: "white" | "black";
  castlingRights: FenCastlingRights;
  enPassantTarget: { row: number; col: number } | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

interface MoveApplyArgs {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotionPiece: string | null; // 'Pawn'|'Knight'|'Bishop'|'Rook'|'Queen' or null
  playerColor: "white" | "black";
}

// ── Cache ──

const boardCache = new Map<string, ChessPosition>();

// ── Board initialization ──

const BACK_RANK: string[] = [
  "Rook", "Knight", "Bishop", "Queen",
  "King", "Bishop", "Knight", "Rook",
];

function initializeChessBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null)
  );

  for (let col = 0; col < 8; col++) {
    board[1][col] = { pieceType: "Pawn", color: "White" };
    board[6][col] = { pieceType: "Pawn", color: "Black" };
  }

  for (let col = 0; col < 8; col++) {
    board[0][col] = { pieceType: BACK_RANK[col], color: "White" };
    board[7][col] = { pieceType: BACK_RANK[col], color: "Black" };
  }

  return board;
}

function defaultPosition(): ChessPosition {
  return {
    board: initializeChessBoard(),
    currentTurn: "white",
    castlingRights: {
      whiteKingside: true,
      whiteQueenside: true,
      blackKingside: true,
      blackQueenside: true,
    },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

// ── Move application ──

/**
 * Apply a move to a board position. Mirrors on-chain chess_logic::validate_and_apply_move
 * but skips validation — the chain already validated. We just replay for FEN.
 */
export function applyMoveToBoard(
  position: ChessPosition,
  args: MoveApplyArgs
): ChessPosition {
  const { fromRow, fromCol, toRow, toCol, promotionPiece, playerColor } = args;

  // Deep-clone
  const board: (Piece | null)[][] = position.board.map((row) => [...row]);
  const castlingRights: FenCastlingRights = { ...position.castlingRights };
  let enPassantTarget: { row: number; col: number } | null = null;
  let halfmoveClock = position.halfmoveClock;
  let fullmoveNumber = position.fullmoveNumber;

  const piece = board[fromRow][fromCol];
  if (!piece) throw new Error(`No piece at (${fromRow},${fromCol})`);

  const pieceType = piece.pieceType;
  const targetPiece = board[toRow][toCol];
  const isCapture = targetPiece !== null;
  let actualCapture = isCapture;

  // En passant capture
  if (
    pieceType === "Pawn" &&
    position.enPassantTarget &&
    position.enPassantTarget.row === toRow &&
    position.enPassantTarget.col === toCol &&
    Math.abs(toCol - fromCol) === 1 &&
    Math.abs(toRow - fromRow) === 1
  ) {
    const capturedPawnRow =
      playerColor === "white" ? toRow - 1 : toRow + 1;
    board[capturedPawnRow][toCol] = null;
    actualCapture = true;
  }

  // Castling rights — king moves
  if (pieceType === "King") {
    if (playerColor === "white") {
      castlingRights.whiteKingside = false;
      castlingRights.whiteQueenside = false;
    } else {
      castlingRights.blackKingside = false;
      castlingRights.blackQueenside = false;
    }
  }

  // Castling rights — rook moves
  if (pieceType === "Rook") {
    if (playerColor === "white") {
      if (fromRow === 0 && fromCol === 0) castlingRights.whiteQueenside = false;
      if (fromRow === 0 && fromCol === 7) castlingRights.whiteKingside = false;
    } else {
      if (fromRow === 7 && fromCol === 0) castlingRights.blackQueenside = false;
      if (fromRow === 7 && fromCol === 7) castlingRights.blackKingside = false;
    }
  }

  // Castling rights — rook captured on starting square
  if (targetPiece?.pieceType === "Rook") {
    if (toRow === 0 && toCol === 0) castlingRights.whiteQueenside = false;
    if (toRow === 0 && toCol === 7) castlingRights.whiteKingside = false;
    if (toRow === 7 && toCol === 0) castlingRights.blackQueenside = false;
    if (toRow === 7 && toCol === 7) castlingRights.blackKingside = false;
  }

  // Move piece
  board[fromRow][fromCol] = null;

  let finalPiece = { ...piece };
  if (
    pieceType === "Pawn" &&
    ((playerColor === "white" && toRow === 7) ||
      (playerColor === "black" && toRow === 0))
  ) {
    finalPiece = {
      pieceType: promotionPiece || "Queen",
      color: playerColor,
    };
  }

  board[toRow][toCol] = finalPiece;

  // Castling rook movement
  if (pieceType === "King" && Math.abs(toCol - fromCol) === 2) {
    const isKingside = toCol > fromCol;
    const rookFromCol = isKingside ? 7 : 0;
    const rookToCol = isKingside ? 5 : 3;
    const rook = board[fromRow][rookFromCol];
    board[fromRow][rookFromCol] = null;
    board[fromRow][rookToCol] = rook;
  }

  // En passant target
  if (pieceType === "Pawn" && Math.abs(toRow - fromRow) === 2) {
    const epRow = (fromRow + toRow) / 2;
    enPassantTarget = { row: epRow, col: fromCol };
  }

  // Halfmove clock
  if (pieceType === "Pawn" || actualCapture) {
    halfmoveClock = 0;
  } else {
    halfmoveClock++;
  }

  // Fullmove number
  if (playerColor === "black") {
    fullmoveNumber++;
  }

  const newTurn: "white" | "black" =
    playerColor === "white" ? "black" : "white";

  return {
    board,
    currentTurn: newTurn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}

// ── Public API ──

export function initMatch(matchId: string): string {
  const pos = defaultPosition();
  boardCache.set(matchId, pos);
  return boardToFen(
    pos.board,
    pos.currentTurn,
    pos.castlingRights,
    pos.enPassantTarget,
    pos.halfmoveClock,
    pos.fullmoveNumber
  );
}

export function applyMove(
  matchId: string,
  args: MoveApplyArgs
): string | null {
  let pos = boardCache.get(matchId);
  if (!pos) return null; // Cache miss — caller should rebuild from DB

  pos = applyMoveToBoard(pos, args);
  boardCache.set(matchId, pos);

  return boardToFen(
    pos.board,
    pos.currentTurn,
    pos.castlingRights,
    pos.enPassantTarget,
    pos.halfmoveClock,
    pos.fullmoveNumber
  );
}

export function getFen(matchId: string): string | null {
  const pos = boardCache.get(matchId);
  if (!pos) return null;

  return boardToFen(
    pos.board,
    pos.currentTurn,
    pos.castlingRights,
    pos.enPassantTarget,
    pos.halfmoveClock,
    pos.fullmoveNumber
  );
}

export function getCurrentTurn(
  matchId: string
): "white" | "black" | null {
  const pos = boardCache.get(matchId);
  return pos?.currentTurn ?? null;
}

export function removeMatch(matchId: string): void {
  boardCache.delete(matchId);
}

export function getCacheSize(): number {
  return boardCache.size;
}

/**
 * Rebuild board state from stored moves in DB, then apply one more move.
 * Used when the in-memory cache is cold (server restart, cache eviction).
 */
export async function rebuildBoardState(
  matchId: string,
  nextMove: MoveApplyArgs,
  dbQuery: (sql: string, ...params: unknown[]) => Promise<Record<string, unknown>[]>
): Promise<string> {
  // Replay all existing moves from DB
  const moves = await dbQuery(
    `SELECT from_row, from_col, to_row, to_col, promotion_piece, player_color
     FROM moves WHERE match_id = $1 ORDER BY move_number ASC`,
    matchId
  );

  let pos = defaultPosition();

  for (const move of moves as Record<string, unknown>[]) {
    pos = applyMoveToBoard(pos, {
      fromRow: Number(move.fromRow),
      fromCol: Number(move.fromCol),
      toRow: Number(move.toRow),
      toCol: Number(move.toCol),
      promotionPiece: (move.promotionPiece as string) || null,
      playerColor:
        move.playerColor === "White" ? "white" : "black",
    });
  }

  // Apply the new move
  pos = applyMoveToBoard(pos, nextMove);
  boardCache.set(matchId, pos);

  return boardToFen(
    pos.board,
    pos.currentTurn,
    pos.castlingRights,
    pos.enPassantTarget,
    pos.halfmoveClock,
    pos.fullmoveNumber
  );
}
