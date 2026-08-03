/**
 * MagicBlock integration helpers.
 *
 * These functions wrap the @magic-chess/sdk for common operations:
 * session creation, move submission, and account watching.
 */

import {
  MagicChessClient,
  findChessMatchPda,
  getDelegationStatus,
  getERConnection,
  MAGICBLOCK_DEVNET_ROUTER,
} from "@magic-chess/sdk";
import { Transaction } from "@solana/web3.js";

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
  console.warn("MagicBlock session creation not yet implemented");
  return `session_placeholder_${Date.now()}`;
}

/**
 * Submit a chess move. Sends to Ephemeral Rollup if delegated,
 * otherwise uses the base layer via client.makeMove.
 */
export async function submitMoveTx(
  client: MagicChessClient,
  matchId: string,
  from: string,
  to: string,
  promotion?: string
): Promise<string> {
  const fromCol = from.charCodeAt(0) - 97;
  const fromRow = parseInt(from[1]) - 1;
  const toCol = to.charCodeAt(0) - 97;
  const toRow = parseInt(to[1]) - 1;

  const move = {
    fromRow,
    fromCol,
    toRow,
    toCol,
    promotion: promotion ? (promotion as any) : undefined,
  };

  const [chessMatchPda] = findChessMatchPda(matchId, client.programId);
  
  let isDelegated = false;
  let erFqdn = "";
  try {
    const status = await getDelegationStatus(chessMatchPda);
    if (status.isDelegated) {
      isDelegated = true;
      erFqdn = status.fqdn || "";
    }
  } catch (err) {
    console.warn("Failed to check delegation status, falling back to base RPC", err);
  }

  if (isDelegated && erFqdn) {
    const erConnection = getERConnection(erFqdn);
    if (!client.wallet) throw new Error("Wallet not connected");

    const ix = await client.program.methods
      .makeMove({
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotion: move.promotion ?? null,
      } as any)
      .accounts({
        chessMatch: chessMatchPda,
        player: client.wallet.publicKey,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = client.wallet.publicKey;

    const { blockhash } = await erConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signedTx = await client.wallet.signTransaction(tx);
    const signature = await erConnection.sendRawTransaction(signedTx.serialize());
    
    return signature;
  } else {
    const { signature } = await client.makeMove(matchId, move);
    return signature;
  }
}

/**
 * Claim winnings after a completed match.
 */
export async function claimWinnings(
  _matchPda: string
): Promise<string> {
  console.warn("Claim winnings not yet implemented");
  return `tx_placeholder_${Date.now()}`;
}
