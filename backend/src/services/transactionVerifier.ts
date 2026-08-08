import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";

const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const programId = new PublicKey(config.solana.programId);
const baseConnection = new Connection(config.solana.rpcEndpoint, "confirmed");

const EVENT_DISCRIMINATORS = {
  DrawPayoutEvent: Buffer.from([204, 185, 220, 244, 158, 169, 10, 187]),
  GameEndedEvent: Buffer.from([124, 244, 251, 112, 20, 68, 87, 116]),
  MatchAbortedEvent: Buffer.from([93, 79, 182, 70, 188, 217, 236, 43]),
  MatchCreatedEvent: Buffer.from([101, 99, 74, 54, 121, 190, 111, 238]),
  MoveMadeEvent: Buffer.from([116, 181, 208, 158, 192, 84, 32, 251]),
  PayoutEvent: Buffer.from([84, 234, 195, 72, 143, 79, 70, 82]),
  PlayerJoinedEvent: Buffer.from([80, 201, 181, 60, 46, 141, 44, 189]),
} as const;

export type VerifiedProgramEvent =
  | {
      name: "MatchCreatedEvent";
      matchId: string;
      creator: string;
      bettingTokenMint: string;
      betAmount: string;
      moveTimeoutDuration: string;
      platformFeeBasisPoints: number;
    }
  | {
      name: "PlayerJoinedEvent";
      matchId: string;
      playerOne: string;
      playerTwo: string;
      bettingTokenMint: string;
      betAmountPerPlayer: string;
    }
  | {
      name: "MoveMadeEvent";
      matchId: string;
      player: string;
      playerColor: "white" | "black";
      algebraicMove: string;
      fromRow: number;
      fromCol: number;
      toRow: number;
      toCol: number;
      promotionPiece: string | null;
      boardFen: string;
      isCheck: boolean;
      isCheckmate: boolean;
      isStalemate: boolean;
    }
  | {
      name: "GameEndedEvent";
      matchId: string;
      status: "whiteWins" | "blackWins" | "draw";
      winner: "white" | "black" | null;
      reason: string;
    }
  | {
      name: "MatchAbortedEvent";
      matchId: string;
      creator: string;
    }
  | {
      name: "PayoutEvent";
      matchId: string;
      winner: string;
      amount: string;
      fee: string;
    }
  | {
      name: "DrawPayoutEvent";
      matchId: string;
      whitePlayer: string;
      blackPlayer: string;
      amountEach: string;
      fee: string;
    };

type EventName = VerifiedProgramEvent["name"];

interface DelegationStatus {
  isDelegated: boolean;
  fqdn?: string;
}

class BorshCursor {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  private take(length: number): Buffer {
    if (length < 0 || this.offset + length > this.data.length) {
      throw new Error("Truncated Anchor event data");
    }
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  u8(): number {
    return this.take(1)[0];
  }

  bool(): boolean {
    const value = this.u8();
    if (value !== 0 && value !== 1) throw new Error("Invalid Borsh boolean");
    return value === 1;
  }

  u16(): number {
    return this.take(2).readUInt16LE(0);
  }

  u64(): string {
    return this.take(8).readBigUInt64LE(0).toString();
  }

  i64(): string {
    return this.take(8).readBigInt64LE(0).toString();
  }

  string(): string {
    const length = this.take(4).readUInt32LE(0);
    return this.take(length).toString("utf8");
  }

  pubkey(): string {
    return new PublicKey(this.take(32)).toBase58();
  }

