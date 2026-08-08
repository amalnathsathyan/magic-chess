"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  getApiUrl,
  type ApiMatchClock,
  type ApiRealtimeSession,
  type ApiRealtimeSnapshot,
} from "@/lib/api";

export interface MatchPresence {
  white: { online: boolean };
  black: { online: boolean };
  spectators: number;
  connections: number;
  serverTime: string;
}

type RealtimeStatus = "connecting" | "live" | "reconnecting" | "unavailable";

interface MatchNotificationEvent {
  type: string;
  [key: string]: unknown;
}

function fromBase64Bytes(bytes: Uint8Array): string {
  return window.btoa(String.fromCharCode(...bytes));
}

export function useMatchRealtime(args: {
  matchId: string;
  walletAddress?: string;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}) {
  const { matchId, walletAddress, signMessage } = args;
  const sourceRef = useRef<EventSource | null>(null);
  const clientIdRef = useRef("");
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [role, setRole] = useState<ApiRealtimeSession["role"]>("spectator");
  const [snapshot, setSnapshot] = useState<ApiRealtimeSnapshot | null>(null);
  const [clock, setClock] = useState<ApiMatchClock | null>(null);
  const [presence, setPresence] = useState<MatchPresence | null>(null);
  const [notification, setNotification] = useState<{
    sequence: number;
    data: MatchNotificationEvent;
  } | null>(null);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const openSession = useCallback(
    async (body: Parameters<typeof api.createRealtimeSession>[1]) => {
      const generation = ++requestGenerationRef.current;
      setStatus("connecting");
      let session: ApiRealtimeSession;
      try {
        session = await api.createRealtimeSession(matchId, body);
      } catch (error) {
        if (!mountedRef.current || generation !== requestGenerationRef.current) return;
        throw error;
      }
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;

      sourceRef.current?.close();
      setRole(session.role);
      setSnapshot(session.snapshot);
      const source = new EventSource(getApiUrl(session.eventUrl));
      sourceRef.current = source;

      const listen = <T,>(eventName: string, handler: (data: T) => void) => {
        source.addEventListener(eventName, (event) => {
          if (sourceRef.current !== source) return;
          try {
            handler(JSON.parse((event as MessageEvent<string>).data) as T);
          } catch {
            // Ignore a malformed event and let polling remain the recovery path.
          }
        });
      };

      listen<{ role: ApiRealtimeSession["role"] }>("session.ready", (data) => {
        setRole(data.role);
        setStatus("live");
      });
      listen<MatchPresence>("presence.sync", setPresence);
      listen<ApiMatchClock>("clock.tick", setClock);
      listen<ApiRealtimeSnapshot & { clock?: ApiMatchClock }>(
        "match.snapshot",
        (data) => {
          setSnapshot(data);
          if (data.clock) setClock(data.clock);
          setRefreshSequence((value) => value + 1);
        }
      );
      listen<MatchNotificationEvent>("match.notification", (data) => {
        setNotification((current) => ({
          sequence: (current?.sequence ?? 0) + 1,
          data,
        }));
        setRefreshSequence((value) => value + 1);
      });
      listen<{ reason: string }>("resync.required", () => {
        setRefreshSequence((value) => value + 1);
      });

      source.onerror = () => {
        if (sourceRef.current === source) setStatus("reconnecting");
      };
    },
    [matchId]
  );

  useEffect(() => {
    mountedRef.current = true;
    let retryTimer: number | undefined;
    if (!clientIdRef.current) {
      clientIdRef.current = window.crypto.randomUUID();
    }
    const connect = () => {
      void openSession({ clientId: clientIdRef.current }).catch(() => {
        if (!mountedRef.current) return;
        setStatus("unavailable");
        retryTimer = window.setTimeout(connect, 5_000);
      });
    };
    connect();
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      if (retryTimer) window.clearTimeout(retryTimer);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [openSession]);

  const verifyPlayerPresence = useCallback(async () => {
    if (!walletAddress || !signMessage) {
      throw new Error("Connect a player wallet before verifying presence.");
    }
    setVerifying(true);
    try {
      const challenge = await api.getRealtimeChallenge(matchId, walletAddress);
      const signature = await signMessage(new TextEncoder().encode(challenge.message));
      await openSession({
        clientId: clientIdRef.current,
        wallet: walletAddress,
        issuedAt: challenge.issuedAt,
        signature: fromBase64Bytes(signature),
      });
    } finally {
      setVerifying(false);
    }
  }, [matchId, openSession, signMessage, walletAddress]);

  return {
    status,
    role,
    snapshot,
    clock,
    presence,
    notification,
    refreshSequence,
    verifying,
    verifyPlayerPresence,
  };
}
