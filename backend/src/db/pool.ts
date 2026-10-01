import postgres from "postgres";
import { config } from "../config.js";

// ponytail: single pooled connection, no pgBouncer/HA needed for MVP
export const sql = postgres(config.db.url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
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
