import { PublicKey, type Connection } from "@solana/web3.js";
import {
  baseConnection,
  DELEGATION_PROGRAM_ID,
  erConnection,
  getDelegationStatus,
  matchPda,
  programId,
} from "./transactionVerifier.js";

/**
 * Minimal, dependency-free decoder for the head of the on-chain `ChessMatch`
 * account: enough to know whose turn it is and how many plies have been
 * played. Used to lock move markets against the authoritative runtime rather
 * than the (possibly lagging) index.
 */

export type ChainGameStatus =
  | "waitingForOpponent"
  | "active"
  | "whiteWins"
  | "blackWins"
  | "draw"
  | "aborted";

export interface LiveMatchState {
  matchId: string;
  players: [string, string];
  currentTurn: "white" | "black";
  gameStatus: ChainGameStatus;
  fullmoveNumber: number;
  /** Half-moves already played. The next move is ply `pliesPlayed + 1`. */
  pliesPlayed: number;
  lastMoveTimestamp: number;
  runtime: "base" | "ephemeral";
}

const GAME_STATUS: ChainGameStatus[] = [
  "waitingForOpponent",
  "active",
  "whiteWins",
  "blackWins",
  "draw",
  "aborted",
];

export function decodeMatchHead(
  data: Buffer
): Omit<LiveMatchState, "runtime"> {
  let offset = 8; // Anchor discriminator
  const need = (bytes: number) => {
    if (offset + bytes > data.length) throw new Error("Truncated ChessMatch account");
  };
  const u8 = () => {
    need(1);
    return data[offset++];
  };

  need(4);
  const idLength = data.readUInt32LE(offset);
  offset += 4;
  need(idLength);
  const matchId = data.subarray(offset, offset + idLength).toString("utf8");
  offset += idLength;

  need(64);
  const white = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  const black = new PublicKey(data.subarray(offset + 32, offset + 64)).toBase58();
  offset += 64;

  u8(); // current_player_idx (layout only)
  const turn = u8();
  need(16);
  const lastMoveTimestamp = Number(data.readBigInt64LE(offset));
  offset += 16; // last_move_timestamp + move_timeout_duration
  const status = GAME_STATUS[u8()];
  if (!status) throw new Error("Invalid game status");
  if (u8() === 1) u8(); // Option<GameEndReason>

  for (let square = 0; square < 64; square += 1) {
    if (u8() === 1) offset += 2; // Option<Piece { piece_type, color }>
  }
  offset += 4; // castling rights
  if (u8() === 1) offset += 2; // Option<EnPassantSquare>
  u8(); // halfmove clock
  need(2);
  const fullmoveNumber = data.readUInt16LE(offset);

  const currentTurn = turn === 0 ? "white" : "black";
  return {
    matchId,
    players: [white, black],
    currentTurn,
    gameStatus: status,
    fullmoveNumber,
    pliesPlayed: (fullmoveNumber - 1) * 2 + (currentTurn === "black" ? 1 : 0),
    lastMoveTimestamp,
  };
}

const runtimeCache = new Map<string, { connection: Connection; at: number }>();

/** Read the match from its authoritative runtime (ER while delegated). */
export async function readLiveMatchState(matchId: string): Promise<LiveMatchState | null> {
  const pda = matchPda(matchId);
  const base = await baseConnection.getAccountInfo(pda, "confirmed");
  if (!base) return null;

  if (base.owner.equals(programId)) {
    return { ...decodeMatchHead(base.data), runtime: "base" };
  }
  if (!base.owner.equals(DELEGATION_PROGRAM_ID)) {
    throw new Error("Match account has an unexpected owner");
  }

  let cached = runtimeCache.get(matchId);
  if (!cached || Date.now() - cached.at > 30_000) {
    const status = await getDelegationStatus(pda);
    if (!status.isDelegated || !status.fqdn) {
      throw new Error("Match is delegated but its rollup endpoint is unknown");
    }
    cached = { connection: erConnection(status.fqdn), at: Date.now() };
    runtimeCache.set(matchId, cached);
    if (runtimeCache.size > 1_000) runtimeCache.clear();
  }
  // Always a fresh account read: the lock decision must not use stale data.
  const info = await cached.connection.getAccountInfo(pda, "confirmed");
  if (!info?.owner.equals(programId)) {
    runtimeCache.delete(matchId);
    throw new Error("Match is unavailable on its rollup");
  }
  return { ...decodeMatchHead(info.data), runtime: "ephemeral" };
}
