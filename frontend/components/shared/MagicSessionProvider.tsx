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
import { BN } from "@anchor-lang/core";
import { SessionTokenManager } from "@magicblock-labs/gum-sdk";
import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import type { MagicChessClient, MagicChessSession } from "@magic-chess/sdk";
import type { SponsorAwareProvider } from "@/components/shared/SolanaProgramProvider";

/**
 * Lifetime of a per-match fast-play key. The program caps it at 7 days; one
 * day covers any realistic game, and an expired key just falls back to the
 * wallet until it is re-enabled.
 */
const SESSION_DURATION_SECONDS = 24 * 60 * 60;
/** Exactly what the sponsor policy allows; keeps the signer account alive. */
const SESSION_TOP_UP_LAMPORTS = 2_000_000;
const STORAGE_PREFIX = "magic-chess:fast-play";
const SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

type SessionState = "idle" | "authorizing" | "ready" | "error";

/** A key generated for a match, not yet confirmed on-chain. */
export interface PreparedMatchSession {
  session: MagicChessSession;
  /**
   * `set_session_key` plus MagicBlock's `create_session_v2`, for the same
   * transaction as create/join.
   */
  instructions: TransactionInstruction[];
  /** Must co-sign that transaction (the session signer). */
  signers: Keypair[];
  /** Call once the transaction carrying `instructions` has confirmed. */
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
  /** Authorize a new key for a match that is already running (one approval). */
  enableForMatch: (matchId: string) => Promise<MagicChessSession>;
  /** Drop a key the match no longer accepts. */
  forgetMatch: (matchId: string) => void;
}

const MagicSessionContext = createContext<MagicSessionContextValue | null>(null);

interface StoredSession {
  secretKey: string;
  expiresAt: number;
  token?: string;
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
      token: stored.token ? new PublicKey(stored.token) : undefined,
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
      token: session.token?.toBase58(),
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

/**
 * MagicBlock's standard session authorization: a SessionTokenV2 on the base
 * layer binding the temporary signer to this wallet and program. `make_move`
 * accepts it through `session_auth_or` on every deployed program version,
 * unlike the match-registered signer, which needs the current program.
 */
export async function buildSessionTokenInstruction(
  client: MagicChessClient,
  signer: PublicKey,
  expiresAt: number,
  feePayer: PublicKey
): Promise<{ token: PublicKey; instruction: TransactionInstruction }> {
  const provider = client.program.provider as SponsorAwareProvider;
  const authority = client.wallet!.publicKey;
  const [token] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      client.programId.toBuffer(),
      signer.toBuffer(),
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
        instruction(): Promise<TransactionInstruction>;
      };
    };
  };
  const instruction = await methods
    .createSessionV2(true, new BN(expiresAt), new BN(SESSION_TOP_UP_LAMPORTS))
    .accounts({
      sessionToken: token,
      sessionSigner: signer,
      feePayer,
      authority,
      targetProgram: client.programId,
      systemProgram: PublicKey.default,
    })
    .instruction();
  return { token, instruction };
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
      const signer = Keypair.generate();
      const session: MagicChessSession = {
        signer,
        expiresAt: nowSeconds() + SESSION_DURATION_SECONDS,
      };
      const instructions = [
        await client.buildSetSessionKeyInstruction(
          matchId,
          signer.publicKey,
          session.expiresAt
        ),
      ];
      // The token's rent and signer top-up come from the gas sponsor when
      // there is one, so players never pay for instant moves.
      const provider = client.program.provider as SponsorAwareProvider;
      const { token, instruction } = await buildSessionTokenInstruction(
        client,
        signer.publicKey,
        session.expiresAt,
        provider.sponsorPayer ?? client.wallet.publicKey
      );
      session.token = token;
      instructions.push(instruction);
      const signers = [signer];
      return {
        session,
        instructions,
        signers,
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
        const provider = client.program.provider as SponsorAwareProvider;
        const signer = Keypair.generate();
        const expiresAt = nowSeconds() + SESSION_DURATION_SECONDS;
        // One base-layer approval. The match may already be on the rollup,
        // so the token (not set_session_key) is what authorizes the key.
        const { token, instruction } = await buildSessionTokenInstruction(
          client,
          signer.publicKey,
          expiresAt,
          provider.sponsorPayer ?? client.wallet.publicKey
        );
        await provider.sendAndConfirm(new Transaction().add(instruction), [signer], {
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        });
        const session: MagicChessSession = { signer, token, expiresAt };
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
