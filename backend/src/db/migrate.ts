import type { Sql } from "postgres";
import { sql } from "./pool.js";

// ponytail: simple numbered migration runner. No migration framework needed.
// Each migration is idempotent (IF NOT EXISTS).

const migrations: Array<{ name: string; run: (s: Sql) => Promise<void> }> = [
  {
    name: "001_create_matches",
    run: async (s) => {
      await s.unsafe(`
        CREATE TABLE IF NOT EXISTS matches (
          match_id            VARCHAR(32)     PRIMARY KEY,
          white_player        VARCHAR(44)     NOT NULL,
          black_player        VARCHAR(44),
          game_status         VARCHAR(20)     NOT NULL DEFAULT 'WaitingForOpponent',
          game_end_reason     VARCHAR(20),
          betting_token_mint  VARCHAR(44)     NOT NULL,
          bet_amount_per_player BIGINT        NOT NULL,
          total_pot           BIGINT          NOT NULL DEFAULT 0,
          platform_fee_bps    INTEGER         NOT NULL DEFAULT 200,
          move_timeout_seconds INTEGER        NOT NULL DEFAULT 900,
          created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
          started_at          TIMESTAMPTZ,
          ended_at            TIMESTAMPTZ,
          last_move_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
          payout_processed    BOOLEAN         NOT NULL DEFAULT FALSE,
          payout_tx_signature VARCHAR(88),
          last_webhook_slot   BIGINT,
          last_webhook_sig    VARCHAR(88)
        )
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_matches_status
          ON matches (game_status)
          WHERE game_status IN ('WaitingForOpponent', 'Active')
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_matches_white_player
          ON matches (white_player, created_at DESC)
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_matches_black_player
          ON matches (black_player, created_at DESC)
          WHERE black_player IS NOT NULL
      `);

      // Enable realtime for this table (Supabase)
      await s.unsafe(`
        ALTER PUBLICATION supabase_realtime ADD TABLE matches
      `).catch(() => {}); // fails if already in publication — safe to ignore
    },
  },
  {
    name: "002_create_moves",
    run: async (s) => {
      await s.unsafe(`
        CREATE TABLE IF NOT EXISTS moves (
          match_id            VARCHAR(32)     NOT NULL REFERENCES matches(match_id),
          move_number         INTEGER         NOT NULL,
          player_pubkey       VARCHAR(44)     NOT NULL,
          player_color        VARCHAR(5)      NOT NULL,
          from_row            SMALLINT        NOT NULL CHECK (from_row BETWEEN 0 AND 7),
          from_col            SMALLINT        NOT NULL CHECK (from_col BETWEEN 0 AND 7),
          to_row              SMALLINT        NOT NULL CHECK (to_row BETWEEN 0 AND 7),
          to_col              SMALLINT        NOT NULL CHECK (to_col BETWEEN 0 AND 7),
          algebraic_move      VARCHAR(10)     NOT NULL,
          promotion_piece     VARCHAR(6),
          fen_after_move      TEXT            NOT NULL,
          is_check            BOOLEAN         NOT NULL DEFAULT FALSE,
          is_checkmate        BOOLEAN         NOT NULL DEFAULT FALSE,
          is_stalemate        BOOLEAN         NOT NULL DEFAULT FALSE,
          event_slot          BIGINT          NOT NULL,
          event_signature     VARCHAR(88)     NOT NULL,
          indexed_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
          PRIMARY KEY (match_id, move_number)
        )
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_moves_match
          ON moves (match_id, move_number)
      `);

      await s.unsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_moves_event_sig
          ON moves (event_signature)
      `);

      await s.unsafe(`
        ALTER PUBLICATION supabase_realtime ADD TABLE moves
      `).catch(() => {});
    },
  },
  {
    name: "003_create_player_stats",
    run: async (s) => {
      await s.unsafe(`
        CREATE TABLE IF NOT EXISTS player_stats (
          player_pubkey       VARCHAR(44)     PRIMARY KEY,
          total_games         INTEGER         NOT NULL DEFAULT 0,
          wins                INTEGER         NOT NULL DEFAULT 0,
          losses              INTEGER         NOT NULL DEFAULT 0,
          draws               INTEGER         NOT NULL DEFAULT 0,
          wins_by_checkmate   INTEGER         NOT NULL DEFAULT 0,
          wins_by_resignation INTEGER         NOT NULL DEFAULT 0,
          wins_by_timeout     INTEGER         NOT NULL DEFAULT 0,
          current_streak      INTEGER         NOT NULL DEFAULT 0,
          longest_win_streak  INTEGER         NOT NULL DEFAULT 0,
          total_wagered       BIGINT          NOT NULL DEFAULT 0,
          total_won           BIGINT          NOT NULL DEFAULT 0,
          last_game_at        TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
        )
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_player_stats_wins
          ON player_stats (wins DESC, total_games)
      `);

      await s.unsafe(`
        ALTER PUBLICATION supabase_realtime ADD TABLE player_stats
      `).catch(() => {});
    },
  },
];

export async function runMigrations(): Promise<void> {
  // Create migration tracking table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(100) PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of migrations) {
    const exists = await sql`
      SELECT name FROM _migrations WHERE name = ${migration.name}
    `;
    if (exists.length > 0) {
      console.log(`  ✓ ${migration.name} (already run)`);
      continue;
    }

    console.log(`  → ${migration.name}`);
    await migration.run(sql);
    await sql`INSERT INTO _migrations (name) VALUES (${migration.name})`;
    console.log(`  ✓ ${migration.name}`);
  }
}

// Run directly
const isMain = process.argv[1]?.includes("migrate");
if (isMain) {
  console.log("Running migrations...");
  await runMigrations();
  console.log("Migrations complete.");
  await sql.end();
}
