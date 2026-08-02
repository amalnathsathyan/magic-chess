// FEN (Forsyth-Edwards Notation) utilities
// Mirrors on-chain generate_fen() in programs/magic_chess/src/utils/chess_logic.rs

// --- Types ---

export interface Piece {
  pieceType: 'Pawn' | 'Knight' | 'Bishop' | 'Rook' | 'Queen' | 'King';
  color: 'White' | 'Black';
}

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

export interface EnPassantSquare {
  row: number; // 0-7, where 0 = rank 1
  col: number; // 0-7, where 0 = a-file
}

export interface FenState {
  board: (Piece | null)[][];
  currentTurn: 'white' | 'black';
  castlingRights: CastlingRights;
  enPassantTarget: EnPassantSquare | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

// --- Piece-to-character mapping ---

const PIECE_TO_FEN_CHAR: Record<string, Record<string, string>> = {
  White: { King: 'K', Queen: 'Q', Rook: 'R', Bishop: 'B', Knight: 'N', Pawn: 'P' },
  Black: { King: 'k', Queen: 'q', Rook: 'r', Bishop: 'b', Knight: 'n', Pawn: 'p' },
};

const FEN_CHAR_TO_PIECE: Record<string, Piece> = {};
for (const [color, mapping] of Object.entries(PIECE_TO_FEN_CHAR)) {
  for (const [pieceType, char] of Object.entries(mapping)) {
    FEN_CHAR_TO_PIECE[char] = {
      color: color as 'White' | 'Black',
      pieceType: pieceType as Piece['pieceType'],
    };
  }
}

const COL_FILE = 'abcdefgh'; // col 0 = 'a', col 7 = 'h'

// --- boardToFen ---

/**
 * Convert an on-chain board representation to a standard FEN string.
 *
 * Board layout: board[row][col], where row 0 is rank 1 (White's back rank)
 * and col 0 is the a-file.
 *
 * FEN output follows the 6-field format:
 *   piece placement (ranks 8→1, '/' separated, digits for empty squares)
 *   active color ('w' | 'b')
 *   castling availability ('KQkq' or '-')
 *   en passant target square (e.g. 'e3' or '-')
 *   halfmove clock
 *   fullmove number
 */
export function boardToFen(
  board: (Piece | null)[][],
  currentTurn: 'white' | 'black',
  castlingRights: CastlingRights,
  enPassantTarget: EnPassantSquare | null,
  halfmoveClock: number,
  fullmoveNumber: number,
): string {
  // Piece placement — iterate rows 7 down to 0 (FEN rank 8 → 1)
  const ranks: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let rankStr = '';
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        if (emptyCount > 0) {
          rankStr += String(emptyCount);
          emptyCount = 0;
        }
        rankStr += PIECE_TO_FEN_CHAR[piece.color][piece.pieceType];
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) {
      rankStr += String(emptyCount);
    }
    ranks.push(rankStr);
  }
  const placement = ranks.join('/');

  // Active color
  const active = currentTurn === 'white' ? 'w' : 'b';

  // Castling rights
  let castling = '';
  if (castlingRights.whiteKingside) castling += 'K';
  if (castlingRights.whiteQueenside) castling += 'Q';
  if (castlingRights.blackKingside) castling += 'k';
  if (castlingRights.blackQueenside) castling += 'q';
  if (castling === '') castling = '-';

  // En passant target
  let ep: string;
  if (enPassantTarget) {
    ep = COL_FILE[enPassantTarget.col] + String(enPassantTarget.row + 1);
  } else {
    ep = '-';
  }

  return `${placement} ${active} ${castling} ${ep} ${halfmoveClock} ${fullmoveNumber}`;
}

// --- fenToBoard ---

/**
 * Parse a standard FEN string into the on-chain board representation.
 *
 * Supports the full 6-field FEN. The halfmove clock and fullmove number
 * fields are optional (default to 0 and 1 respectively) to support
 * simplified FEN formats often used for board setup puzzles.
 */
export function fenToBoard(fen: string): FenState {
  const fields = fen.trim().split(/\s+/);

  // --- Piece placement (field 0) ---
  const rankStrs = fields[0].split('/');
  if (rankStrs.length !== 8) {
    throw new Error(`Invalid FEN: expected 8 ranks in piece placement, got ${rankStrs.length}`);
  }

  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  // FEN rank 0 = rank 8 (internal row 7), FEN rank 7 = rank 1 (internal row 0)
  for (let fenRankIdx = 0; fenRankIdx < 8; fenRankIdx++) {
    const row = 7 - fenRankIdx;
    const rankStr = rankStrs[fenRankIdx];
    let col = 0;

    for (let i = 0; i < rankStr.length; i++) {
      const ch = rankStr[i];
      if (ch >= '1' && ch <= '8') {
        col += parseInt(ch, 10);
      } else {
        const piece = FEN_CHAR_TO_PIECE[ch];
        if (!piece) {
          throw new Error(`Invalid FEN: unexpected character '${ch}' in piece placement`);
        }
        board[row][col] = { ...piece };
        col++;
      }
    }

    if (col !== 8) {
      throw new Error(`Invalid FEN: rank ${fenRankIdx + 1} has ${col} squares (expected 8)`);
    }
  }

  // --- Active color (field 1) ---
  const activeField = fields[1];
  let currentTurn: 'white' | 'black';
  if (activeField === 'w') {
    currentTurn = 'white';
  } else if (activeField === 'b') {
    currentTurn = 'black';
  } else {
    throw new Error(`Invalid FEN: expected active color 'w' or 'b', got '${activeField}'`);
  }

  // --- Castling rights (field 2) ---
  const castlingField = fields[2];
  const castlingRights: CastlingRights = {
    whiteKingside: castlingField.includes('K'),
    whiteQueenside: castlingField.includes('Q'),
    blackKingside: castlingField.includes('k'),
    blackQueenside: castlingField.includes('q'),
  };

  // --- En passant target (field 3) ---
  const epField = fields[3];
  let enPassantTarget: EnPassantSquare | null = null;
  if (epField !== '-') {
    if (epField.length !== 2) {
      throw new Error(`Invalid FEN: en passant target must be a file+rank (e.g. 'e3') or '-', got '${epField}'`);
    }
    const col = COL_FILE.indexOf(epField[0]);
    const row = parseInt(epField[1], 10) - 1; // FEN rank is 1-based, internal is 0-based
    if (col < 0 || col > 7 || row < 0 || row > 7) {
      throw new Error(`Invalid FEN: en passant target '${epField}' is out of bounds`);
    }
    enPassantTarget = { row, col };
  }

  // --- Halfmove clock (field 4, optional) ---
  const halfmoveClock = fields.length > 4 ? parseInt(fields[4], 10) || 0 : 0;

  // --- Fullmove number (field 5, optional) ---
  const fullmoveNumber = fields.length > 5 ? parseInt(fields[5], 10) || 1 : 1;

  return {
    board,
    currentTurn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
  };
}
