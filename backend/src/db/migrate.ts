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
          bet_amount_per_player NUMERIC(20,0) NOT NULL,
          total_pot           NUMERIC(20,0)   NOT NULL DEFAULT 0,
          platform_fee_bps    INTEGER         NOT NULL DEFAULT 200,
          move_timeout_seconds BIGINT         NOT NULL DEFAULT 900,
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

      await s.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
            AND NOT EXISTS (
              SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = 'matches'
            )
          THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE matches;
          END IF;
        END $$
      `);
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
          event_index         INTEGER         NOT NULL DEFAULT 0,
          indexed_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
          PRIMARY KEY (match_id, move_number)
        )
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_moves_match
          ON moves (match_id, move_number)
      `);

      await s.unsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_moves_event_match
          ON moves (event_signature, match_id, event_index)
      `);

      await s.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
            AND NOT EXISTS (
              SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = 'moves'
            )
          THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE moves;
          END IF;
        END $$
      `);
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
          total_wagered       NUMERIC         NOT NULL DEFAULT 0,
          total_won           NUMERIC         NOT NULL DEFAULT 0,
          last_game_at        TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
        )
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_player_stats_wins
          ON player_stats (wins DESC, total_games)
      `);

      await s.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
            AND NOT EXISTS (
              SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = 'player_stats'
            )
          THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE player_stats;
          END IF;
        END $$
      `);
    },
  },
  {
    name: "004_harden_sync_state",
    run: async (s) => {
      await s.unsafe(`
        ALTER TABLE matches
          ADD COLUMN IF NOT EXISTS current_fen TEXT NOT NULL
          DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      `);
      await s.unsafe(`
        ALTER TABLE matches
          ADD COLUMN IF NOT EXISTS last_move_slot BIGINT
      `);
      await s.unsafe(`
        ALTER TABLE matches
          ADD COLUMN IF NOT EXISTS last_move_signature VARCHAR(88),
          ADD COLUMN IF NOT EXISTS last_move_event_index INTEGER
      `);
      await s.unsafe(`
        ALTER TABLE matches
          ALTER COLUMN bet_amount_per_player TYPE NUMERIC(20,0),
          ALTER COLUMN total_pot TYPE NUMERIC(20,0),
          ALTER COLUMN move_timeout_seconds TYPE BIGINT
      `);
      await s.unsafe(`
        ALTER TABLE player_stats
          ALTER COLUMN total_wagered TYPE NUMERIC(20,0),
          ALTER COLUMN total_won TYPE NUMERIC(20,0)
      `);
      await s.unsafe(`
        ALTER TABLE moves
          ADD COLUMN IF NOT EXISTS event_index INTEGER NOT NULL DEFAULT 0
      `);
      await s.unsafe(`
        UPDATE matches AS m
        SET current_fen = COALESCE(
              (
                SELECT move.fen_after_move
                FROM moves AS move
                WHERE move.match_id = m.match_id
                ORDER BY move.move_number DESC
                LIMIT 1
              ),
              m.current_fen
            ),
            last_move_slot = (
              SELECT move.event_slot FROM moves AS move
              WHERE move.match_id = m.match_id
              ORDER BY move.move_number DESC LIMIT 1
            ),
            last_move_signature = (
              SELECT move.event_signature FROM moves AS move
              WHERE move.match_id = m.match_id
              ORDER BY move.move_number DESC LIMIT 1
            ),
            last_move_event_index = (
              SELECT move.event_index FROM moves AS move
              WHERE move.match_id = m.match_id
              ORDER BY move.move_number DESC LIMIT 1
            )
      `);

      await s.unsafe(`
        CREATE TABLE IF NOT EXISTS sync_events (
          event_signature VARCHAR(88) NOT NULL,
          event_type      VARCHAR(32) NOT NULL,
          match_id       VARCHAR(32) NOT NULL,
          event_slot     BIGINT NOT NULL,
          event_index    INTEGER NOT NULL DEFAULT 0,
          processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (event_signature, event_type, match_id, event_index)
        )
      `);
      await s.unsafe(`
        ALTER TABLE sync_events
          ADD COLUMN IF NOT EXISTS event_index INTEGER NOT NULL DEFAULT 0
      `);
      await s.unsafe(`
        ALTER TABLE sync_events DROP CONSTRAINT IF EXISTS sync_events_pkey
      `);
      await s.unsafe(`
        ALTER TABLE sync_events
          ADD CONSTRAINT sync_events_pkey
          PRIMARY KEY (event_signature, event_type, match_id, event_index)
      `);

      await s.unsafe("DROP INDEX IF EXISTS idx_moves_event_sig");
      await s.unsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_moves_event_match
          ON moves (event_signature, match_id, event_index)
      `);

      await s.unsafe(`
        CREATE INDEX IF NOT EXISTS idx_sync_events_match
          ON sync_events (match_id, event_slot DESC)
      `);

      // These tables are written through the backend, not the Supabase Data API.
      // RLS without public policies keeps accidental Data API grants fail-closed.
      for (const table of ["matches", "moves", "player_stats", "sync_events"]) {
        await s.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      }
    },
  },
  {
    name: "005_unbounded_player_aggregates",
    run: async (s) => {
      await s.unsafe(`
        ALTER TABLE player_stats
          ALTER COLUMN total_wagered TYPE NUMERIC,
          ALTER COLUMN total_won TYPE NUMERIC
      `);
    },
  },
];

export async function runMigrations(): Promise<void> {
  await sql.begin(async (tx) => {
    // Serialize startup migrations across concurrently starting replicas.
    await tx`SELECT pg_advisory_xact_lock(hashtext('magic_chess_migrations'))`;

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(100) PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await tx.unsafe("ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY");

    for (const migration of migrations) {
      const exists = await tx`
        SELECT name FROM _migrations WHERE name = ${migration.name}
      `;
      if (exists.length > 0) {
        console.log(`  ✓ ${migration.name} (already run)`);
        continue;
      }

      console.log(`  → ${migration.name}`);
      await migration.run(tx as unknown as Sql);
      await tx`INSERT INTO _migrations (name) VALUES (${migration.name})`;
      console.log(`  ✓ ${migration.name}`);
    }
  });
}

// Run directly
const isMain = process.argv[1]?.includes("migrate");
if (isMain) {
  console.log("Running migrations...");
  await runMigrations();
  console.log("Migrations complete.");
  await sql.end();
}
