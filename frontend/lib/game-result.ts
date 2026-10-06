export type Outcome = "win" | "loss" | "draw";

const TERMINAL = new Set(["WhiteWins", "BlackWins", "Draw"]);

export function isFinishedStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** PGN result token for a DB game status. */
export function resultScore(status: string): "1-0" | "0-1" | "½-½" | null {
  if (status === "WhiteWins") return "1-0";
  if (status === "BlackWins") return "0-1";
  if (status === "Draw") return "½-½";
  return null;
}

export function pgnResult(status: string): string | undefined {
  const score = resultScore(status);
  return score === "½-½" ? "1/2-1/2" : score ?? undefined;
}

export function resultHeadline(status: string): string {
  if (status === "WhiteWins") return "White won";
  if (status === "BlackWins") return "Black won";
  if (status === "Draw") return "Draw";
  if (status === "Aborted") return "Aborted";
  return "In progress";
}

/** "ThreefoldRepetition" → "Threefold repetition" */
export function formatEndReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const spaced = reason.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function outcomeFor(status: string, color: "white" | "black"): Outcome | null {
  if (status === "Draw") return "draw";
  if (status === "WhiteWins") return color === "white" ? "win" : "loss";
  if (status === "BlackWins") return color === "black" ? "win" : "loss";
  return null;
}

export function formatDuration(startIso: string | null | undefined, endIso: string | null | undefined): string | null {
  if (!startIso || !endIso) return null;
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1_000))}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
