import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  type TransactionSignature,
} from "@solana/web3.js";
import { BN, type Program } from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import type { MagicChess } from "./idl/magic_chess";
import type {
  ChessMatch,
  CreateMatchParams,
  JoinMatchParams,
  MatchInfo,
  Move,
  MoveResult,
  IntegerInput,
  MagicChessWallet,
} from "./types";
import { PieceType } from "./types";
import { findChessMatchPda, findMatchEscrowPda, findPredictionPoolPda } from "./pda";
import {
  DELEGATION_PROGRAM_ID,
  MAGICBLOCK_DEVNET_ROUTER,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  resolveAccountRuntime,
} from "./magicblock";

const TOKEN_PROGRAM = TOKEN_PROGRAM_ID;
const SYSTEM_PROGRAM = SystemProgram.programId;

/**
 * MagicChessClient — typed wrapper around @anchor-lang/core Program<MagicChess>.
 *
 * Builds instructions, sends transactions, and provides convenience queries
 * for the Magic Chess on-chain chess program.
 */
export class MagicChessClient {
  readonly program: Program<MagicChess>;
  readonly wallet: MagicChessWallet | undefined;
  readonly programId: PublicKey;
  readonly routerEndpoint: string;

  constructor(
    program: Program<MagicChess>,
    wallet?: MagicChessWallet,
    options?: { routerEndpoint?: string }
  ) {
    this.program = program;
    this.wallet = wallet;
    this.programId = program.programId;
    this.routerEndpoint =
      options?.routerEndpoint ?? MAGICBLOCK_DEVNET_ROUTER;
  }

  private requireWallet(action: string): MagicChessWallet {
    if (!this.wallet) throw new Error(`${action} requires a connected wallet`);
    return this.wallet;
  }

  private get baseConnection(): Connection {
    return this.program.provider.connection;
  }

  private async sendInstruction(
    connection: Connection,
    instruction: TransactionInstruction
  ): Promise<TransactionSignature> {
    const wallet = this.requireWallet("Transaction submission");
    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: wallet.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(instruction);
    const signed = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    return signature;
  }

  private async runtimeForMatch(matchId: string) {
    const [match] = findChessMatchPda(matchId, this.programId);
    const runtime = await resolveAccountRuntime(
      this.baseConnection,
      match,
      this.programId,
      this.routerEndpoint
    );
    if (!runtime) throw new Error(`Match ${matchId} not found`);
    return runtime;
  }

  private async requireBaseMatch(matchId: string): Promise<void> {
    const runtime = await this.runtimeForMatch(matchId);
    if (runtime.runtime !== "base") {
      throw new Error(`Match ${matchId} is delegated; undelegate it before this operation`);
    }
  }

  // ── Match Lifecycle ──────────────────────────────────────────

