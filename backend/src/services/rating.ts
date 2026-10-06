/**
 * Elo ratings, FIDE style: everyone starts at 1200, the K-factor is 40 for a
 * player's first 30 rated games (so new players settle quickly) and 20 after.
 */

export const INITIAL_RATING = 1200;
export const PROVISIONAL_GAMES = 30;

export type GameScore = 1 | 0.5 | 0;

export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? 40 : 20;
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export interface RatedPlayer {
  rating: number;
  /** Rated games played before this one. */
  games: number;
}

/** Rating changes for both sides of one game, from White's score. */
export function rateGame(
  white: RatedPlayer,
  black: RatedPlayer,
  whiteScore: GameScore
): { white: number; black: number } {
  const blackScore = 1 - whiteScore;
  const white_ = Math.round(
    kFactor(white.games) * (whiteScore - expectedScore(white.rating, black.rating))
  );
  const black_ = Math.round(
    kFactor(black.games) * (blackScore - expectedScore(black.rating, white.rating))
  );
  return { white: white_, black: black_ };
}

/** White's score for a terminal DB status, or null when the game wasn't decided. */
export function whiteScoreFor(status: string): GameScore | null {
  switch (status) {
    case "WhiteWins":
    case "whiteWins":
      return 1;
    case "BlackWins":
    case "blackWins":
      return 0;
    case "Draw":
    case "draw":
      return 0.5;
    default:
      return null;
  }
}
