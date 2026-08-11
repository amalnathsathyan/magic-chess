/**
 * Make a move as a player on devnet.
 * Usage: tsx scripts/make-move-devnet.ts <matchId> <from> <to>
 * Example: tsx scripts/make-move-devnet.ts match-abc123 e2 e4
 */

import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function squareToRowCol(square: string): { row: number; col: number } {
  const file = square[0].toLowerCase();
  const rank = square[1];
  const col = file.charCodeAt(0) - "a".charCodeAt(0);
  const row = parseInt(rank) - 1;
  return { row, col };
}

function loadWallet(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: tsx scripts/make-move-devnet.ts <matchId> <from> <to>");
    process.exit(1);
  }

  const [matchId, fromSquare, toSquare] = args;
  const from = squareToRowCol(fromSquare);
  const to = squareToRowCol(toSquare);

  console.log(`Making move: ${fromSquare} -> ${toSquare}`);
  console.log(`  from: row=${from.row}, col=${from.col}`);
  console.log(`  to:   row=${to.row}, col=${to.col}`);

  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)],
    PROGRAM_ID
  );

  console.log("Chess Match PDA:", chessMatchPda.toBase58());

  const txSig = await program.methods
    .makeMove({
      fromRow: from.row,
      fromCol: from.col,
      toRow: to.row,
      toCol: to.col,
      promotion: null,
    } as any)
    .accounts({
      chessMatch: chessMatchPda,
      player: wallet.publicKey,
      sessionToken: null,
    })
    .rpc();

  console.log("Move tx:", txSig);
  console.log(`Solscan: https://solscan.io/tx/${txSig}?cluster=devnet`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
