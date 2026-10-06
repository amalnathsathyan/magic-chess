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
  return (await dbReadiness()).ready;
}

/**
 * Readiness with the reason it failed, and a fix hint for the one outage this
 * deployment has hit before: Supabase's direct host is IPv6-only, which Render
 * can't reach, so DATABASE_URL must be the Session pooler string.
 */
export async function dbReadiness(): Promise<{ ready: boolean; error?: string; hint?: string }> {
  try {
    const ready = await checkMigrations();
    return ready ? { ready } : { ready, error: "Migrations have not finished" };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    let host = "";
    try {
      host = new URL(config.db.url).hostname;
    } catch {
      // Unparseable URL: no hint.
    }
    const hint =
      /^db\.[a-z0-9]+\.supabase\.co$/.test(host) || /ENETUNREACH|EHOSTUNREACH/.test(message)
        ? "DATABASE_URL points at Supabase's IPv6-only direct host. Use the Session pooler connection string (…pooler.supabase.com:5432) instead."
        : undefined;
    return { ready: false, error: message, ...(hint ? { hint } : {}) };
  }
}

async function checkMigrations(): Promise<boolean> {
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM _migrations WHERE name = '008_xp_and_reconciliation'
    ) AS ready
  `;
  return rows[0]?.ready === true;
}
