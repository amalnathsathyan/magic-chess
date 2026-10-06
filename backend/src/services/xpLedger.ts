import type { Sql } from "postgres";
import { plyFromFen } from "./eventIngest.js";
import { whiteScoreFor } from "./rating.js";
import { totalXp, xpForGame } from "./xp.js";

/**
 * Award XP to both players of a finished game. Every award is a row in
 * `xp_events`, keyed by (player, match, kind), so awarding twice is a no-op
 * and a player's XP can always be audited back to the games that earned it.
 *
 * Runs inside the transaction that records the result.
 */
export async function awardGameXp(tx: Sql, matchId: string): Promise<void> {
  const rows = await tx`
    SELECT m.white_player, m.black_player, m.game_status, m.current_fen,
           m.ply_count, COALESCE(m.ended_at, m.last_move_at) AS ended_at,
           (SELECT MAX(move_number) FROM moves WHERE match_id = m.match_id) AS max_ply
    FROM matches m
    WHERE m.match_id = ${matchId}
  `;
  const game = rows[0];
  if (!game?.blackPlayer) return;
  const whiteScore = whiteScoreFor(String(game.gameStatus));
  if (whiteScore === null) return;

  const plies = gamePlies(game.plyCount, game.maxPly, String(game.currentFen));
  const endedAt = new Date(game.endedAt as string | Date);

  // Same-day games between these two players that ended before this one.
  const earlier = await tx`
    SELECT COUNT(*)::int AS n FROM matches
    WHERE match_id <> ${matchId}
      AND game_status IN ('WhiteWins', 'BlackWins', 'Draw')
      AND (
        (white_player = ${game.whitePlayer} AND black_player = ${game.blackPlayer})
        OR (white_player = ${game.blackPlayer} AND black_player = ${game.whitePlayer})
      )
      AND date_trunc('day', ended_at AT TIME ZONE 'UTC')
        = date_trunc('day', ${endedAt}::timestamptz AT TIME ZONE 'UTC')
      AND (ended_at < ${endedAt} OR (ended_at = ${endedAt} AND match_id < ${matchId}))
  `;
  const earlierGames = Number(earlier[0]?.n ?? 0);

  const sides = [
    { wallet: String(game.whitePlayer), score: whiteScore, color: "white" },
    { wallet: String(game.blackPlayer), score: 1 - whiteScore, color: "black" },
  ] as const;

  for (const side of sides) {
    const won = await tx`
      SELECT 1 FROM xp_events
      WHERE player_pubkey = ${side.wallet}
        AND kind = 'first_win'
        AND date_trunc('day', earned_at AT TIME ZONE 'UTC')
          = date_trunc('day', ${endedAt}::timestamptz AT TIME ZONE 'UTC')
      LIMIT 1
    `;
    const awards = xpForGame({
      score: side.score as 1 | 0.5 | 0,
      plies,
      firstWinToday: won.length === 0,
      earlierGamesVsOpponentToday: earlierGames,
    });

    let gained = 0;
    for (const award of awards) {
      const inserted = await tx`
        INSERT INTO xp_events (player_pubkey, match_id, kind, amount, earned_at)
        VALUES (${side.wallet}, ${matchId}, ${award.kind}, ${award.amount}, ${endedAt})
        ON CONFLICT (player_pubkey, match_id, kind) DO NOTHING
        RETURNING amount
      `;
      if (inserted.length) gained += award.amount;
    }

    const column = side.color === "white" ? "white_xp" : "black_xp";
    await tx.unsafe(`UPDATE matches SET ${column} = $1 WHERE match_id = $2`, [
      totalXp(awards),
      matchId,
    ]);
    if (gained > 0) {
      await tx`
        INSERT INTO player_stats (player_pubkey, xp)
        VALUES (${side.wallet}, ${gained})
        ON CONFLICT (player_pubkey) DO UPDATE
          SET xp = player_stats.xp + EXCLUDED.xp, updated_at = NOW()
      `;
    }
  }
}

function gamePlies(stored: unknown, maxPly: unknown, fen: string): number {
  if (stored !== null && stored !== undefined) return Number(stored);
  if (maxPly !== null && maxPly !== undefined) return Number(maxPly);
  try {
    return plyFromFen(fen);
  } catch {
    return 0;
  }
}