  option<T>(read: () => T): T | null {
    const tag = this.u8();
    if (tag === 0) return null;
    if (tag !== 1) throw new Error("Invalid Borsh option tag");
    return read();
  }
}

const playerColor = (value: number): "white" | "black" => {
  if (value === 0) return "white";
  if (value === 1) return "black";
  throw new Error("Invalid PlayerColor event value");
};

const gameStatus = (value: number): "whiteWins" | "blackWins" | "draw" => {
  if (value === 2) return "whiteWins";
  if (value === 3) return "blackWins";
  if (value === 4) return "draw";
  throw new Error("GameEndedEvent contains a non-terminal status");
};

const gameEndReason = (value: number): string => {
  const values = [
    "checkmate",
    "stalemate",
    "resignation",
    "timeout",
    "fiftyMoveRule",
    "threefoldRepetition",
    "aborted",
    "insufficientMaterial",
  ];
  const reason = values[value];
  if (!reason) throw new Error("Invalid GameEndReason event value");
  return reason;
};

const pieceType = (value: number): string => {
  const values = ["Pawn", "Knight", "Bishop", "Rook", "Queen", "King"];
  const piece = values[value];
  if (!piece) throw new Error("Invalid PieceType event value");
  return piece;
};

function eventName(data: Buffer): EventName | null {
  for (const [name, discriminator] of Object.entries(EVENT_DISCRIMINATORS)) {
    if (data.subarray(0, 8).equals(discriminator)) return name as EventName;
  }
  return null;
}

export function decodeEvent(data: Buffer): VerifiedProgramEvent | null {
  const name = eventName(data);
  if (!name) return null;
  const cursor = new BorshCursor(data.subarray(8));

  switch (name) {
    case "MatchCreatedEvent":
      return {
        name,
        matchId: cursor.string(),
        creator: cursor.pubkey(),
        bettingTokenMint: cursor.pubkey(),
        betAmount: cursor.u64(),
        moveTimeoutDuration: cursor.i64(),
        platformFeeBasisPoints: cursor.u16(),
      };
    case "PlayerJoinedEvent":
      return {
        name,
        matchId: cursor.string(),
        playerOne: cursor.pubkey(),
        playerTwo: cursor.pubkey(),
        bettingTokenMint: cursor.pubkey(),
        betAmountPerPlayer: cursor.u64(),
      };
    case "MoveMadeEvent":
      return {
        name,
        matchId: cursor.string(),
        player: cursor.pubkey(),
        playerColor: playerColor(cursor.u8()),
        algebraicMove: cursor.string(),
        fromRow: cursor.u8(),
        fromCol: cursor.u8(),
        toRow: cursor.u8(),
        toCol: cursor.u8(),
        promotionPiece: cursor.option(() => pieceType(cursor.u8())),
        boardFen: cursor.string(),
        isCheck: cursor.bool(),
        isCheckmate: cursor.bool(),
        isStalemate: cursor.bool(),
      };
    case "GameEndedEvent":
      return {
        name,
        matchId: cursor.string(),
        status: gameStatus(cursor.u8()),
        winner: cursor.option(() => playerColor(cursor.u8())),
        reason: gameEndReason(cursor.u8()),
      };
    case "MatchAbortedEvent":
      return {
        name,
        matchId: cursor.string(),
        creator: cursor.pubkey(),
      };
    case "PayoutEvent":
      return {
        name,
        matchId: cursor.string(),
        winner: cursor.pubkey(),
        amount: cursor.u64(),
        fee: cursor.u64(),
      };
    case "DrawPayoutEvent":
      return {
        name,
        matchId: cursor.string(),
        whitePlayer: cursor.pubkey(),
        blackPlayer: cursor.pubkey(),
        amountEach: cursor.u64(),
        fee: cursor.u64(),
      };
  }
}

async function getDelegationStatus(account: PublicKey): Promise<DelegationStatus> {
  const response = await fetch(config.solana.routerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });
  if (!response.ok) throw new Error(`MagicBlock router returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: DelegationStatus;
  };
  if (body.error || !body.result) {
    throw new Error(body.error?.message || "Missing delegation status");
  }
  return body.result;
}

function erConnection(fqdn: string): Connection {
  const endpoint = new URL(/^https?:\/\//.test(fqdn) ? fqdn : `https://${fqdn}`);
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".magicblock.app")) {
    throw new Error("Untrusted ER endpoint");
  }
  const expectsDevnet = config.solana.routerEndpoint.includes("devnet");
  if (expectsDevnet !== endpoint.hostname.startsWith("devnet-")) {
    throw new Error("ER endpoint does not match the configured network");
  }
  return new Connection(endpoint.toString(), "confirmed");
}

function matchPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)],
    programId
  )[0];
}

async function candidateConnections(
  account: PublicKey,
  runtimeEndpoint?: string
): Promise<Connection[]> {
  const connections: Connection[] = [];
  if (runtimeEndpoint) connections.push(erConnection(runtimeEndpoint));

  try {
    const accountInfo = await baseConnection.getAccountInfo(account, "confirmed");
    if (accountInfo?.owner.equals(DELEGATION_PROGRAM_ID)) {
      const status = await getDelegationStatus(account);
      if (status.isDelegated && status.fqdn) connections.push(erConnection(status.fqdn));
    }
  } catch (error) {
    if (!runtimeEndpoint) throw error;
  }
  connections.push(baseConnection);

  return connections.filter(
    (connection, index, all) =>
      all.findIndex((candidate) => candidate.rpcEndpoint === connection.rpcEndpoint) === index
  );
}

function indexedProgramEvents(
  logs: string[]
): Array<{ event: VerifiedProgramEvent; eventIndex: number }> {
  const stack: string[] = [];
  const events: Array<{ event: VerifiedProgramEvent; eventIndex: number }> = [];

  for (const [eventIndex, log] of logs.entries()) {
    const invoke = /^Program (\w+) invoke \[\d+\]$/.exec(log);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }

    const completed = /^Program (\w+) (?:success|failed:)/.exec(log);
    if (completed) {
      const index = stack.lastIndexOf(completed[1]);
      if (index >= 0) stack.splice(index);
      continue;
    }

    if (stack.at(-1) !== programId.toBase58() || !log.startsWith("Program data: ")) {
      continue;
    }
    const event = decodeEvent(Buffer.from(log.slice("Program data: ".length), "base64"));
    if (event) events.push({ event, eventIndex });
  }
  return events;
}

export function programEvents(logs: string[]): VerifiedProgramEvent[] {
  return indexedProgramEvents(logs).map(({ event }) => event);
}

export async function verifyProgramEvent(args: {
  signature: string;
  matchId: string;
  eventNames: EventName[];
  runtimeEndpoint?: string;
  eventIndex?: number;
}): Promise<{
  event: VerifiedProgramEvent;
  slot: number;
  eventIndex: number;
  blockTime: number | null;
}> {
  const account = matchPda(args.matchId);
  for (const connection of await candidateConnections(account, args.runtimeEndpoint)) {
    const transaction = await connection.getParsedTransaction(args.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) continue;
    if (transaction.meta?.err) {
      throw { statusCode: 422, message: "Sync transaction failed on-chain" };
    }

    const matches = indexedProgramEvents(transaction.meta?.logMessages ?? []).filter(
      ({ event, eventIndex }) =>
        args.eventNames.includes(event.name) &&
        event.matchId === args.matchId &&
        (args.eventIndex === undefined || args.eventIndex === eventIndex)
    );
    if (matches.length === 0) {
      throw {
        statusCode: 422,
        message: "Transaction does not contain the expected Magic Chess event",
      };
    }
    if (matches.length > 1) {
      throw {
        statusCode: 422,
        message: "Multiple matching events found; eventIndex is required",
      };
    }
    return {
      event: matches[0].event,
      slot: transaction.slot,
      eventIndex: matches[0].eventIndex,
      blockTime: transaction.blockTime ?? null,
    };
  }

  throw { statusCode: 422, message: "Sync transaction was not found on its runtime" };
}
