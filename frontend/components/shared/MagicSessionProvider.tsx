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
  ensureSession: () => Promise<MagicChessSession>;
  clearSession: () => void;
}

const MagicSessionContext = createContext<MagicSessionContextValue | null>(null);

export function MagicSessionProvider({ children }: { children: ReactNode }) {
  const client = useMagicChessClient();
  const [session, setSession] = useState<MagicChessSession | null>(null);
  const [status, setStatus] = useState<SessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Promise<MagicChessSession> | null>(null);
  const walletAddress = client.wallet?.publicKey.toBase58() ?? null;

  const clearSession = useCallback(() => {
    // The secret key is intentionally memory-only: never localStorage, logs,
    // API payloads, or committed configuration.
    pendingRef.current = null;
    setSession(null);
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => clearSession(), [clearSession, walletAddress]);

  const ensureSession = useCallback(async (): Promise<MagicChessSession> => {
    const now = Math.floor(Date.now() / 1000);
    if (session && session.expiresAt > now + 30) {
      const account = await client.program.provider.connection.getAccountInfo(
        session.token,
        "confirmed"
      );
      if (account?.owner.equals(SESSION_PROGRAM_ID)) return session;
    }
    if (pendingRef.current) return pendingRef.current;
    if (!client.wallet) throw new Error("Connect a wallet before enabling fast play.");

    const promise = (async () => {
      setStatus("authorizing");
      setError(null);
      const provider = client.program.provider as SponsorAwareProvider;
      const sponsorPayer = provider.sponsorPayer;
      if (!sponsorPayer) {
        throw new Error(
          "Fast-play session sponsorship is only available for the embedded Privy wallet."
        );
      }

      const authority = client.wallet!.publicKey;
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
          feePayer: sponsorPayer,
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
    return promise;
  }, [client, session]);

  const value = useMemo(
    () => ({ session, status, error, ensureSession, clearSession }),
    [clearSession, ensureSession, error, session, status]
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
