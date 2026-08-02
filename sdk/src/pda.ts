import { PublicKey } from "@solana/web3.js";

/**
 * PDA seed constants — must match the program's constants.rs.
 */
const CHESS_MATCH_SEED = Buffer.from("chess_match");
const MATCH_ESCROW_SEED = Buffer.from("match_escrow");

/**
 * Find the PDA for a ChessMatch account.
 *
 * Seeds: ["chess_match", matchId.asBytes()]
 */
export function findChessMatchPda(
  matchId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHESS_MATCH_SEED, Buffer.from(matchId)],
    programId
  );
}

/**
 * Find the PDA for the match escrow token account.
 *
 * Seeds: ["match_escrow", matchId.asBytes()]
 */
export function findMatchEscrowPda(
  matchId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MATCH_ESCROW_SEED, Buffer.from(matchId)],
    programId
  );
}

/**
 * Find the PDA for a prediction pool associated with a match.
 *
 * Reserved for future prediction market functionality.
 * Seeds: ["prediction_pool", matchId.asBytes()]
 */
export function findPredictionPoolPda(
  matchId: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("prediction_pool"), Buffer.from(matchId)],
    programId
  );
}
