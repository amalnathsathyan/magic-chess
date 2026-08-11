/**
 * Quick match: create match (White = CLI), delegate to ER, make White's opening move.
 * Black joins from Edge. Tight timing to avoid timeout.
 */
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const RPC_URL = "https://api.devnet.solana.com";
const ROUTER = "https://devnet-router.magicblock.app";

function loadWallet(): Keypair {
  const p = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
}

async function main() {
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const wallet = loadWallet();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed", preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const matchId = `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log("Match ID:", matchId);

  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)], PROGRAM_ID);
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), Buffer.from(matchId)], PROGRAM_ID);

  const playerAta = (await getOrCreateAssociatedTokenAccount(
    connection, wallet, NATIVE_MINT, wallet.publicKey)).address;

  // Step 1: Initialize match (White = creator wallet)
  console.log("1. Initializing match (White =", wallet.publicKey.toBase58().slice(0,6) + "...)...");
  const initTx = await program.methods
    .initializeMatch(matchId, new anchor.BN(0), new anchor.BN(600), 100, wallet.publicKey, false)
    .accounts({
      chessMatch: chessMatchPda, playerSigner: wallet.publicKey, rentPayer: wallet.publicKey,
      bettingTokenMintAccount: NATIVE_MINT, playerTokenAccount: playerAta,
      matchEscrowTokenAccount: escrowPda, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).rpc();
  console.log("   Init tx:", initTx);

  // Step 2: Delegate to ER (must do before moves)
  await new Promise(r => setTimeout(r, 3000));
  console.log("2. Delegating to ER...");
  const [bufferChessMatch] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), chessMatchPda.toBuffer()], PROGRAM_ID);
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), chessMatchPda.toBuffer()], DELEGATION_PROGRAM_ID);
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()], DELEGATION_PROGRAM_ID);
  const delTx = await program.methods
    .delegateMatch()
    .accountsStrict({
      payer: wallet.publicKey, player: wallet.publicKey,
      bufferChessMatch, delegationRecordChessMatch: delegationRecord,
      delegationMetadataChessMatch: delegationMetadata, chessMatch: chessMatchPda,
      ownerProgram: PROGRAM_ID, delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();
  console.log("   Delegate tx:", delTx);

  // Step 3: Wait for delegation
  await new Promise(r => setTimeout(r, 5000));
  console.log("3. Checking delegation...");
  const routerRes = await fetch(ROUTER, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getDelegationStatus", params: [chessMatchPda.toBase58()] }),
  });
  const routerData = await routerRes.json() as any;
  const fqdn = routerData?.result?.fqdn;
  console.log("   ER FQDN:", fqdn || "NOT YET DELEGATED");

  // Step 4: Make White's opening move on ER
  if (fqdn) {
    const erUrl = fqdn.startsWith("http") ? fqdn : `https://${fqdn}`;
    console.log("4. Making White's move e2->e4 on ER (" + erUrl + ")...");
    const ix = await program.methods
      .makeMove({ fromRow: 1, fromCol: 4, toRow: 3, toCol: 4, promotion: null } as any)
      .accounts({ chessMatch: chessMatchPda, player: wallet.publicKey, sessionToken: null })
      .instruction();

    const erConn = new anchor.web3.Connection(erUrl, "confirmed");
    const erLatest = await erConn.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.add(ix);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = erLatest.blockhash;
    tx.lastValidBlockHeight = erLatest.lastValidBlockHeight;
    tx.partialSign(wallet);

    const sig = await erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
    console.log("   Move tx:", sig);
    console.log("\n=== READY ===");
    console.log("Match ID:", matchId);
    console.log("URL: http://localhost:3000/play/" + matchId);
    console.log("White played e2-e4. Black to move — join from Edge!");
  } else {
    console.log("\n=== Delegation failed, match on L1 ===");
    console.log("Match ID:", matchId);
    console.log("URL: http://localhost:3000/play/" + matchId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