  /**
   * Create a new chess match as Player 1 (White).
   *
   * Transfers the bet amount from the player's token account into a PDA escrow.
   */
  async createMatch(
    params: CreateMatchParams
  ): Promise<{ match: string; signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(params.matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(params.matchId, this.programId);

    const sig = await this.program.methods
      .initializeMatch(
        params.matchId,
        toBN(params.betAmount, "betAmount", false),
        toBN(params.moveTimeoutDuration, "moveTimeoutDuration", true),
        params.platformFeeBasisPoints,
        params.platformFeeWallet,
        params.predictionEnabled ?? false
      )
      .accountsPartial({
        chessMatch: chessMatchPda,
        playerSigner: this.requireWallet("createMatch").publicKey,
        bettingTokenMintAccount: params.bettingTokenMint,
        playerTokenAccount: params.playerTokenAccount,
        matchEscrowTokenAccount: matchEscrowPda,
        tokenProgram: TOKEN_PROGRAM,
        systemProgram: SYSTEM_PROGRAM,
      })
      .rpc();

    return { match: params.matchId, signature: sig };
  }

  /**
   * Join an existing match as Player 2 (Black).
   *
   * Matches the bet amount and transfers tokens into the escrow.
   */
  async joinMatch(
    params: JoinMatchParams
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(params.matchId);
    const match = await this.getMatch(params.matchId);
    if (!match) throw new Error(`Match ${params.matchId} not found`);
    if (params.betAmount !== undefined) {
      const expected = integerToBigInt(params.betAmount, "betAmount");
      if (expected !== match.betAmountPlayerOne) {
        throw new Error(
          `Stale wager: chain requires ${match.betAmountPlayerOne} raw units, received ${expected}`
        );
      }
    }

    const [chessMatchPda] = findChessMatchPda(params.matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(params.matchId, this.programId);

    const sig = await this.program.methods
      .joinMatch(toBN(params.betAmount, "betAmount", false))
      .accountsPartial({
        chessMatch: chessMatchPda,
        playerTwoSigner: this.requireWallet("joinMatch").publicKey,
        playerTokenAccount: params.playerTokenAccount,
        matchEscrowTokenAccount: matchEscrowPda,
        tokenProgram: TOKEN_PROGRAM,
        systemProgram: SYSTEM_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  /**
   * Abort a match while it is still in WaitingForOpponent status.
   *
   * Refunds Player 1's bet from escrow and closes the escrow token account.
   *
   * @param matchId - The match to abort
   * @param playerTokenAccount - Player 1's token account (ATA) for receiving refund
   */
  async abortMatch(
    matchId: string,
    playerTokenAccount: PublicKey
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(matchId, this.programId);

    const sig = await this.program.methods
      .abortMatch()
      .accountsPartial({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: matchEscrowPda,
        playerTokenAccount,
        playerSigner: this.requireWallet("abortMatch").publicKey,
        tokenProgram: TOKEN_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  // ── Gameplay ─────────────────────────────────────────────────

  /**
   * Execute a chess move.
   *
   * @returns The MoveResult describing the effect of the move (Normal, Checkmate, etc.)
   */
  async makeMove(
    matchId: string,
    move: Move
  ): Promise<{ result: MoveResult; signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const ix = await this.program.methods
      .makeMove({
        fromRow: move.fromRow,
        fromCol: move.fromCol,
        toRow: move.toRow,
        toCol: move.toCol,
        promotion: move.promotion
          ? toAnchorPieceType(move.promotion)
          : null,
      })
      .accountsPartial({
        chessMatch: chessMatchPda,
        player: this.requireWallet("makeMove").publicKey,
      })
      .instruction();
    const runtime = await this.runtimeForMatch(matchId);
    const sig = await this.sendInstruction(runtime.connection, ix);

    // After the transaction, fetch the updated match to determine result
    const match = await this.getMatch(matchId);
    const result = determineMoveResult(match);

    return { result, signature: sig };
  }

  /**
   * Resign from the current game. Opponent wins.
   */
  async resign(matchId: string): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const ix = await this.program.methods
      .resignGame()
      .accountsPartial({
        chessMatch: chessMatchPda,
        playerSigner: this.requireWallet("resign").publicKey,
      })
      .instruction();
    const runtime = await this.runtimeForMatch(matchId);
    const sig = await this.sendInstruction(runtime.connection, ix);

    return { signature: sig };
  }

  /**
   * Claim a win when the opponent has exceeded the per-move timeout.
   */
  async claimTimeout(
    matchId: string
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const ix = await this.program.methods
      .claimTimeoutWin()
      .accountsPartial({
        chessMatch: chessMatchPda,
        claimerSigner: this.requireWallet("claimTimeout").publicKey,
      })
      .instruction();
    const runtime = await this.runtimeForMatch(matchId);
    const sig = await this.sendInstruction(runtime.connection, ix);

    return { signature: sig };
  }

  // ── Settlement ───────────────────────────────────────────────

  /**
   * Process payout distribution after a game concludes.
   *
   * Requires both players' token accounts and the platform fee ATA.
   */
  async settleMatch(
    matchId: string,
    playerOneAta: PublicKey,
    playerTwoAta: PublicKey,
    platformFeeAta: PublicKey
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(matchId, this.programId);

    const sig = await this.program.methods
      .processMatchSettlement()
      .accountsPartial({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: matchEscrowPda,
        playerOneAta,
        playerTwoAta,
        platformFeeAta,
        payer: this.requireWallet("settleMatch").publicKey,
        tokenProgram: TOKEN_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  // ── MagicBlock Ephemeral Rollups ───────────────────────────────

  /**
   * Delegate a chess match account to MagicBlock Ephemeral Rollups.
   *
   * This locks the match account on the base layer and clones it into the ER,
   * enabling low-latency gameplay. Send to **base layer**.
   *
   * @param matchId - The match to delegate. Used as the delegation uid.
   */
  async delegateMatch(
    matchId: string
  ): Promise<{ signature: TransactionSignature; ephemeralRpcEndpoint: string }> {
    await this.requireBaseMatch(matchId);
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const [bufferChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer"), chessMatchPda.toBuffer()],
      this.programId
    );
    const [delegationRecordChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation"), chessMatchPda.toBuffer()],
      DELEGATION_PROGRAM_ID
    );
    const [delegationMetadataChessMatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()],
      DELEGATION_PROGRAM_ID
    );

    const sig = await this.program.methods
      .delegateMatch()
      .accountsStrict({
        payer: this.requireWallet("delegateMatch").publicKey,
        bufferChessMatch,
        delegationRecordChessMatch,
        delegationMetadataChessMatch,
        chessMatch: chessMatchPda,
        ownerProgram: this.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM,
      })
      .rpc();

    const runtime = await waitForDelegation(
      this.baseConnection,
      chessMatchPda,
      this.programId,
      this.routerEndpoint
    );
    const ephemeralRpcEndpoint = runtime.connection.rpcEndpoint;

    return { signature: sig, ephemeralRpcEndpoint };
  }

  /**
   * Commit the delegated account state from the ER back to the base layer.
   *
   * Keeps the account delegated after commit so gameplay can continue.
   * Send to the **Ephemeral Rollup** connection.
   *
   * @param matchId - The delegated match to commit.
   * The authoritative ER endpoint is resolved from the base-layer owner and router.
   */
  async commitState(
    matchId: string
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    if (!this.wallet) {
      throw new Error("commitState requires a wallet for signing");
    }

    const ix = await this.program.methods
      .commitState()
      .accountsPartial({
        payer: this.wallet.publicKey,
        chessMatch: chessMatchPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const runtime = await this.runtimeForMatch(matchId);
    if (runtime.runtime !== "ephemeral") {
      throw new Error(`Match ${matchId} is not delegated`);
    }
    const sig = await this.sendInstruction(runtime.connection, ix);

    return { signature: sig, baseCommitmentSignature };
  }

  /**
   * Commit state and undelegate the match from the ER back to the base layer.
   *
   * After this, the account is no longer delegated and subsequent operations
   * should be sent to the base layer. Send to the **Ephemeral Rollup** connection.
   *
   * @param matchId - The delegated match to undelegate.
   * The authoritative ER endpoint is resolved from the base-layer owner and router.
   */
  async undelegateMatch(
    matchId: string
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    if (!this.wallet) {
      throw new Error("undelegateMatch requires a wallet for signing");
    }

    const ix = await this.program.methods
      .undelegateMatch()
      .accountsPartial({
        payer: this.wallet.publicKey,
        chessMatch: chessMatchPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const runtime = await this.runtimeForMatch(matchId);
    if (runtime.runtime !== "ephemeral") {
      throw new Error(`Match ${matchId} is not delegated`);
    }
    const sig = await this.sendInstruction(runtime.connection, ix);

    return { signature: sig, baseCommitmentSignature };
  }

  /** Register a real session signer on the authoritative runtime. */
  async setSessionKey(
    matchId: string,
    sessionSigner: PublicKey,
    expiresAt: IntegerInput
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const ix = await this.program.methods
      .setSessionKey(sessionSigner, toBN(expiresAt, "expiresAt", true))
      .accountsPartial({
        chessMatch: chessMatchPda,
        player: this.requireWallet("setSessionKey").publicKey,
      })
      .instruction();
    const runtime = await this.runtimeForMatch(matchId);
    const signature = await this.sendInstruction(runtime.connection, ix);
    return { signature };
  }

  /** Register a real session signer on the authoritative runtime. */
  async setSessionKey(
    matchId: string,
    sessionSigner: PublicKey,
    expiresAt: IntegerInput
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const ix = await this.program.methods
      .setSessionKey(sessionSigner, toBN(expiresAt, "expiresAt", true))
      .accountsPartial({
        chessMatch: chessMatchPda,
        player: this.requireWallet("setSessionKey").publicKey,
      })
      .instruction();
    const runtime = await this.runtimeForMatch(matchId);
    const signature = await this.sendInstruction(runtime.connection, ix);
    return { signature };
  }

  // ── Queries ──────────────────────────────────────────────────

  /**
   * Fetch full match state by match ID.
   */
  async getMatch(matchId: string): Promise<ChessMatch | null> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const runtime = await resolveAccountRuntime(
      this.baseConnection,
      chessMatchPda,
      this.programId,
      this.routerEndpoint
    );
    if (!runtime) return null;
    const account = this.program.coder.accounts.decode(
      "chessMatch",
      runtime.accountInfo.data
    );
    return normalizeChessMatch(account);
  }

  /**
   * List matches that are joinable (WaitingForOpponent status).
   *
   * Optionally filter by betting token mint.
   */
  async listJoinableMatches(filters?: {
    mint?: PublicKey;
  }): Promise<MatchInfo[]> {
    const allAccounts = await this.program.account.chessMatch.all();

    let matches = allAccounts
      .filter(
        (a: any) =>
          a.account.gameStatus &&
          "waitingForOpponent" in a.account.gameStatus
      )
      .map((a: any) => toMatchInfo(normalizeChessMatch(a.account)));

    if (filters?.mint) {
      const mintStr = filters.mint.toBase58();
      matches = matches.filter(
        (m: MatchInfo) => m.bettingTokenMint.toBase58() === mintStr
      );
    }

    return matches;
  }

  /**
   * List all matches for a given player.
   */
  async getPlayerMatches(player: PublicKey): Promise<MatchInfo[]> {
    const allAccounts = await this.program.account.chessMatch.all();
    const playerStr = player.toBase58();

    return allAccounts
      .filter((a: any) => {
        const players = a.account.players as PublicKey[];
        return (
          players[0]?.toBase58() === playerStr ||
          players[1]?.toBase58() === playerStr
        );
      })
      .map((a: any) => toMatchInfo(normalizeChessMatch(a.account)));
  }
  // ── Prediction Market ────────────────────────────────────────

  async initializePredictionPool(
    matchId: string,
    platformFeeBps: number
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [predictionPoolPda] = findPredictionPoolPda(matchId, this.programId);
    const [predictionPoolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_pool_vault"), predictionPoolPda.toBuffer()],
      this.programId
    );
    const match = await this.getMatch(matchId);
    if (!match) throw new Error("Match not found");

    const sig = await this.program.methods
      .initializePredictionPool(platformFeeBps)
      .accountsPartial({
        payer: this.requireWallet("initializePredictionPool").publicKey,
        chessMatch: chessMatchPda,
        predictionPool: predictionPoolPda,
        predictionPoolVault: predictionPoolVaultPda,
        bettingTokenMint: match.bettingTokenMint,
        systemProgram: SYSTEM_PROGRAM,
        tokenProgram: TOKEN_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  async placePredictionBet(
    matchId: string,
    predictedOutcome: number, // 0 = White, 1 = Black, 2 = Draw
    betAmount: IntegerInput,
    bettorTokenAccount: PublicKey
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const wallet = this.requireWallet("placePredictionBet");
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [predictionPoolPda] = findPredictionPoolPda(matchId, this.programId);
    const [predictionPoolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_pool_vault"), predictionPoolPda.toBuffer()],
      this.programId
    );
    const [predictionBetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_bet"), predictionPoolPda.toBuffer(), wallet.publicKey.toBuffer()],
      this.programId
    );

    const sig = await this.program.methods
      .placePredictionBet(toBN(betAmount, "betAmount", false), predictedOutcome)
      .accountsPartial({
        chessMatch: chessMatchPda,
        predictionPool: predictionPoolPda,
        predictionBet: predictionBetPda,
        predictionPoolVault: predictionPoolVaultPda,
        bettorTokenAccount: bettorTokenAccount,
        bettor: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM,
        systemProgram: SYSTEM_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  async cancelPredictionBet(
    matchId: string,
    bettorTokenAccount: PublicKey
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const wallet = this.requireWallet("cancelPredictionBet");
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [predictionPoolPda] = findPredictionPoolPda(matchId, this.programId);
    const [predictionPoolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_pool_vault"), predictionPoolPda.toBuffer()],
      this.programId
    );
    const [predictionBetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_bet"), predictionPoolPda.toBuffer(), wallet.publicKey.toBuffer()],
      this.programId
    );

    const sig = await this.program.methods
      .cancelPredictionBet()
      .accountsPartial({
        chessMatch: chessMatchPda,
        predictionPool: predictionPoolPda,
        predictionBet: predictionBetPda,
        predictionPoolVault: predictionPoolVaultPda,
        bettorTokenAccount: bettorTokenAccount,
        bettor: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }

  async claimPredictionWinnings(
    matchId: string,
    bettorTokenAccount: PublicKey
  ): Promise<{ signature: TransactionSignature }> {
    await this.requireBaseMatch(matchId);
    const wallet = this.requireWallet("claimPredictionWinnings");
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [predictionPoolPda] = findPredictionPoolPda(matchId, this.programId);
    const [predictionPoolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_pool_vault"), predictionPoolPda.toBuffer()],
      this.programId
    );
    const [predictionBetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("prediction_bet"), predictionPoolPda.toBuffer(), wallet.publicKey.toBuffer()],
      this.programId
    );

    const sig = await this.program.methods
      .claimPredictionWinnings()
      .accountsPartial({
        chessMatch: chessMatchPda,
        predictionPool: predictionPoolPda,
        predictionBet: predictionBetPda,
        predictionPoolVault: predictionPoolVaultPda,
        bettorTokenAccount: bettorTokenAccount,
        bettor: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM,
      })
      .rpc();

    return { signature: sig };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function enumValue<T extends string>(value: unknown, label: string): T {
  if (typeof value === "string") return value as T;
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1) return keys[0] as T;
  }
  throw new Error(`Invalid ${label} enum returned by Anchor`);
}

function optionalEnumValue<T extends string>(
  value: unknown,
  label: string
): T | null {
  return value == null ? null : enumValue<T>(value, label);
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt(String(value));
  }
  throw new Error(`Invalid integer ${label} returned by Anchor`);
}

function toBN(value: IntegerInput, label: string, allowNegative: boolean): BN {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "object" && value !== null) {
    parsed = BigInt(value.toString(10));
  } else {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${label} must be a safe integer, bigint, or BN`);
    }
    parsed = BigInt(value);
  }
  if (!allowNegative && parsed < BigInt(0)) {
    throw new RangeError(`${label} cannot be negative`);
  }
  return new BN(parsed.toString());
}

function toAnchorPieceType(piece: PieceType) {
  switch (piece) {
    case PieceType.Pawn:
      return { pawn: {} } as const;
    case PieceType.Knight:
      return { knight: {} } as const;
    case PieceType.Bishop:
      return { bishop: {} } as const;
    case PieceType.Rook:
      return { rook: {} } as const;
    case PieceType.Queen:
      return { queen: {} } as const;
    case PieceType.King:
      return { king: {} } as const;
  }
}

function normalizePiece(piece: any) {
  if (!piece) return null;
  return {
    pieceType: enumValue(piece.pieceType, "pieceType"),
    color: enumValue(piece.color, "playerColor"),
  };
}

function normalizeChessMatch(account: any): ChessMatch {
  return {
    matchId: account.matchId,
    players: [account.players[0], account.players[1]],
    currentPlayerIdx: account.currentPlayerIdx,
    currentTurn: enumValue(account.currentTurn, "currentTurn"),
    lastMoveTimestamp: toBigInt(account.lastMoveTimestamp, "lastMoveTimestamp"),
    moveTimeoutDuration: toBigInt(account.moveTimeoutDuration, "moveTimeoutDuration"),
    gameStatus: enumValue(account.gameStatus, "gameStatus"),
    gameEndReason: optionalEnumValue(account.gameEndReason, "gameEndReason"),
    board: account.board.map((row: any[]) => row.map(normalizePiece)),
    castlingRights: account.castlingRights,
    enPassantTarget: account.enPassantTarget,
    halfmoveClock: account.halfmoveClock,
    fullmoveNumber: account.fullmoveNumber,
    positionHistory: account.positionHistory.map((value: unknown) =>
      toBigInt(value, "positionHistory")
    ),
    bettingTokenMint: account.bettingTokenMint,
    betAmountPlayerOne: toBigInt(account.betAmountPlayerOne, "betAmountPlayerOne"),
    betAmountPlayerTwo: toBigInt(account.betAmountPlayerTwo, "betAmountPlayerTwo"),
    totalPot: toBigInt(account.totalPot, "totalPot"),
    platformFeeBasisPoints: account.platformFeeBasisPoints,
    platformFeeWallet: account.platformFeeWallet,
    payoutProcessed: account.payoutProcessed,
    predictionEnabled: account.predictionEnabled,
    delegationUid: account.delegationUid,
    isDelegated: account.isDelegated,
    whiteSessionSigner: account.whiteSessionSigner,
    whiteSessionExpiresAt: toBigInt(account.whiteSessionExpiresAt, "whiteSessionExpiresAt"),
    blackSessionSigner: account.blackSessionSigner,
    blackSessionExpiresAt: toBigInt(account.blackSessionExpiresAt, "blackSessionExpiresAt"),
    activeTaskId: toBigInt(account.activeTaskId, "activeTaskId"),
    bump: account.bump,
    matchEscrowBump: account.matchEscrowBump,
  };
}

function toMatchInfo(account: ChessMatch): MatchInfo {
  return {
    matchId: account.matchId as string,
    players: [
      account.players[0] as PublicKey,
      account.players[1] as PublicKey,
    ],
    gameStatus: account.gameStatus,
    bettingTokenMint: account.bettingTokenMint,
    betAmountPlayerOne: account.betAmountPlayerOne,
    totalPot: account.totalPot,
    moveTimeoutDuration: account.moveTimeoutDuration,
    lastMoveTimestamp: account.lastMoveTimestamp,
  };
}

function determineMoveResult(match: ChessMatch | null): MoveResult {
  if (!match) return "normal" as MoveResult;

  const status = match.gameStatus;
  const reason = match.gameEndReason;

  if (status === "whiteWins" || status === "blackWins") {
    if (reason === "checkmate") return "checkmate" as MoveResult;
    if (reason === "timeout") return "normal" as MoveResult;
    return "checkmate" as MoveResult;
  }

  if (status === "draw") {
    if (reason === "stalemate") return "stalemate" as MoveResult;
    if (reason === "threefoldRepetition")
      return "threefoldRepetition" as MoveResult;
    if (reason === "insufficientMaterial")
      return "insufficientMaterial" as MoveResult;
    if (reason === "fiftyMoveRule") return "fiftyMoveRule" as MoveResult;
    return "stalemate" as MoveResult;
  }

  return "normal" as MoveResult;
}
