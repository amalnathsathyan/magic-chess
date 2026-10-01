"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BN } from "@anchor-lang/core";
import { SessionTokenManager } from "@magicblock-labs/gum-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import type { MagicChessSession } from "@magic-chess/sdk";
import type { SponsorAwareProvider } from "@/components/shared/SolanaProgramProvider";

const SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);
// Keep below the backend's one-hour cap to tolerate client/server clock skew.
const SESSION_DURATION_SECONDS = 55 * 60;
const SESSION_TOP_UP_LAMPORTS = 2_000_000;

type SessionState = "idle" | "authorizing" | "ready" | "error";

interface MagicSessionContextValue {
  session: MagicChessSession | null;
  status: SessionState;
  error: string | null;
  /**
   * Create (or reuse) the temporary signer. With a delegated `matchId`, also
   * register it on that match's rollup state via `set_session_key`, so moves
   * authorize without needing the SessionTokenV2 to be visible on the ER.
   */
  ensureSession: (matchId?: string) => Promise<MagicChessSession>;
  /** Forget a match registration (e.g. after an authorization failure). */
  forgetMatch: (matchId: string) => void;
  /** Whether the signer is registered on this match. */
  isRegistered: (matchId: string) => boolean;
  clearSession: () => void;
}

const MagicSessionContext = createContext<MagicSessionContextValue | null>(null);

export function MagicSessionProvider({ children }: { children: ReactNode }) {
  const client = useMagicChessClient();
  const [session, setSession] = useState<MagicChessSession | null>(null);
  const [status, setStatus] = useState<SessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Promise<MagicChessSession> | null>(null);
  const registeredRef = useRef<Map<string, number>>(new Map());
  const [, setRegistrationVersion] = useState(0);
  const walletAddress = client.wallet?.publicKey.toBase58() ?? null;

  const clearSession = useCallback(() => {
    // The secret key is intentionally memory-only: never localStorage, logs,
    // API payloads, or committed configuration.
    pendingRef.current = null;
    registeredRef.current = new Map();
    setSession(null);
    setStatus("idle");
    setError(null);
  }, []);

  const forgetMatch = useCallback((matchId: string) => {
    registeredRef.current.delete(matchId);
    setRegistrationVersion((value) => value + 1);
  }, []);

  const isRegistered = useCallback(
    (matchId: string) =>
      Boolean(session) && registeredRef.current.get(matchId) === session?.expiresAt,
    [session]
  );

  /** One wallet signature on the ER; no SOL needed there. */
  const registerOnMatch = useCallback(
    async (matchId: string, active: MagicChessSession) => {
      if (registeredRef.current.get(matchId) === active.expiresAt) return true;
      try {
        await client.setSessionKey(matchId, active.signer.publicKey, active.expiresAt);
        registeredRef.current.set(matchId, active.expiresAt);
        setRegistrationVersion((value) => value + 1);
        return true;
      } catch (cause) {
        console.warn("Could not register the fast-play key on the match", cause);
        return false;
      }
    },
    [client]
  );

  useEffect(() => clearSession(), [clearSession, walletAddress]);

  const withMatch = useCallback(
    async (active: MagicChessSession, matchId?: string): Promise<MagicChessSession> => {
      if (!matchId) return active;
      // Registered on the match: authorize via the match account, not the
      // base-layer token (which the ER may not have cloned).
      return (await registerOnMatch(matchId, active))
        ? { signer: active.signer, expiresAt: active.expiresAt }
        : active;
    },
    [registerOnMatch]
  );

  const ensureSession = useCallback(async (matchId?: string): Promise<MagicChessSession> => {
    const now = Math.floor(Date.now() / 1000);
    if (session && session.expiresAt > now + 60) {
      return withMatch(session, matchId);
    }
    if (pendingRef.current) return withMatch(await pendingRef.current, matchId);
    if (!client.wallet) throw new Error("Connect a wallet before enabling fast play.");

    const promise = (async () => {
      setStatus("authorizing");
      setError(null);
      const provider = client.program.provider as SponsorAwareProvider;
      const authority = client.wallet!.publicKey;
      // Embedded wallets are sponsored; external wallets pay the tiny
      // session top-up themselves.
      const sessionFeePayer = provider.sponsorPayer ?? authority;
      const signer = Keypair.generate();
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
      const [token] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("session_token_v2"),
          client.programId.toBuffer(),
          signer.publicKey.toBuffer(),
          authority.toBuffer(),
        ],
        SESSION_PROGRAM_ID
      );

      const manager = new SessionTokenManager(
        provider.wallet as never,
        provider.connection as never
      );
      const methods = manager.program.methods as unknown as {
        createSessionV2(
          topUp: boolean,
          validUntil: BN,
          lamports: BN
        ): {
          accounts(accounts: Record<string, PublicKey>): {
            transaction(): Promise<import("@solana/web3.js").Transaction>;
          };
        };
      };
      const transaction = await methods
        .createSessionV2(
          true,
          new BN(expiresAt),
          new BN(SESSION_TOP_UP_LAMPORTS)
        )
        .accounts({
          sessionToken: token,
          sessionSigner: signer.publicKey,
          feePayer: sessionFeePayer,
          authority,
          targetProgram: client.programId,
          systemProgram: PublicKey.default,
        })
        .transaction();

      await provider.sendAndConfirm(transaction, [signer], {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });
      const account = await provider.connection.getAccountInfo(token, "confirmed");
      if (!account?.owner.equals(SESSION_PROGRAM_ID)) {
        throw new Error("The fast-play session was not created on Solana devnet.");
      }

      const created: MagicChessSession = { signer, token, expiresAt };
      setSession(created);
      setStatus("ready");
      return created;
    })()
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setStatus("error");
        setError(message);
        throw cause;
      })
      .finally(() => {
        pendingRef.current = null;
      });

    pendingRef.current = promise;
    return withMatch(await promise, matchId);
  }, [client, session, withMatch]);

  const value = useMemo(
    () => ({ session, status, error, ensureSession, forgetMatch, isRegistered, clearSession }),
    [clearSession, ensureSession, error, forgetMatch, isRegistered, session, status]
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
