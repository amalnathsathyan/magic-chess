/**
 * Post-transaction sync helpers.
 * Call these after on-chain transactions confirm to index data in the backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

async function syncPost(
  path: string,
  body: Record<string, unknown>
): Promise<void> {
  if (!API_URL || !API_KEY) return; // No backend configured
  try {
    await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Fire-and-forget; polling reconciles later
  }
}

export function syncMatchCreated(params: {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
}) {
  return syncPost("/api/sync/match-created", params);
}

export function syncMoveMade(params: {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
}) {
  return syncPost("/api/sync/move-made", params);
}

export function syncGameEnded(params: {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
}) {
  return syncPost("/api/sync/game-ended", params);
}
