/**
 * Minimal CLI script: create a chess match on Solana devnet.
 *
 * Usage: tsx scripts/create-match-devnet.ts
 *
 * Uses NATIVE_MINT (wrapped SOL) with bet_amount = 0 (free play).
 * The match is initialized (WaitingForOpponent) but not joined.
 * Match ID, PDA addresses, and tx signatures are printed on success.
 */

import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function loadWallet(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
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

  // Unique match ID (max 32 bytes)
  const matchId = `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log("Match ID:", matchId);

  // Derive PDAs
  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), Buffer.from(matchId)],
    PROGRAM_ID
  );

  console.log("Chess Match PDA:", chessMatchPda.toBase58());
  console.log("Escrow PDA:     ", escrowPda.toBase58());

  // Player's wrapped-SOL ATA (NATIVE_MINT)
  const playerAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      NATIVE_MINT,
      wallet.publicKey
    )
  ).address;
  console.log("Player ATA:     ", playerAta.toBase58());

  // == Initialize the match ==
  console.log("\nSending initialize_match transaction...");
  const txSig = await program.methods
    .initializeMatch(
      matchId,                        // match_id_arg
      new anchor.BN(0),               // bet_amount_arg = 0 (free play)
      new anchor.BN(600),             // move_timeout_duration = 10 min
      100,                            // platform_fee_basis_points = 1%
      wallet.publicKey,               // platform_fee_wallet
      false                           // prediction_enabled
    )
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

  console.log("Initialize tx:  ", txSig);

  // == Print summary ==
  console.log("\n=== Match Created ===");
  console.log(JSON.stringify({
    matchId,
    chessMatch: chessMatchPda.toBase58(),
    escrow: escrowPda.toBase58(),
    initializeTx: txSig,
    solscanUrl: `https://solscan.io/tx/${txSig}?cluster=devnet`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
