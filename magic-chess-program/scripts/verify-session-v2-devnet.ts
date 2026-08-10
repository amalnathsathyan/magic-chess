/** Live devnet smoke test for popup-free MagicBlock SessionTokenV2 moves. */
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import idl from "../target/idl/magic_chess.json" with { type: "json" };

const BASE_RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ROUTER_RPC = "https://devnet-router.magicblock.app/";
const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const CREATE_SESSION_V2 = Buffer.from([223, 233, 108, 7, 65, 194, 235, 38]);

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function loadWallet(): Keypair {
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[])
  );
}

function createSessionInstruction(input: {
  authority: PublicKey;
  sessionSigner: PublicKey;
  sessionToken: PublicKey;
}): TransactionInstruction {
  const data = Buffer.alloc(28);
  CREATE_SESSION_V2.copy(data);
  data[8] = 1;
  data[9] = 1;
  data[10] = 1;
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 3_300), 11);
  data[19] = 1;
  data.writeBigUInt64LE(2_000_000n, 20);
  return new TransactionInstruction({
    programId: SESSION_PROGRAM_ID,
    keys: [
      { pubkey: input.sessionToken, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function resolveEr(match: PublicKey): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(ROUTER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [match.toBase58()],
      }),
    });
    const body = (await response.json()) as {
      result?: { isDelegated?: boolean; fqdn?: string };
    };
    if (body.result?.isDelegated && body.result.fqdn) {
      return body.result.fqdn.startsWith("http")
        ? body.result.fqdn
        : `https://${body.result.fqdn}`;
    }
    await delay(1_000);
  }
  throw new Error("Router did not expose the delegated match");
}

async function main() {
  const connection = new anchor.web3.Connection(BASE_RPC, "confirmed");
  const white = loadWallet();
  const black = Keypair.generate();
  const session = Keypair.generate();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(white),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  const program = new anchor.Program(idl as never, provider);
  const matchId = `mc-${Date.now().toString(16).padStart(12, "0")}${session.publicKey
    .toBuffer()
    .subarray(0, 4)
    .toString("hex")}`.slice(0, 23);
  const [match] = PublicKey.findProgramAddressSync(
    [Buffer.from("chess_match"), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_escrow"), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const [sessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      PROGRAM_ID.toBuffer(),
      session.publicKey.toBuffer(),
      white.publicKey.toBuffer(),
    ],
    SESSION_PROGRAM_ID
  );

  const fundBlack = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: white.publicKey,
      toPubkey: black.publicKey,
      lamports: 4_000_000,
    })
  );
  await sendAndConfirmTransaction(connection, fundBlack, [white]);
  const whiteAta = (
    await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, white.publicKey)
  ).address;
  const blackAta = (
    await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, black.publicKey)
  ).address;

  const createSignature = await program.methods
    .initializeMatch(matchId, new anchor.BN(0), new anchor.BN(600), 100, white.publicKey, false)
    .accounts({
      chessMatch: match,
      playerSigner: white.publicKey,
      rentPayer: white.publicKey,
      bettingTokenMintAccount: NATIVE_MINT,
      playerTokenAccount: whiteAta,
      matchEscrowTokenAccount: escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const blackProvider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(black),
    provider.opts
  );
  const blackProgram = new anchor.Program(idl as never, blackProvider);
  const joinSignature = await blackProgram.methods
    .joinMatch(new anchor.BN(0))
    .accounts({
      chessMatch: match,
      playerTwoSigner: black.publicKey,
      playerTokenAccount: blackAta,
      matchEscrowTokenAccount: escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const sessionSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createSessionInstruction({
        authority: white.publicKey,
        sessionSigner: session.publicKey,
        sessionToken,
      })
    ),
    [white, session],
    { commitment: "confirmed" }
  );

  const [buffer] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), match.toBuffer()],
    PROGRAM_ID
  );
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), match.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), match.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  const delegateSignature = await program.methods
    .delegateMatch()
    .accountsStrict({
      payer: white.publicKey,
      player: white.publicKey,
      bufferChessMatch: buffer,
      delegationRecordChessMatch: delegationRecord,
      delegationMetadataChessMatch: delegationMetadata,
      chessMatch: match,
      ownerProgram: PROGRAM_ID,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const erEndpoint = await resolveEr(match);
  const erConnection = new anchor.web3.Connection(erEndpoint, "confirmed");
  const erProvider = new anchor.AnchorProvider(
    erConnection,
    new anchor.Wallet(session),
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  const erProgram = new anchor.Program(idl as never, erProvider);
  const moveSignature = await erProgram.methods
    .makeMove({ fromRow: 1, fromCol: 4, toRow: 3, toCol: 4, promotion: null })
    .accounts({ chessMatch: match, player: session.publicKey, sessionToken })
    .signers([session])
    .rpc();

  console.log(
    JSON.stringify(
      {
        matchId,
        match: match.toBase58(),
        createSignature,
        joinSignature,
        sessionSignature,
        delegateSignature,
        moveSignature,
        erEndpoint,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
