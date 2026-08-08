/**
 * MagicBlock integration helpers.
 *
 * These functions wrap the @magic-chess/sdk for move submission.
 */

import { MagicChessClient, PieceType } from "@magic-chess/sdk";

/**
 * Submit a chess move. The SDK resolves the authoritative base/ER runtime.
 */
export async function submitMoveTx(
  client: MagicChessClient,
  matchId: string,
  from: string,
  to: string,
  promotion?: string
): Promise<string> {
  if (!client.wallet) throw new Error("Connect a wallet before submitting a move");
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
    throw new Error("Move squares must use algebraic coordinates such as e2 and e4");
  }

  const fromCol = from.charCodeAt(0) - 97;
  const fromRow = parseInt(from[1]) - 1;
  const toCol = to.charCodeAt(0) - 97;
  const toRow = parseInt(to[1]) - 1;

  const move = {
    fromRow,
    fromCol,
    toRow,
    toCol,
    promotion: promotion ? parsePromotion(promotion) : undefined,
  };

  const { signature } = await client.makeMove(matchId, move);
  return signature;
}

function parsePromotion(value: string): PieceType {
  const normalized = value.toLowerCase();
  const shorthand: Record<string, PieceType> = {
    q: PieceType.Queen,
    r: PieceType.Rook,
    b: PieceType.Bishop,
    n: PieceType.Knight,
  };
  const promotion =
    shorthand[normalized] ??
    Object.values(PieceType).find((piece) => piece === normalized);
  if (!promotion || promotion === PieceType.Pawn || promotion === PieceType.King) {
    throw new Error(`Invalid promotion piece: ${value}`);
  }
  return promotion;
}
