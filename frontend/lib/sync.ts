/**
 * Post-transaction sync helpers.
 * Call these after on-chain transactions confirm to index data in the backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function syncPost(
  path: string,
  body: Record<string, unknown>
): Promise<void> {
  if (!API_URL) return; // No backend configured
  try {
    const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!response.ok) {
      throw new Error(`Backend sync failed (${response.status})`);
    }
  } catch (error) {
    // On-chain state is authoritative; polling can reconcile a failed hint.
    console.warn(`Could not sync ${path}`, error);
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

export function syncPlayerJoined(params: {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
}) {
  return syncPost("/api/sync/player-joined", params);
}

export function syncGameEnded(params: {
  matchId: string;
  signature: string;
  runtimeEndpoint?: string;
}) {
  return syncPost("/api/sync/game-ended", params);
}
