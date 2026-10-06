import { sql } from "../db/pool.js";
import { INITIAL_FEN, sanFromUci } from "./movePredictions.js";
import { INITIAL_RATING } from "./rating.js";

/** Avatars are chess pieces, so no image hosting or moderation is needed. */
export const AVATARS = ["king", "queen", "rook", "bishop", "knight", "pawn"] as const;
export type Avatar = (typeof AVATARS)[number];

export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const BIO_MAX_LENGTH = 160;

export interface ProfileEdit {
  displayName: string | null;
  bio: string | null;
  avatar: Avatar | null;
}

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
  }
}

/** Trim and validate an edit; empty strings clear a field. */
export function normalizeProfileEdit(input: {
  displayName?: string | null;
  bio?: string | null;
  avatar?: string | null;
}): ProfileEdit {
  const displayName = input.displayName?.trim() || null;
  if (displayName && !DISPLAY_NAME_PATTERN.test(displayName)) {
    throw new ProfileError(
      "Display names are 3 to 20 letters, numbers, underscores or dashes."
    );
  }
  const bio = input.bio?.replace(/\s+/g, " ").trim() || null;
  if (bio && bio.length > BIO_MAX_LENGTH) {
    throw new ProfileError(`Bios are at most ${BIO_MAX_LENGTH} characters.`);
  }
  const avatar = input.avatar?.trim() || null;
  if (avatar && !(AVATARS as readonly string[]).includes(avatar)) {
    throw new ProfileError("Unknown avatar.");
  }
  return { displayName, bio, avatar: avatar as Avatar | null };
}

/**
 * The exact text the wallet signs. It carries the new values, so a signature
 * can't be replayed to set anything else.
 */
export function profileUpdateMessage(
  wallet: string,
  edit: ProfileEdit,
  issuedAt: number
): string {
  return [
    "Magic Chess profile update",
    `wallet:${wallet}`,
    `name:${edit.displayName ?? ""}`,
    `avatar:${edit.avatar ?? ""}`,
    `bio:${edit.bio ?? ""}`,
    `issued-at:${issuedAt}`,
  ].join("\n");
}

export async function saveProfile(wallet: string, edit: ProfileEdit): Promise<void> {
  try {
    await sql`
      INSERT INTO player_profiles (wallet, display_name, bio, avatar)
      VALUES (${wallet}, ${edit.displayName}, ${edit.bio}, ${edit.avatar})
      ON CONFLICT (wallet) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        avatar = EXCLUDED.avatar,
        updated_at = NOW()
    `;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ProfileError("That display name is taken.", 409);
    }
    throw error;
  }
}

type Outcome = "win" | "loss" | "draw";

