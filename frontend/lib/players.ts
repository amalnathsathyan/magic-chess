import { shortenAddress } from "@/lib/chess";

/** A player's display name, or their shortened wallet. */
export function playerLabel(wallet: string | null | undefined, name?: string | null): string {
  if (name) return name;
  return wallet ? shortenAddress(wallet) : "Waiting for opponent";
}

export const AVATAR_GLYPHS: Record<string, string> = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
};

export const AVATAR_OPTIONS = Object.keys(AVATAR_GLYPHS);

/** A stable piece for players who haven't picked one. */
export function avatarFor(wallet: string, avatar?: string | null): string {
  if (avatar && AVATAR_GLYPHS[avatar]) return AVATAR_GLYPHS[avatar];
  let hash = 0;
  for (const char of wallet) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Object.values(AVATAR_GLYPHS)[hash % AVATAR_OPTIONS.length];
}

/** A hue derived from the wallet, so each player's badge looks consistent. */
export function walletHue(wallet: string): number {
  let hash = 0;
  for (const char of wallet) hash = (hash * 17 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function formatRatingChange(change: number | null | undefined): string | null {
  if (change === null || change === undefined) return null;
  return change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : "±0";
}

/** "API 409: {\"error\":\"…\"}" → "…" */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const body = error.message.replace(/^API \d+: /, "");
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? fallback;
  } catch {
    return fallback;
  }
}
