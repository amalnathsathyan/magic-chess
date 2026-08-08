import { randomBytes, randomUUID } from "node:crypto";

export type MatchRealtimeRole = "white" | "black" | "spectator";

export interface MatchRealtimeSnapshot {
  matchId: string;
  whitePlayer: string;
  blackPlayer: string | null;
  gameStatus: string;
  gameEndReason: string | null;
  bettingTokenMint: string;
  betAmountPerPlayer: string;
  totalPot: string;
  moveTimeoutSeconds: string;
  currentFen: string;
  currentTurn: "white" | "black" | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastMoveAt: string;
  payoutProcessed: boolean;
  moveCount: number;
}

export interface MatchClock {
  serverTime: string;
  activeColor: "white" | "black" | null;
  deadlineAt: string | null;
  remainingMs: number | null;
  expired: boolean;
  authority: "confirmed-chain-index";
}

export interface RealtimeEvent {
  id: string;
  event: string;
  data: unknown;
}

interface RealtimeSession {
  token: string;
  matchId: string;
  clientId: string;
  wallet: string | null;
  role: MatchRealtimeRole;
  expiresAt: number;
}

interface Connection {
  id: string;
  sessionToken: string;
  send: (event: RealtimeEvent) => void;
  close: () => void;
}

export interface MatchNotification {
  type:
    | "match-created"
    | "player-joined"
    | "match-aborted"
    | "move-made"
    | "game-ended"
    | "payout-processed"
    | "match-updated";
  [key: string]: unknown;
}

const ACTIVE_STATUS = "Active";
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_EVENT_BUFFER_SIZE = 128;
const DEFAULT_MAX_SESSIONS = 10_000;
const DEFAULT_MAX_SESSIONS_PER_MATCH = 250;
const MAX_DATE_MS = 8_640_000_000_000_000n;

export class RealtimeCapacityError extends Error {
  constructor() {
    super("Realtime session capacity reached");
    this.name = "RealtimeCapacityError";
  }
}

export function calculateMatchClock(
  snapshot: MatchRealtimeSnapshot,
  nowMs = Date.now()
): MatchClock {
  if (snapshot.gameStatus !== ACTIVE_STATUS || snapshot.currentTurn === null) {
    return {
      serverTime: new Date(nowMs).toISOString(),
      activeColor: null,
      deadlineAt: null,
      remainingMs: null,
      expired: false,
      authority: "confirmed-chain-index",
    };
  }

  const lastMoveAt = Date.parse(snapshot.lastMoveAt);
  let timeoutSeconds: bigint;
  try {
    timeoutSeconds = BigInt(snapshot.moveTimeoutSeconds);
  } catch {
    timeoutSeconds = 0n;
  }
  if (!Number.isFinite(lastMoveAt) || timeoutSeconds <= 0n) {
    return {
      serverTime: new Date(nowMs).toISOString(),
      activeColor: snapshot.currentTurn,
      deadlineAt: null,
      remainingMs: null,
      expired: false,
      authority: "confirmed-chain-index",
    };
  }

  const deadlineValue = BigInt(Math.trunc(lastMoveAt)) + timeoutSeconds * 1000n;
  if (deadlineValue < -MAX_DATE_MS || deadlineValue > MAX_DATE_MS) {
    return {
      serverTime: new Date(nowMs).toISOString(),
      activeColor: snapshot.currentTurn,
      deadlineAt: null,
      remainingMs: null,
      expired: false,
      authority: "confirmed-chain-index",
    };
  }
  const deadlineMs = Number(deadlineValue);
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  return {
    serverTime: new Date(nowMs).toISOString(),
    activeColor: snapshot.currentTurn,
    deadlineAt: new Date(deadlineMs).toISOString(),
    remainingMs,
    expired: remainingMs === 0,
    authority: "confirmed-chain-index",
  };
}

