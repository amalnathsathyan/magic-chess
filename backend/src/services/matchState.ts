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

const END_REASONS = [
  "Checkmate",
  "Stalemate",
  "Resignation",
  "Timeout",
  "FiftyMoveRule",
  "ThreefoldRepetition",
  "Aborted",
  "InsufficientMaterial",
] as const;

const FEN_PIECES = ["p", "n", "b", "r", "q", "k"];
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

/** Everything the index needs from a `ChessMatch` account. */
export interface MatchAccount {
  matchId: string;
  white: string;
  black: string | null;
  currentTurn: "white" | "black";
  gameStatus: ChainGameStatus;
  endReason: (typeof END_REASONS)[number] | null;
  lastMoveTimestamp: number;
  moveTimeoutSeconds: number;
  fen: string;
  pliesPlayed: number;
  /** Null when the account tail doesn't decode (older program layout). */
  wager: {
    mint: string;
    betPerPlayer: string;
    totalPot: string;
    feeBps: number;
    payoutProcessed: boolean;
  } | null;
}

/**
 * Decode the full `ChessMatch` account. The head (players, status, board) is
 * stable across program versions; the wager fields after the position
 * history are read best-effort, since the deployed program can lag the source.
 */
export function decodeMatchAccount(data: Buffer): MatchAccount {
  let offset = 8;
  const need = (bytes: number) => {
    if (offset + bytes > data.length) throw new Error("Truncated ChessMatch account");
  };
  const u8 = () => {
    need(1);
    return data[offset++];
  };
  const u16 = () => {
    need(2);
    const value = data.readUInt16LE(offset);
    offset += 2;
    return value;
  };
  const u32 = () => {
    need(4);
    const value = data.readUInt32LE(offset);
    offset += 4;
    return value;
  };
  const u64 = () => {
    need(8);
    const value = data.readBigUInt64LE(offset);
    offset += 8;
    return value.toString();
  };
  const i64 = () => {
    need(8);
    const value = Number(data.readBigInt64LE(offset));
    offset += 8;
    return value;
  };
  const pubkey = () => {
    need(32);
    const value = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    return value;
  };

  const idLength = u32();
  need(idLength);
  const matchId = data.subarray(offset, offset + idLength).toString("utf8");
  offset += idLength;
  const white = pubkey();
  const black = pubkey();
  u8(); // current_player_idx
  const currentTurn = u8() === 0 ? "white" : "black";
  const lastMoveTimestamp = i64();
  const moveTimeoutSeconds = i64();
  const gameStatus = GAME_STATUS[u8()];
  if (!gameStatus) throw new Error("Invalid game status");
  const endReason = u8() === 1 ? (END_REASONS[u8()] ?? null) : null;

  const board: string[][] = [];
  for (let row = 0; row < 8; row += 1) {
    const squares: string[] = [];
    for (let col = 0; col < 8; col += 1) {
      if (u8() === 1) {
        const piece = FEN_PIECES[u8()] ?? "?";
        squares.push(u8() === 0 ? piece.toUpperCase() : piece);
      } else {
        squares.push("");
      }
    }
    board.push(squares);
  }
  const castling = [u8(), u8(), u8(), u8()];
  const enPassant = u8() === 1 ? { row: u8(), col: u8() } : null;
  const halfmove = u8();
  const fullmove = u16();

  const placement = [...board]
    .reverse()
    .map((squares) => {
      let rank = "";
      let empty = 0;
      for (const square of squares) {
        if (!square) {
          empty += 1;
          continue;
        }
        if (empty) rank += String(empty);
        empty = 0;
        rank += square;
      }
      return empty ? rank + String(empty) : rank;
    })
    .join("/");
  const rights = ["K", "Q", "k", "q"].filter((_, i) => castling[i] === 1).join("") || "-";
  const ep = enPassant ? `${"abcdefgh"[enPassant.col]}${enPassant.row + 1}` : "-";
  const fen = `${placement} ${currentTurn === "white" ? "w" : "b"} ${rights} ${ep} ${halfmove} ${fullmove}`;

  let wager: MatchAccount["wager"] = null;
  try {
    const history = u32();
    need(history * 8);
    offset += history * 8;
    const mint = pubkey();
    const betOne = u64();
    u64(); // bet_amount_player_two
    const totalPot = u64();
    const feeBps = u16();
    pubkey(); // platform_fee_wallet
    const payoutProcessed = u8() === 1;
    wager = { mint, betPerPlayer: betOne, totalPot, feeBps, payoutProcessed };
  } catch {
    wager = null;
  }

  return {
    matchId,
    white,
    black: black === DEFAULT_PUBKEY ? null : black,
    currentTurn,
    gameStatus,
    endReason,
    lastMoveTimestamp,
    moveTimeoutSeconds,
    fen,
    pliesPlayed: (fullmove - 1) * 2 + (currentTurn === "black" ? 1 : 0),
    wager,
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
