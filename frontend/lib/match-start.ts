import { matchStartState, type MatchStartState } from "@magic-chess/sdk";

export type { MatchStartState };

/** Start state of an open match from its id and on-chain creation time. */
export function getMatchStart(
  matchId: string,
  createdAt: number | bigint,
  nowMs: number
): MatchStartState {
  return matchStartState(matchId, createdAt, Math.floor(nowMs / 1000));
}

/** "7:00 PM" today, otherwise "Sat 7:00 PM" this week, otherwise "Nov 7, 7:00 PM". */
export function formatStartTime(startsAtSeconds: number, nowMs: number): string {
  const start = new Date(startsAtSeconds * 1000);
  const now = new Date(nowMs);
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) return time;
  const days = (start.getTime() - now.getTime()) / 86_400_000;
  if (days > 0 && days < 6) {
    return `${start.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

/** The start time with the device's time zone, for messages sent to others. */
export function formatStartTimeWithZone(startsAtSeconds: number, nowMs: number): string {
  const zone = new Date(startsAtSeconds * 1000)
    .toLocaleTimeString(undefined, { timeZoneName: "short" })
    .split(" ")
    .at(-1);
  return `${formatStartTime(startsAtSeconds, nowMs)}${zone ? ` ${zone}` : ""}`;
}

/** "9:41" style countdown for the next hour, otherwise "2 h 05 min" or "3 days". */
export function formatCountdown(untilSeconds: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil(untilSeconds - nowMs / 1000));
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}:${String(seconds % 60).padStart(2, "0")}`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) {
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours} h ${String(mins).padStart(2, "0")} min`;
  }
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/** One line for a list row: when the match starts, or that its window closed. */
export function describeStart(state: MatchStartState, nowMs: number): string {
  switch (state.phase) {
    case "upcoming":
      return `Starts ${formatStartTime(state.startsAt, nowMs)} (in ${formatCountdown(state.startsAt, nowMs)})`;
    case "expired":
      return "No one joined in time";
    default:
      return state.scheduled
        ? `Started ${formatStartTime(state.startsAt, nowMs)}, open to join`
        : "Open to join";
  }
}
