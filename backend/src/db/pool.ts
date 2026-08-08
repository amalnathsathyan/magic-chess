import postgres from "postgres";
import { config } from "../config.js";

// ponytail: single pooled connection, no pgBouncer/HA needed for MVP
export const sql = postgres(config.db.url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  transform: postgres.camel,
});

export async function checkDbConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
