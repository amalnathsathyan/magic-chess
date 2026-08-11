/**
 * Make a chess move through MagicBlock Ephemeral Rollups.
 * Queries the router for ER FQDN, then sends transaction to ER.
 */
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const RPC_URL = "https://api.devnet.solana.com";
const ROUTER = "https://devnet-router.magicblock.app";

function squareToRowCol(s: string) {
  return { row: parseInt(s[1]) - 1, col: s.charCodeAt(0) - 97 };
}

function loadWallet(): Keypair {
  const p = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
}

async function main() {
  const [matchId, fromSq, toSq] = process.argv.slice(2);
  if (!matchId || !fromSq || !toSq) {
    console.error("Usage: tsx scripts/make-move-er.ts <matchId> <from> <to>");
    process.exit(1);
  }

  const from = squareToRowCol(fromSq);
  const to = squareToRowCol(toSq);
  const wallet = loadWallet();

  const [chessMatchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)], PROGRAM_ID
  );

  // 1. Query router for ER FQDN
  const baseConn = new anchor.web3.Connection(RPC_URL, "confirmed");
  const routerRes = await fetch(ROUTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getDelegationStatus",
      params: [chessMatchPda.toBase58()]
    }),
  });
  const routerData = await routerRes.json() as any;
  console.log("Router response:", JSON.stringify(routerData).slice(0, 300));
  const matchDeleg = routerData?.result;

  if (!matchDeleg?.fqdn && !matchDeleg?.isDelegated) {
    console.log("Not delegated or router error. Trying base RPC...");
    // Fall back to base RPC (for non-delegated matches)
    const provider = new anchor.AnchorProvider(baseConn, new anchor.Wallet(wallet), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    const program = new anchor.Program(idl as never, provider);

    const txSig = await program.methods
      .makeMove({ fromRow: from.row, fromCol: from.col, toRow: to.row, toCol: to.col, promotion: null } as any)
      .accounts({ chessMatch: chessMatchPda, player: wallet.publicKey, sessionToken: null })
      .rpc();
    console.log("Move tx (base):", txSig);
    return;
  }

  console.log("ER FQDN:", matchDeleg.fqdn);
  const erUrl = /^https?:\/\//.test(matchDeleg.fqdn) ? matchDeleg.fqdn : `https://${matchDeleg.fqdn}`;
  console.log("ER URL:", erUrl);

  // 2. Build the move instruction
  const provider = new anchor.AnchorProvider(baseConn, new anchor.Wallet(wallet), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const ix = await program.methods
    .makeMove({ fromRow: from.row, fromCol: from.col, toRow: to.row, toCol: to.col, promotion: null } as any)
    .accounts({ chessMatch: chessMatchPda, player: wallet.publicKey, sessionToken: null })
    .instruction();

  // 3. Build and sign transaction
  const tx = new Transaction();
  tx.add(ix);
  const latest = await baseConn.getLatestBlockhash("confirmed");
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.lastValidBlockHeight = latest.lastValidBlockHeight;
  tx.partialSign(wallet);

  // 4. Rebuild tx with ER blockhash and send to ER
  const erConn = new anchor.web3.Connection(erUrl, "confirmed");
  const erLatest = await erConn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = erLatest.blockhash;
  tx.lastValidBlockHeight = erLatest.lastValidBlockHeight;
  // Re-sign after changing blockhash
  tx.signatures = [];
  tx.partialSign(wallet);

  const sig = await erConn.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 5,
  });
  console.log("Move tx (ER):", sig);
  console.log(`Solscan: https://solscan.io/tx/${sig}?cluster=devnet`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
