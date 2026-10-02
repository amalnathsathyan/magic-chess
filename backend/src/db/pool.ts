import postgres from "postgres";
import { config } from "../config.js";

// Supabase's transaction pooler (port 6543) can't hold prepared statements.
function usesTransactionPooler(url: string): boolean {
  try {
    return new URL(url).port === "6543";
  } catch {
    return false;
  }
}

export const sql = postgres(config.db.url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: !usesTransactionPooler(config.db.url),
  transform: postgres.camel,
});

export async function checkDbReadiness(): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM _migrations WHERE name = '006_move_predictions'
      ) AS ready
    `;
    return rows[0]?.ready === true;
  } catch {
    return false;
  }
}
