"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Keypair, type TransactionInstruction } from "@solana/web3.js";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import type { MagicChessSession } from "@magic-chess/sdk";

/**
 * Lifetime of a per-match fast-play key. The program caps it at 7 days; one
 * day covers any realistic game, and an expired key just falls back to the
 * wallet until it is re-enabled.
 */
const SESSION_DURATION_SECONDS = 24 * 60 * 60;
const STORAGE_PREFIX = "magic-chess:fast-play";

type SessionState = "idle" | "authorizing" | "ready" | "error";

/** A key generated for a match, not yet confirmed on-chain. */
export interface PreparedMatchSession {
  session: MagicChessSession;
  /** `set_session_key` for the same transaction as create/join. */
  instruction: TransactionInstruction;
  /** Call once the transaction carrying `instruction` has confirmed. */
  save: () => void;
}

interface MagicSessionContextValue {
  status: SessionState;
  error: string | null;
  /** The saved, unexpired fast-play key for this match, if any. */
  getSession: (matchId: string) => MagicChessSession | null;
  /**
   * Generate a key and the `set_session_key` instruction to bundle into the
   * create or join transaction, so instant moves cost no extra approval.
   */
  prepareMatchSession: (matchId: string) => Promise<PreparedMatchSession>;
  /** Register a new key on a match that is already running (one approval). */
  enableForMatch: (matchId: string) => Promise<MagicChessSession>;
  /** Drop a key the match no longer accepts. */
  forgetMatch: (matchId: string) => void;
}

const MagicSessionContext = createContext<MagicSessionContextValue | null>(null);

interface StoredSession {
  secretKey: string;
  expiresAt: number;
}

function storageKey(wallet: string, matchId: string): string {
  return `${STORAGE_PREFIX}:${wallet}:${matchId}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * The key lives in localStorage so a refresh doesn't bring wallet popups
 * back. It can only sign `make_move` for this wallet's side of one match, and
 * expires on-chain, so it is never a general-purpose wallet key.
 */
function readStored(wallet: string, matchId: string): MagicChessSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey(wallet, matchId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    if (stored.expiresAt <= nowSeconds() + 30) {
      window.localStorage.removeItem(storageKey(wallet, matchId));
      return null;
    }
    return {
      signer: Keypair.fromSecretKey(fromBase64(stored.secretKey)),
      expiresAt: stored.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeStored(wallet: string, matchId: string, session: MagicChessSession) {
  try {
    const signer = session.signer as Keypair;
    const stored: StoredSession = {
      secretKey: toBase64(signer.secretKey),
      expiresAt: session.expiresAt,
    };
    window.localStorage.setItem(storageKey(wallet, matchId), JSON.stringify(stored));
  } catch {
    // Storage blocked: the key still works until the page reloads.
  }
}

function removeStored(wallet: string, matchId: string) {
  try {
    window.localStorage.removeItem(storageKey(wallet, matchId));
  } catch {
    // Nothing to clean up.
  }
}

export function MagicSessionProvider({ children }: { children: ReactNode }) {
  const client = useMagicChessClient();
  const [status, setStatus] = useState<SessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  // In-memory copy so sessions survive blocked storage; keyed by wallet+match.
  const [sessions, setSessions] = useState<Map<string, MagicChessSession>>(
    () => new Map()
  );
  const walletAddress = client.wallet?.publicKey.toBase58() ?? null;

  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [walletAddress]);

  const remember = useCallback(
    (matchId: string, session: MagicChessSession) => {
      if (!walletAddress) return;
      writeStored(walletAddress, matchId, session);
      setSessions((current) =>
        new Map(current).set(storageKey(walletAddress, matchId), session)
      );
    },
    [walletAddress]
  );

  const getSession = useCallback(
    (matchId: string): MagicChessSession | null => {
      if (!walletAddress || !matchId) return null;
      const cached = sessions.get(storageKey(walletAddress, matchId));
      if (cached && cached.expiresAt > nowSeconds() + 30) return cached;
      if (typeof window === "undefined") return null;
      return readStored(walletAddress, matchId);
    },
    [sessions, walletAddress]
  );

  const forgetMatch = useCallback(
    (matchId: string) => {
      if (!walletAddress) return;
      removeStored(walletAddress, matchId);
      setSessions((current) => {
        const next = new Map(current);
        next.delete(storageKey(walletAddress, matchId));
        return next;
      });
    },
    [walletAddress]
  );

  const prepareMatchSession = useCallback(
    async (matchId: string): Promise<PreparedMatchSession> => {
      if (!client.wallet) throw new Error("Connect a wallet before creating a match.");
      const session: MagicChessSession = {
        signer: Keypair.generate(),
        expiresAt: nowSeconds() + SESSION_DURATION_SECONDS,
      };
      const instruction = await client.buildSetSessionKeyInstruction(
        matchId,
        session.signer.publicKey,
        session.expiresAt
      );
      return {
        session,
        instruction,
        save: () => {
          remember(matchId, session);
          setStatus("ready");
          setError(null);
        },
      };
    },
    [client, remember]
  );

  const enableForMatch = useCallback(
    async (matchId: string): Promise<MagicChessSession> => {
      if (!client.wallet) throw new Error("Connect a wallet before enabling instant moves.");
      setStatus("authorizing");
      setError(null);
      try {
        const session: MagicChessSession = {
          signer: Keypair.generate(),
          expiresAt: nowSeconds() + SESSION_DURATION_SECONDS,
        };
        // Sent to whichever runtime holds the match (the ER mid-game).
        await client.setSessionKey(matchId, session.signer.publicKey, session.expiresAt);
        remember(matchId, session);
        setStatus("ready");
        return session;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setStatus("error");
        setError(message);
        throw cause;
      }
    },
    [client, remember]
  );

  const value = useMemo(
    () => ({ status, error, getSession, prepareMatchSession, enableForMatch, forgetMatch }),
    [enableForMatch, error, forgetMatch, getSession, prepareMatchSession, status]
  );

  return (
    <MagicSessionContext.Provider value={value}>
      {children}
    </MagicSessionContext.Provider>
  );
}

export function useMagicSession(): MagicSessionContextValue {
  const value = useContext(MagicSessionContext);
  if (!value) throw new Error("useMagicSession must be used inside MagicSessionProvider");
  return value;
}