interface Tally {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

const emptyTally = (): Tally => ({ games: 0, wins: 0, losses: 0, draws: 0 });

function add(tally: Tally, outcome: Outcome): void {
  tally.games += 1;
  if (outcome === "win") tally.wins += 1;
  else if (outcome === "loss") tally.losses += 1;
  else tally.draws += 1;
}

/** Everything the profile page shows, read from the indexer database. */
export async function loadPlayerProfile(wallet: string) {
  const [profileRows, statsRows, finished, activeRows, rankRows] = await Promise.all([
    sql`SELECT display_name, bio, avatar, created_at FROM player_profiles WHERE wallet = ${wallet}`,
    sql`SELECT * FROM player_stats WHERE player_pubkey = ${wallet}`,
    sql`
      SELECT
        m.match_id, m.white_player, m.black_player, m.game_status, m.game_end_reason,
        m.created_at, m.ended_at, m.white_rating, m.black_rating,
        m.white_rating_change, m.black_rating_change,
        first.algebraic_move AS first_uci,
        reply.algebraic_move AS reply_uci,
        first.fen_after_move AS first_fen
      FROM matches m
      LEFT JOIN moves first ON first.match_id = m.match_id AND first.move_number = 1
      LEFT JOIN moves reply ON reply.match_id = m.match_id AND reply.move_number = 2
      WHERE (m.white_player = ${wallet} OR m.black_player = ${wallet})
        AND m.game_status IN ('WhiteWins', 'BlackWins', 'Draw')
      ORDER BY m.ended_at ASC NULLS FIRST, m.created_at ASC
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE game_status = 'Active') AS active,
        MIN(created_at) AS first_match_at
      FROM matches
      WHERE white_player = ${wallet} OR black_player = ${wallet}
    `,
    sql`
      SELECT COUNT(*) + 1 AS rank FROM player_stats
      WHERE rated_games > 0
        AND rating > COALESCE(
          (SELECT rating FROM player_stats WHERE player_pubkey = ${wallet}),
          ${INITIAL_RATING}
        )
    `,
  ]);

  const profile = profileRows[0] as Record<string, unknown> | undefined;
  const s = statsRows[0] as Record<string, unknown> | undefined;
  const byColor = { white: emptyTally(), black: emptyTally() };
  const endings: Record<string, { outcome: Outcome; reason: string; count: number }> = {};
  const openingsWhite = new Map<string, Tally>();
  const openingsBlack = new Map<string, Tally>();
  const ratingHistory: Array<{ matchId: string; endedAt: unknown; rating: number }> = [];
  const form: Array<{ matchId: string; result: Outcome }> = [];

  for (const row of finished as Array<Record<string, unknown>>) {
    const color = row.whitePlayer === wallet ? "white" : "black";
    const status = String(row.gameStatus);
    const outcome: Outcome =
      status === "Draw"
        ? "draw"
        : (status === "WhiteWins") === (color === "white")
          ? "win"
          : "loss";
    add(byColor[color], outcome);

    const reason = String(row.gameEndReason ?? "Unknown");
    const key = `${outcome}:${reason}`;
    endings[key] ??= { outcome, reason, count: 0 };
    endings[key].count += 1;

    if (color === "white" && row.firstUci) {
      const san = sanFromUci(INITIAL_FEN, String(row.firstUci)) ?? String(row.firstUci);
      const tally = openingsWhite.get(san) ?? emptyTally();
      add(tally, outcome);
      openingsWhite.set(san, tally);
    }
    if (color === "black" && row.replyUci && row.firstFen && row.firstUci) {
      const first = sanFromUci(INITIAL_FEN, String(row.firstUci)) ?? String(row.firstUci);
      const reply = sanFromUci(String(row.firstFen), String(row.replyUci)) ?? String(row.replyUci);
      const line = `1. ${first} ${reply}`;
      const tally = openingsBlack.get(line) ?? emptyTally();
      add(tally, outcome);
      openingsBlack.set(line, tally);
    }

    const before = row[color === "white" ? "whiteRating" : "blackRating"];
    const change = row[color === "white" ? "whiteRatingChange" : "blackRatingChange"];
    if (before !== null && before !== undefined && change !== null && change !== undefined) {
      ratingHistory.push({
        matchId: String(row.matchId),
        endedAt: row.endedAt,
        rating: Number(before) + Number(change),
      });
    }
    form.push({ matchId: String(row.matchId), result: outcome });
  }

  const topOpenings = (map: Map<string, Tally>) =>
    [...map.entries()]
      .map(([move, tally]) => ({ move, ...tally }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, 4);

  const total = Number(s?.totalGames) || 0;
  const wins = Number(s?.wins) || 0;
  const ratedGames = Number(s?.ratedGames) || 0;
  const active = activeRows[0] as Record<string, unknown> | undefined;
  const memberSince = [profile?.createdAt, active?.firstMatchAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return {
    wallet,
    displayName: (profile?.displayName as string | null) ?? null,
    bio: (profile?.bio as string | null) ?? null,
    avatar: (profile?.avatar as string | null) ?? null,
    memberSince,
    rating: s ? Number(s.rating) : INITIAL_RATING,
    peakRating: s ? Number(s.peakRating) : INITIAL_RATING,
    ratedGames,
    provisional: ratedGames < 30,
    rank: ratedGames > 0 ? Number(rankRows[0]?.rank ?? 0) : null,
    activeGames: Number(active?.active ?? 0),
    stats: {
      totalGames: total,
      wins,
      losses: Number(s?.losses) || 0,
      draws: Number(s?.draws) || 0,
      winRate: total > 0 ? wins / total : 0,
      currentStreak: Number(s?.currentStreak) || 0,
      longestWinStreak: Number(s?.longestWinStreak) || 0,
      totalWagered: String(s?.totalWagered ?? "0"),
      totalWon: String(s?.totalWon ?? "0"),
      lastGameAt: s?.lastGameAt ?? null,
    },
    byColor,
    endings: Object.values(endings).sort((a, b) => b.count - a.count),
    openings: { white: topOpenings(openingsWhite), black: topOpenings(openingsBlack) },
    ratingHistory: ratingHistory.slice(-50),
    recentForm: form.slice(-10).reverse(),
  };
}
