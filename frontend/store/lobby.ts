import { atom } from "jotai";

export interface LobbyMatch {
  matchId: string;
  whitePlayer: string;
  blackPlayer?: string;
  wagerAmount: number;
  wagerToken: string;
  timeControl: string;
  status: "open" | "in_progress" | "completed";
  createdAt: number;
}

// Current filter state
export type LobbyFilter = "all" | "open" | "live";
export type WagerFilter = "all" | "free" | "0.1" | "0.5" | "1.0";
export type TimeControlFilter = "all" | "1+0" | "3+2" | "10+0";

export const lobbyFilterAtom = atom<LobbyFilter>("all");
export const lobbyWagerFilterAtom = atom<WagerFilter>("all");
export const lobbyTimeFilterAtom = atom<TimeControlFilter>("all");

export const lobbySearchAtom = atom<string>("");

// Match list (fetched from chain / SDK)
export const lobbyMatchesAtom = atom<LobbyMatch[]>([]);

// Loading / error states
export const lobbyLoadingAtom = atom<boolean>(false);

export const lobbyErrorAtom = atom<string | null>(null);

// Derived: filtered matches
export const filteredMatchesAtom = atom<LobbyMatch[]>((get) => {
  const matches = get(lobbyMatchesAtom);
  const filter = get(lobbyFilterAtom);
  const wagerFilter = get(lobbyWagerFilterAtom);
  const timeFilter = get(lobbyTimeFilterAtom);
  const search = get(lobbySearchAtom).toLowerCase();

  return matches.filter((m) => {
    // Status filter
    if (filter === "open" && m.status !== "open") return false;
    if (filter === "live" && m.status !== "in_progress") return false;

    // Wager filter
    if (wagerFilter !== "all") {
      if (wagerFilter === "free" && m.wagerAmount !== 0) return false;
      if (wagerFilter === "0.1" && m.wagerAmount !== 0.1) return false;
      if (wagerFilter === "0.5" && m.wagerAmount !== 0.5) return false;
      if (wagerFilter === "1.0" && m.wagerAmount !== 1.0) return false;
    }

    // Time filter
    if (timeFilter !== "all" && m.timeControl !== timeFilter) return false;

    // Search filter (match ID or player address)
    if (search) {
      const matchesSearch =
        m.matchId.toLowerCase().includes(search) ||
        m.whitePlayer.toLowerCase().includes(search) ||
        m.blackPlayer?.toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }

    return true;
  });
});

// Actions
export const refreshLobbyAtom = atom(null, (_get, set) => {
  set(lobbyLoadingAtom, true);
  set(lobbyErrorAtom, null);
  // TODO: Fetch matches from SDK
  // const matches = await sdk.getMatches();
  // set(lobbyMatchesAtom, matches);
  set(lobbyLoadingAtom, false);
});
