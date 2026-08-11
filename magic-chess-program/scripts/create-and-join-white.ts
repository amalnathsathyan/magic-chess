/**
 * Create match + join as Black (player 2) WITHOUT delegation.
 * Both players on L1. White = CLI wallet. Black = Edge/Privy wallet.
 */
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function loadWallet(): Keypair {
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

async function main() {
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const matchId = `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log("Match ID:", matchId);

  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)], PROGRAM_ID
  );
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), Buffer.from(matchId)], PROGRAM_ID
  );

  const playerAta = (await getOrCreateAssociatedTokenAccount(
    connection, wallet, NATIVE_MINT, wallet.publicKey
  )).address;

  // Step 1: Initialize match
  console.log("\n--- Initialize Match ---");
  const initTx = await program.methods
    .initializeMatch(matchId, new anchor.BN(0), new anchor.BN(600), 100, wallet.publicKey, false)
    .accounts({
      chessMatch: chessMatchPda,
      playerSigner: wallet.publicKey,
      rentPayer: wallet.publicKey,
      bettingTokenMintAccount: NATIVE_MINT,
      playerTokenAccount: playerAta,
      matchEscrowTokenAccount: escrowPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("Init tx:", initTx);

  // Step 2: Join as White (player 1) - same wallet
  console.log("\n--- Join as White ---");
  const joinWhiteTx = await program.methods
    .joinMatch(new anchor.BN(0))
    .accountsPartial({
      chessMatch: chessMatchPda,
      playerTwoSigner: wallet.publicKey,
      playerTokenAccount: playerAta,
      matchEscrowTokenAccount: escrowPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("White join tx:", joinWhiteTx);

  // Step 3: Check match state
  await new Promise(r => setTimeout(r, 2000));

  console.log("\n=== Match Ready ===");
  console.log("Match ID:", matchId);
  console.log("PDA:", chessMatchPda.toBase58());
  console.log("White (CLI):", wallet.publicKey.toBase58());
  console.log("Black needs to join at: http://localhost:3000/play/" + matchId);
  console.log("Join tx:", initTx);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