export class MatchRealtimeHub {
  private readonly sessions = new Map<string, RealtimeSession>();
  private readonly connections = new Map<string, Map<string, Connection>>();
  private readonly snapshots = new Map<string, MatchRealtimeSnapshot>();
  private readonly eventBuffers = new Map<string, RealtimeEvent[]>();
  private readonly refreshInFlight = new Set<string>();
  private sequence = 0n;
  private clockTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly loadSnapshot: (
      matchId: string
    ) => Promise<MatchRealtimeSnapshot | null>,
    private readonly options: {
      now?: () => number;
      sessionTtlMs?: number;
      eventBufferSize?: number;
      maxSessions?: number;
      maxSessionsPerMatch?: number;
      clockIntervalMs?: number;
      refreshIntervalMs?: number;
      onRefreshError?: (error: unknown, matchId: string) => void;
    } = {}
  ) {}

  start(): void {
    if (!this.clockTimer) {
      this.clockTimer = setInterval(
        () => this.publishClockTicks(),
        this.options.clockIntervalMs ?? 1000
      );
      this.clockTimer.unref();
    }
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => void this.refreshConnectedMatches(),
        this.options.refreshIntervalMs ?? 3000
      );
      this.refreshTimer.unref();
    }
  }

  close(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.clockTimer = null;
    this.refreshTimer = null;
    for (const entries of this.connections.values()) {
      for (const connection of entries.values()) connection.close();
    }
    this.connections.clear();
    this.sessions.clear();
    this.snapshots.clear();
    this.eventBuffers.clear();
  }

  createSession(args: {
    snapshot: MatchRealtimeSnapshot;
    wallet?: string;
    clientId?: string;
  }): {
    token: string;
    clientId: string;
    role: MatchRealtimeRole;
    expiresAt: string;
  } {
    const now = this.now();
    this.pruneExpiredSessions(now);
    const clientId = args.clientId ?? randomUUID();
    const wallet = args.wallet ?? null;
    for (const [token, session] of this.sessions) {
      if (
        session.matchId === args.snapshot.matchId &&
        session.clientId === clientId &&
        session.wallet === wallet
      ) {
        this.revokeSession(token);
      }
    }
    if (
      this.sessions.size >=
      (this.options.maxSessions ?? DEFAULT_MAX_SESSIONS)
    ) {
      throw new RealtimeCapacityError();
    }
    let matchSessionCount = 0;
    for (const session of this.sessions.values()) {
      if (session.matchId === args.snapshot.matchId) matchSessionCount += 1;
    }
    if (
      matchSessionCount >=
      (this.options.maxSessionsPerMatch ?? DEFAULT_MAX_SESSIONS_PER_MATCH)
    ) {
      throw new RealtimeCapacityError();
    }
    const role: MatchRealtimeRole =
      wallet === args.snapshot.whitePlayer
        ? "white"
        : wallet === args.snapshot.blackPlayer
          ? "black"
          : "spectator";
    const token = randomBytes(32).toString("base64url");
    const session: RealtimeSession = {
      token,
      matchId: args.snapshot.matchId,
      clientId,
      wallet,
      role,
      expiresAt: now + (this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS),
    };
    this.sessions.set(token, session);
    this.snapshots.set(args.snapshot.matchId, args.snapshot);
    return {
      token,
      clientId: session.clientId,
      role,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  hasSession(matchId: string, token: string): boolean {
    const now = this.now();
    this.pruneExpiredSessions(now);
    return this.sessions.get(token)?.matchId === matchId;
  }

  subscribe(args: {
    matchId: string;
    token: string;
    lastEventId?: string;
    send: (event: RealtimeEvent) => void;
    close?: () => void;
  }): { connectionId: string; disconnect: () => void } | null {
    const now = this.now();
    this.pruneExpiredSessions(now);
    const session = this.sessions.get(args.token);
    if (!session || session.matchId !== args.matchId) return null;

    const connectionId = randomUUID();
    const matchConnections = this.connections.get(args.matchId) ?? new Map();
    for (const [id, connection] of matchConnections) {
      if (connection.sessionToken === args.token) {
        matchConnections.delete(id);
        connection.close();
      }
    }
    matchConnections.set(connectionId, {
      id: connectionId,
      sessionToken: args.token,
      send: args.send,
      close: args.close ?? (() => undefined),
    });
    this.connections.set(args.matchId, matchConnections);

    const replayed = this.replay(args.matchId, args.lastEventId, args.send);
    args.send(
      this.directEvent("session.ready", {
        connectionId,
        clientId: session.clientId,
        role: session.role,
        replayed,
        serverTime: new Date(now).toISOString(),
      })
    );
    const snapshot = this.snapshots.get(args.matchId);
    if (snapshot && replayed === 0) {
      args.send(
        this.directEvent("match.snapshot", {
          ...snapshot,
          clock: calculateMatchClock(snapshot, now),
        })
      );
    }
    this.broadcastPresence(args.matchId, "presence.joined", session.role);

    let disconnected = false;
    return {
      connectionId,
      disconnect: () => {
        if (disconnected) return;
        disconnected = true;
        const active = this.connections.get(args.matchId);
        active?.delete(connectionId);
        if (active?.size === 0) this.connections.delete(args.matchId);
        this.broadcastPresence(args.matchId, "presence.left", session.role);
      },
    };
  }

  async refresh(
    matchId: string,
    notification?: MatchNotification
  ): Promise<MatchRealtimeSnapshot | null> {
    const snapshot = await this.loadSnapshot(matchId);
    if (!snapshot) return null;
    if (!this.hasAudience(matchId)) return snapshot;
    const prior = this.snapshots.get(matchId);
    this.snapshots.set(matchId, snapshot);
    if (notification) this.publish(matchId, "match.notification", notification);
    if (!prior || this.snapshotFingerprint(prior) !== this.snapshotFingerprint(snapshot)) {
      this.publish(matchId, "match.snapshot", {
        ...snapshot,
        clock: calculateMatchClock(snapshot, this.now()),
      });
    }
    return snapshot;
  }

  publish(matchId: string, event: string, data: unknown): RealtimeEvent {
    const realtimeEvent = this.bufferedEvent(event, data);
    if (!this.hasAudience(matchId)) return realtimeEvent;
    const buffer = this.eventBuffers.get(matchId) ?? [];
    buffer.push(realtimeEvent);
    const maximum = this.options.eventBufferSize ?? DEFAULT_EVENT_BUFFER_SIZE;
    if (buffer.length > maximum) buffer.splice(0, buffer.length - maximum);
    this.eventBuffers.set(matchId, buffer);
    for (const connection of this.connections.get(matchId)?.values() ?? []) {
      connection.send(realtimeEvent);
    }
    return realtimeEvent;
  }

  stats(): { connections: number; sessions: number; matches: number } {
    let connections = 0;
    for (const entries of this.connections.values()) connections += entries.size;
    return {
      connections,
      sessions: this.sessions.size,
      matches: this.connections.size,
    };
  }

  private publishClockTicks(): void {
    const now = this.now();
    for (const [matchId, connections] of this.connections) {
      if (connections.size === 0) continue;
      const snapshot = this.snapshots.get(matchId);
      if (!snapshot || snapshot.gameStatus !== ACTIVE_STATUS) continue;
      this.broadcastTransient(
        matchId,
        "clock.tick",
        calculateMatchClock(snapshot, now)
      );
    }
  }

  private async refreshConnectedMatches(): Promise<void> {
    await Promise.all(
      [...this.connections.keys()].map(async (matchId) => {
        if (this.refreshInFlight.has(matchId)) return;
        this.refreshInFlight.add(matchId);
        try {
          await this.refresh(matchId);
        } catch (error) {
          // The next polling interval retries; connected clients retain their
          // last confirmed snapshot and ticking deadline in the meantime.
          this.options.onRefreshError?.(error, matchId);
        } finally {
          this.refreshInFlight.delete(matchId);
        }
      })
    );
  }

  private broadcastPresence(
    matchId: string,
    cause: "presence.joined" | "presence.left",
    role: MatchRealtimeRole
  ): void {
    const roles = new Map<MatchRealtimeRole, Set<string>>([
      ["white", new Set()],
      ["black", new Set()],
      ["spectator", new Set()],
    ]);
    for (const connection of this.connections.get(matchId)?.values() ?? []) {
      const session = this.sessions.get(connection.sessionToken);
      if (session) roles.get(session.role)?.add(session.token);
    }
    this.publish(matchId, "presence.sync", {
      cause,
      role,
      white: { online: (roles.get("white")?.size ?? 0) > 0 },
      black: { online: (roles.get("black")?.size ?? 0) > 0 },
      spectators: roles.get("spectator")?.size ?? 0,
      connections: this.connections.get(matchId)?.size ?? 0,
      serverTime: new Date(this.now()).toISOString(),
    });
  }

  private replay(
    matchId: string,
    lastEventId: string | undefined,
    send: (event: RealtimeEvent) => void
  ): number {
    if (!lastEventId) return 0;
    let last: bigint;
    try {
      last = BigInt(lastEventId);
    } catch {
      send(this.directEvent("resync.required", { reason: "invalid-event-id" }));
      return 0;
    }
    const buffer = this.eventBuffers.get(matchId) ?? [];
    if (buffer.length > 0 && last < BigInt(buffer[0].id) - 1n) {
      send(this.directEvent("resync.required", { reason: "event-buffer-expired" }));
      return 0;
    }
    const missed = buffer.filter((event) => BigInt(event.id) > last);
    for (const event of missed) send(event);
    return missed.length;
  }

  private pruneExpiredSessions(now: number): void {
    const affectedMatches = new Set<string>();
    const expiredTokens = new Set<string>();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
        expiredTokens.add(token);
        affectedMatches.add(session.matchId);
      }
    }
    for (const [matchId, entries] of this.connections) {
      for (const [connectionId, connection] of entries) {
        if (!expiredTokens.has(connection.sessionToken)) continue;
        entries.delete(connectionId);
        connection.close();
      }
      if (entries.size === 0) this.connections.delete(matchId);
    }
    for (const matchId of affectedMatches) {
      if (!this.hasAudience(matchId)) {
        this.snapshots.delete(matchId);
        this.eventBuffers.delete(matchId);
      }
    }
  }

  private hasAudience(matchId: string): boolean {
    if ((this.connections.get(matchId)?.size ?? 0) > 0) return true;
    for (const session of this.sessions.values()) {
      if (session.matchId === matchId) return true;
    }
    return false;
  }

  private revokeSession(token: string): void {
    const session = this.sessions.get(token);
    if (!session) return;
    this.sessions.delete(token);
    const entries = this.connections.get(session.matchId);
    if (entries) {
      for (const [connectionId, connection] of entries) {
        if (connection.sessionToken !== token) continue;
        entries.delete(connectionId);
        connection.close();
      }
      if (entries.size === 0) this.connections.delete(session.matchId);
    }
    if (!this.hasAudience(session.matchId)) {
      this.snapshots.delete(session.matchId);
      this.eventBuffers.delete(session.matchId);
    }
  }

  private bufferedEvent(event: string, data: unknown): RealtimeEvent {
    this.sequence += 1n;
    return { id: this.sequence.toString(), event, data };
  }

  private directEvent(event: string, data: unknown): RealtimeEvent {
    return { id: this.sequence.toString(), event, data };
  }

  private broadcastTransient(matchId: string, event: string, data: unknown): void {
    const realtimeEvent = this.directEvent(event, data);
    for (const connection of this.connections.get(matchId)?.values() ?? []) {
      connection.send(realtimeEvent);
    }
  }

  private snapshotFingerprint(snapshot: MatchRealtimeSnapshot): string {
    return JSON.stringify(snapshot);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
