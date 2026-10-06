/**
 * Experience points: a reward for playing, separate from the Elo rating,
 * which measures strength. Every finished game earns XP, so XP and level
 * grow with activity while the rating can go up or down.
 *
 * The rules are deliberately hard to farm: a game abandoned in the first
 * few moves earns almost nothing, and replaying the same opponent over and
 * over stops paying after a few games a day. Wagers never change XP.
 */

export type XpKind = "game" | "result" | "length" | "first_win";

export interface XpAward {
  kind: XpKind;
  amount: number;
}

export interface XpGame {
  /** 1 win, 0.5 draw, 0 loss. */
  score: 1 | 0.5 | 0;
  /** Half-moves played in the game. */
  plies: number;
  /** True when this is the player's first win of the UTC day. */
  firstWinToday: boolean;
  /** Finished games against this opponent earlier the same UTC day. */
  earlierGamesVsOpponentToday: number;
}

export const XP_RULES = {
  game: 10,
  win: 20,
  draw: 8,
  /** Bonus per full move past move 10, capped. */
  lengthStartsAtMove: 10,
  lengthCap: 15,
  firstWin: 25,
  /** Games under this many plies only earn the short-game amount. */
  shortGamePlies: 6,
  shortGame: 2,
  /** Games per opponent per UTC day that earn XP. */
  dailyGamesPerOpponent: 5,
} as const;

export function xpForGame(game: XpGame): XpAward[] {
  if (game.earlierGamesVsOpponentToday >= XP_RULES.dailyGamesPerOpponent) return [];
  if (game.plies < XP_RULES.shortGamePlies) {
    return [{ kind: "game", amount: XP_RULES.shortGame }];
  }

  const awards: XpAward[] = [{ kind: "game", amount: XP_RULES.game }];
  if (game.score === 1) awards.push({ kind: "result", amount: XP_RULES.win });
  if (game.score === 0.5) awards.push({ kind: "result", amount: XP_RULES.draw });

  const fullMoves = Math.floor(game.plies / 2);
  const length = Math.min(
    XP_RULES.lengthCap,
    Math.max(0, fullMoves - XP_RULES.lengthStartsAtMove)
  );
  if (length > 0) awards.push({ kind: "length", amount: length });

  if (game.score === 1 && game.firstWinToday) {
    awards.push({ kind: "first_win", amount: XP_RULES.firstWin });
  }
  return awards;
}

export const totalXp = (awards: XpAward[]): number =>
  awards.reduce((sum, award) => sum + award.amount, 0);

/** XP needed to go from `level` to `level + 1`. */
export const xpForNextLevel = (level: number): number => 100 + 25 * (level - 1);

/** Total XP needed to reach `level` from zero. */
export function xpToReachLevel(level: number): number {
  const steps = Math.max(0, level - 1);
  return 100 * steps + (25 * steps * (steps - 1)) / 2;
}

export const TIERS = [
  { name: "Pawn", fromLevel: 1 },
  { name: "Knight", fromLevel: 5 },
  { name: "Bishop", fromLevel: 10 },
  { name: "Rook", fromLevel: 15 },
  { name: "Queen", fromLevel: 20 },
  { name: "King", fromLevel: 30 },
] as const;

export interface LevelInfo {
  xp: number;
  level: number;
  tier: (typeof TIERS)[number]["name"];
  /** XP earned inside the current level. */
  levelXp: number;
  /** XP the current level takes in total. */
  levelSpan: number;
}

export function levelFor(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpToReachLevel(level + 1) <= safe) level += 1;
  const tier = [...TIERS].reverse().find((t) => level >= t.fromLevel) ?? TIERS[0];
  return {
    xp: safe,
    level,
    tier: tier.name,
    levelXp: safe - xpToReachLevel(level),
    levelSpan: xpForNextLevel(level),
  };
}
