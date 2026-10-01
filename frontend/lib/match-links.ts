/**
 * The app is a static export, so match pages take the ID as a query parameter
 * (`/play?id=…`). A dynamic `/play/[matchId]` segment can only be prerendered
 * for known IDs, and every real ID used to render as "placeholder".
 */
export function playHref(matchId: string): string {
  return `/play?id=${encodeURIComponent(matchId)}`;
}

export function spectateHref(matchId: string): string {
  return `/spectate?id=${encodeURIComponent(matchId)}`;
}

export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
