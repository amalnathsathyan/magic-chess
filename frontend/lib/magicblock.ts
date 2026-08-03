/**
 * MagicBlock integration helpers.
 *
 * These functions wrap the @magic-chess/sdk for common operations:
 * session creation, move submission, and account watching.
 *
 * TODO: Replace placeholder implementations with actual SDK calls
 * once the MagicChess SDK exposes the ER client.
 */

const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? "";

export interface MagicBlockConfig {
  rpcEndpoint: string;
  programId: string;
}

export function getDefaultConfig(): MagicBlockConfig {
  return {
    rpcEndpoint: RPC_ENDPOINT,
    programId: PROGRAM_ID,
  };
}

/**
 * Create an ephemeral rollup session for gasless transactions.
 */
export async function createSession(
  _config: MagicBlockConfig
): Promise<string> {
  // TODO: import { createEphemeralSession } from "@magic-chess/sdk";
  // return createEphemeralSession(config);
  console.warn("MagicBlock session creation not yet implemented");
  return `session_placeholder_${Date.now()}`;
}

/**
 * Submit a chess move as an ephemeral transaction.
 */
export async function submitMoveTx(
  _sessionId: string,
  _matchPda: string,
  _from: string,
  _to: string,
  _promotion?: string
): Promise<string> {
  // TODO: import { submitMove } from "@magic-chess/sdk";
  // return submitMove(sessionId, matchPda, from, to, promotion);
  console.warn("Move submission not yet implemented");
  return `tx_placeholder_${Date.now()}`;
}

/**
 * Claim winnings after a completed match.
 */
export async function claimWinnings(
  _matchPda: string
): Promise<string> {
  // TODO: import { claimWager } from "@magic-chess/sdk";
  // return claimWager(matchPda);
  console.warn("Claim winnings not yet implemented");
  return `tx_placeholder_${Date.now()}`;
}
