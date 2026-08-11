/**
 * Live devnet script: creates a new match, delegates to MagicBlock ER,
 * then plays 6 half-moves (3 white + 3 black) using chess.js heuristics.
 */
const { readFileSync } = require("node:fs");
const anchor = require("@coral-xyz/anchor");
const solanaWeb3 = require("@solana/web3.js");
const splToken = require("@solana/spl-token");
const { Chess } = require("chess.js");
const idl = require("../target/idl/magic_chess.json");

const {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = solanaWeb3;
const { NATIVE_MINT, TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } = splToken;

const BASE_RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ROUTER_RPC = "https://devnet-router.magicblock.app/";
const PROGRAM_ID = new PublicKey("FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
const SESSION_PROGRAM_ID = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const CREATE_SESSION_V2 = Buffer.from([223, 233, 108, 7, 65, 194, 235, 38]);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadWallet(): Keypair {
  const p = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const resp = await fetch(ROUTER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [match.toBase58()],
      }),
    });
    const body = (await resp.json()) as { result?: { isDelegated?: boolean; fqdn?: string } };
    if (body.result?.isDelegated && body.result.fqdn) {
      const url = body.result.fqdn.startsWith("http")
        ? body.result.fqdn
        : `https://${body.result.fqdn}`;
      console.log(`  ER resolved on attempt ${attempt + 1}: ${url}`);
      return url;
    }
    await delay(1_500);
  }
  throw new Error("Router did not expose the delegated match after 60 attempts");
}

// ---------------------------------------------------------------------------
// Board → FEN
// ---------------------------------------------------------------------------

const PIECE_CHAR: Record<string, string> = {
  Pawn: "p",
  Knight: "n",
  Bishop: "b",
  Rook: "r",
  Queen: "q",
  King: "k",
};

interface DecodedMatch {
  match_id: string;
  board: Array<Array<{ piece_type: Record<string, object>; color: Record<string, object> } | null>>;
  current_turn: Record<string, object>;
  castling_rights: { white_kingside: boolean; white_queenside: boolean; black_kingside: boolean; black_queenside: boolean };
  en_passant_target: { row: number; col: number } | null;
  halfmove_clock: number;
  fullmove_number: number;
  game_status: Record<string, object>;
}

function boardToFen(state: DecodedMatch): string {
  const parts: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let empty = 0;
    let rankStr = "";
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          rankStr += empty.toString();
          empty = 0;
        }
        const pType = Object.keys(piece.piece_type)[0];
        const color = Object.keys(piece.color)[0];
        const ch = PIECE_CHAR[pType] ?? "?";
        rankStr += color === "White" ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) rankStr += empty.toString();
    parts.push(rankStr);
  }
  const placement = parts.join("/");

  // Active color
  const active = Object.keys(state.current_turn)[0] === "White" ? "w" : "b";

  // Castling
  let castling = "";
  if (state.castling_rights?.white_kingside) castling += "K";
  if (state.castling_rights?.white_queenside) castling += "Q";
  if (state.castling_rights?.black_kingside) castling += "k";
  if (state.castling_rights?.black_queenside) castling += "q";
  if (!castling) castling = "-";

  // En passant
  let ep = "-";
  if (state.en_passant_target) {
    const file = String.fromCharCode(97 + state.en_passant_target.col);
    const rank = state.en_passant_target.row + 1;
    ep = `${file}${rank}`;
  }

  const hm = state.halfmove_clock ?? 0;
  const fm = state.fullmove_number ?? 1;

  return `${placement} ${active} ${castling} ${ep} ${hm} ${fm}`;
}

// ---------------------------------------------------------------------------
// Move picker (simple heuristic)
// ---------------------------------------------------------------------------

