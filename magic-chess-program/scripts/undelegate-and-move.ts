/**
 * Undelegate a match (move back to L1), make a move, then re-delegate.
 * Usage: tsx scripts/undelegate-and-move.ts <matchId> <from> <to>
 */

import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ER_ENDPOINT = "https://devnet-us.magicblock.app";
const ROUTER_ENDPOINT = "https://devnet-router.magicblock.app";

function squareToRowCol(square: string): { row: number; col: number } {
  const file = square[0].toLowerCase();
  const rank = square[1];
  return { row: parseInt(rank) - 1, col: file.charCodeAt(0) - "a".charCodeAt(0) };
}

function loadWallet(): Keypair {
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: tsx scripts/undelegate-and-move.ts <matchId> <from> <to>");
    process.exit(1);
  }

  const [matchId, fromSquare, toSquare] = args;
  const from = squareToRowCol(fromSquare);
  const to = squareToRowCol(toSquare);

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

  console.log("Match PDA:", chessMatchPda.toBase58());

  // Step 1: Undelegate
  console.log("Step 1: Undelegating...");
  try {
    const undelegateTx = await program.methods
      .undelegateMatch()
      .accountsPartial({
        payer: wallet.publicKey,
        chessMatch: chessMatchPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .rpc();
    console.log("Undelegate tx:", undelegateTx);
    // Wait for undelegation to propagate
    await new Promise(r => setTimeout(r, 5000));
  } catch (e: any) {
    console.log("Undelegate error:", e.message?.slice(0, 300));
    process.exit(1);
  }

  // Step 2: Make the move
  console.log("\nStep 2: Making move", fromSquare, "->", toSquare);
  const moveTx = await program.methods
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
  console.log("Move tx:", moveTx);

  // Step 3: Re-delegate
  console.log("\nStep 3: Re-delegating...");
  const [bufferChessMatch] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), chessMatchPda.toBuffer()],
    PROGRAM_ID
  );
  const [delegationRecordChessMatch] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), chessMatchPda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  const [delegationMetadataChessMatch] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  try {
    const redelegateTx = await program.methods
      .delegateMatch()
      .accountsStrict({
        payer: wallet.publicKey,
        player: wallet.publicKey,
        bufferChessMatch,
        delegationRecordChessMatch,
        delegationMetadataChessMatch,
        chessMatch: chessMatchPda,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Re-delegate tx:", redelegateTx);
  } catch (e: any) {
    console.log("Re-delegate error:", e.message?.slice(0, 300));
  }

  console.log("\nDone!");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