function pickMove(chess: Chess): { from: string; to: string; promotion?: string } | null {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const centerSquares = new Set(["d4", "e4", "d5", "e5"]);

  const scored = moves.map((m) => {
    let score = 0;
    if (m.captured) score += (pieceValues[m.captured] ?? 0) * 10;
    if (m.san.includes("+")) score += 5;
    if (centerSquares.has(m.to)) score += 2;
    if (m.promotion) score += 80;
    if (m.san === "O-O" || m.san === "O-O-O") score += 3;
    // Developing a piece in the opening is good
    if (["n", "b"].includes(m.piece) && parseInt(m.from[1]) <= 2) score += 4;
    score += Math.random() * 1.0;
    return { move: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function algebraicToRowCol(sq: string): { row: number; col: number } {
  return {
    col: sq.charCodeAt(0) - 97,
    row: parseInt(sq[1]) - 1,
  };
}

function promotionToAnchor(p: string): Record<string, object> | null {
  const map: Record<string, Record<string, object>> = {
    q: { Queen: {} },
    r: { Rook: {} },
    b: { Bishop: {} },
    n: { Knight: {} },
  };
  return map[p] ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Magic Chess: Play Match on Devnet ===\n");

  // 1. Setup
  const connection = new solanaWeb3.Connection(BASE_RPC, "confirmed");
  const white = loadWallet();
  const black = Keypair.generate();
  const whiteSession = Keypair.generate();
  const blackSession = Keypair.generate();

  console.log(`White wallet : ${white.publicKey.toBase58()}`);
  console.log(`Black wallet : ${black.publicKey.toBase58()}`);
  console.log(`White session: ${whiteSession.publicKey.toBase58()}`);
  console.log(`Black session: ${blackSession.publicKey.toBase58()}`);

  // 2. Match ID & PDAs
  const matchId = `mc-${Date.now().toString(16).padStart(12, "0")}${whiteSession.publicKey
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
  const [whiteSessionToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("session_token_v2"), PROGRAM_ID.toBuffer(), whiteSession.publicKey.toBuffer(), white.publicKey.toBuffer()],
    SESSION_PROGRAM_ID
  );
  const [blackSessionToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("session_token_v2"), PROGRAM_ID.toBuffer(), blackSession.publicKey.toBuffer(), black.publicKey.toBuffer()],
    SESSION_PROGRAM_ID
  );

  const [bufferPda] = PublicKey.findProgramAddressSync(
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

  console.log(`Match ID     : ${matchId}`);
  console.log(`Match PDA    : ${match.toBase58()}`);
  console.log(`Escrow PDA   : ${escrow.toBase58()}`);

  // 3. Fund black
  console.log("\n--- Funding black ---");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: white.publicKey, toPubkey: black.publicKey, lamports: 10_000_000 })
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [white]);
  console.log(`Funded black 0.01 SOL: ${fundSig.slice(0, 44)}...`);

  // 4. Create ATAs
  console.log("\n--- Creating token accounts ---");
  const whiteAta = (await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, white.publicKey)).address;
  const blackAta = (await getOrCreateAssociatedTokenAccount(connection, white, NATIVE_MINT, black.publicKey)).address;
  console.log(`White ATA: ${whiteAta.toBase58()}`);
  console.log(`Black ATA: ${blackAta.toBase58()}`);

  // 5. Initialize match
  console.log("\n--- Initializing match ---");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(white), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as never, provider);

  const createSig = await program.methods
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
  console.log(`Initialize: ${createSig}`);

  // 6. Join match (black)
  console.log("\n--- Joining match as black ---");
  const blackProvider = new anchor.AnchorProvider(connection, new anchor.Wallet(black), provider.opts);
  const blackProgram = new anchor.Program(idl as never, blackProvider);

  const joinSig = await blackProgram.methods
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
  console.log(`Join: ${joinSig}`);

  // 7. Create session tokens (on SessionKeys program, L1)
  console.log("\n--- Creating session tokens ---");

  const whiteSessionSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createSessionInstruction({ authority: white.publicKey, sessionSigner: whiteSession.publicKey, sessionToken: whiteSessionToken })),
    [white, whiteSession],
    { commitment: "confirmed" }
  );
  console.log(`White session: ${whiteSessionSig.slice(0, 44)}...`);

  const blackSessionSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createSessionInstruction({ authority: black.publicKey, sessionSigner: blackSession.publicKey, sessionToken: blackSessionToken })),
    [black, blackSession],
    { commitment: "confirmed" }
  );
  console.log(`Black session: ${blackSessionSig.slice(0, 44)}...`);

  // 8. Delegate match to MagicBlock ER
  console.log("\n--- Delegating match to MagicBlock ER ---");
  const delegateSig = await program.methods
    .delegateMatch()
    .accountsStrict({
      payer: white.publicKey,
      player: white.publicKey,
      bufferChessMatch: bufferPda,
      delegationRecordChessMatch: delegationRecord,
      delegationMetadataChessMatch: delegationMetadata,
      chessMatch: match,
      ownerProgram: PROGRAM_ID,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`Delegate: ${delegateSig}`);

  // 9. Resolve ER endpoint
  console.log("\n--- Resolving ER endpoint ---");
  const erEndpoint = await resolveEr(match);

  const erConnection = new solanaWeb3.Connection(erEndpoint, "confirmed");

  // 10. Play moves
  console.log("\n=== Playing chess ===");
  const TOTAL_MOVES = 6; // 3 white + 3 black

  const coder = new anchor.BorshCoder(idl as never);

  for (let moveNum = 0; moveNum < TOTAL_MOVES; moveNum++) {
    // Read current board from ER
    console.log(`\n--- Move ${moveNum + 1}/${TOTAL_MOVES} ---`);
    const accountInfo = await erConnection.getAccountInfo(match);
    if (!accountInfo) throw new Error("Match account not found on ER");

    const state = coder.accounts.decode("ChessMatch", accountInfo.data) as unknown as DecodedMatch;

    // Check game status
    const status = Object.keys(state.game_status)[0];
    if (status !== "Active") {
      console.log(`Game is not active (status: ${status}). Stopping.`);
      break;
    }

    const turn = Object.keys(state.current_turn)[0]; // "White" or "Black"
    console.log(`Turn: ${turn}`);

    // Convert to FEN
    const fen = boardToFen(state);
    console.log(`FEN: ${fen}`);

    const chess = new Chess(fen);

    // Pick a move
    const chosen = pickMove(chess);
    if (!chosen) {
      console.log(`No legal moves for ${turn}. Game over.`);
      break;
    }

    const fromRC = algebraicToRowCol(chosen.from);
    const toRC = algebraicToRowCol(chosen.to);
    const promotionAnchor = chosen.promotion ? promotionToAnchor(chosen.promotion) : null;

    console.log(`Chosen move: ${chosen.from}→${chosen.to}${chosen.promotion ? "=" + chosen.promotion : ""}`);

    // Determine which session to use
    const isWhite = turn === "White";
    const sessionSigner = isWhite ? whiteSession : blackSession;
    const sessionToken = isWhite ? whiteSessionToken : blackSessionToken;

    // Create ER provider with the appropriate session wallet
    const erProvider = new anchor.AnchorProvider(
      erConnection,
      new anchor.Wallet(sessionSigner),
      { commitment: "confirmed", preflightCommitment: "confirmed" }
    );
    const erProgram = new anchor.Program(idl as never, erProvider);

    const moveSig = await erProgram.methods
      .makeMove({
        fromRow: fromRC.row,
        fromCol: fromRC.col,
        toRow: toRC.row,
        toCol: toRC.col,
        promotion: promotionAnchor as any,
      } as any)
      .accounts({ chessMatch: match, player: sessionSigner.publicKey, sessionToken } as any)
      .signers([sessionSigner])
      .rpc();

    console.log(`Move tx: ${moveSig}`);

    // Small delay to let ER settle
    await delay(2_000);
  }

  // 11. Print final state
  console.log("\n=== Final board state ===");
  const finalAccount = await erConnection.getAccountInfo(match);
  if (finalAccount) {
    const finalState = coder.accounts.decode("ChessMatch", finalAccount.data) as unknown as DecodedMatch;
    console.log(`Status  : ${Object.keys(finalState.game_status)[0]}`);
    console.log(`Turn    : ${Object.keys(finalState.current_turn)[0]}`);
    console.log(`FEN     : ${boardToFen(finalState)}`);
    console.log(`Fullmove: ${finalState.fullmove_number}`);

    // Print board visually
    console.log("\n  a b c d e f g h");
    for (let row = 7; row >= 0; row--) {
      const line = [`${row + 1} `];
      for (let col = 0; col < 8; col++) {
        const piece = finalState.board[row]?.[col];
        if (!piece) {
          line.push(".");
        } else {
          const pType = Object.keys(piece.piece_type)[0];
          const color = Object.keys(piece.color)[0];
          const ch = PIECE_CHAR[pType] ?? "?";
          line.push(color === "White" ? ch.toUpperCase() : ch);
        }
      }
      console.log(line.join(" "));
    }
    console.log("  a b c d e f g h");
  }

  console.log("\n=== Match complete ===");
  console.log(`Match ID: ${matchId}`);
  console.log(`Match PDA: ${match.toBase58()}`);
  console.log(`ER endpoint: ${erEndpoint}`);
}

main().catch((error) => {
  console.error("FATAL:", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    // Print a few lines of the stack for debugging
    const lines = error.stack.split("\n").slice(0, 6);
    console.error(lines.join("\n"));
  }
  process.exitCode = 1;
});
