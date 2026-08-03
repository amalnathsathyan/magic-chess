// @ts-nocheck
import {
  Connection,
  type PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";
import type { AnchorWallet, Program } from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import type { MagicChess } from "./idl/magic_chess";
import type {
  ChessMatch,
  CreateMatchParams,
  JoinMatchParams,
  MatchInfo,
  Move,
  MoveResult,
} from "./types";
import { findChessMatchPda, findMatchEscrowPda } from "./pda";
import { MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID } from "./magicblock";

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
  readonly wallet: AnchorWallet | undefined;
  readonly programId: PublicKey;

  constructor(program: Program<MagicChess>, wallet?: AnchorWallet) {
    this.program = program;
    this.wallet = wallet;
    this.programId = program.programId;
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
        params.betAmount,
        params.moveTimeoutDuration,
        params.platformFeeBasisPoints,
        params.platformFeeWallet
      )
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: this.wallet?.publicKey,
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
    const [chessMatchPda] = findChessMatchPda(params.matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(params.matchId, this.programId);

    const sig = await this.program.methods
      .joinMatch(params.betAmount)
      .accounts({
        chessMatch: chessMatchPda,
        playerTwoSigner: this.wallet?.publicKey,
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
   * NOTE: This instruction does NOT yet exist in the on-chain program.
   * When implemented, it should refund Player 1's bet minus any platform fee.
   * Until then, this method throws.
   */
  async abortMatch(matchId: string): Promise<{ signature: TransactionSignature }> {
    throw new Error(
      "abortMatch: instruction not yet implemented in the on-chain program. " +
        "See agent-findings/04-ts-sdk-design.md for details."
    );
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

    const sig = await this.program.methods
      .makeMove({
        fromRow: move.fromRow,
        fromCol: move.fromCol,
        toRow: move.toRow,
        toCol: move.toCol,
        promotion: move.promotion ?? null,
      } as any)
      .accounts({
        chessMatch: chessMatchPda,
        player: this.wallet?.publicKey,
      })
      .rpc();

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

    const sig = await this.program.methods
      .resignGame()
      .accounts({
        chessMatch: chessMatchPda,
        playerSigner: this.wallet?.publicKey,
      })
      .rpc();

    return { signature: sig };
  }

  /**
   * Claim a win when the opponent has exceeded the per-move timeout.
   */
  async claimTimeout(
    matchId: string
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const sig = await this.program.methods
      .claimTimeoutWin()
      .accounts({
        chessMatch: chessMatchPda,
        claimerSigner: this.wallet?.publicKey,
      })
      .rpc();

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
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    const [matchEscrowPda] = findMatchEscrowPda(matchId, this.programId);

    const sig = await this.program.methods
      .processMatchSettlement()
      .accounts({
        chessMatch: chessMatchPda,
        matchEscrowTokenAccount: matchEscrowPda,
        playerOneAta,
        playerTwoAta,
        platformFeeAta,
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
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    const sig = await this.program.methods
      .delegateMatch(matchId)
      .accounts({
        payer: this.wallet?.publicKey,
        chessMatch: chessMatchPda,
      })
      .rpc();

    return { signature: sig };
  }

  /**
   * Commit the delegated account state from the ER back to the base layer.
   *
   * Keeps the account delegated after commit so gameplay can continue.
   * Send to the **Ephemeral Rollup** connection.
   *
   * @param matchId - The delegated match to commit.
   * @param erConnection - A Connection to the ER validator (use {@link getERConnection}).
   */
  async commitState(
    matchId: string,
    erConnection: Connection
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    if (!this.wallet) {
      throw new Error("commitState requires a wallet for signing");
    }

    const ix = await this.program.methods
      .commitState()
      .accounts({
        payer: this.wallet.publicKey,
        chessMatch: chessMatchPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = this.wallet.publicKey;

    const { blockhash } = await erConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signedTx = await this.wallet.signTransaction(tx);
    const sig = await erConnection.sendRawTransaction(
      signedTx.serialize()
    );

    return { signature: sig };
  }

  /**
   * Commit state and undelegate the match from the ER back to the base layer.
   *
   * After this, the account is no longer delegated and subsequent operations
   * should be sent to the base layer. Send to the **Ephemeral Rollup** connection.
   *
   * @param matchId - The delegated match to undelegate.
   * @param erConnection - A Connection to the ER validator (use {@link getERConnection}).
   */
  async undelegateMatch(
    matchId: string,
    erConnection: Connection
  ): Promise<{ signature: TransactionSignature }> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);

    if (!this.wallet) {
      throw new Error("undelegateMatch requires a wallet for signing");
    }

    const ix = await this.program.methods
      .undelegateMatch()
      .accounts({
        payer: this.wallet.publicKey,
        chessMatch: chessMatchPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = this.wallet.publicKey;

    const { blockhash } = await erConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signedTx = await this.wallet.signTransaction(tx);
    const sig = await erConnection.sendRawTransaction(
      signedTx.serialize()
    );

    return { signature: sig };
  }

  // ── Queries ──────────────────────────────────────────────────

  /**
   * Fetch full match state by match ID.
   */
  async getMatch(matchId: string): Promise<ChessMatch | null> {
    const [chessMatchPda] = findChessMatchPda(matchId, this.programId);
    try {
      const account = await this.program.account.chessMatch.fetch(
        chessMatchPda
      );
      return account as unknown as ChessMatch;
    } catch {
      return null;
    }
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
      .map((a: any) => toMatchInfo(a.account));

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
      .map((a: any) => toMatchInfo(a.account));
  }
}

// ── Helpers ────────────────────────────────────────────────────

function toMatchInfo(account: any): MatchInfo {
  return {
    matchId: account.matchId as string,
    players: [
      account.players[0] as PublicKey,
      account.players[1] as PublicKey,
    ],
    gameStatus: account.gameStatus as any,
    bettingTokenMint: account.bettingTokenMint as PublicKey,
    betAmountPlayerOne: account.betAmountPlayerOne as number,
    totalPot: account.totalPot as number,
    moveTimeoutDuration: account.moveTimeoutDuration as number,
    lastMoveTimestamp: account.lastMoveTimestamp as number,
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
    return "stalemate" as MoveResult;
  }

  return "normal" as MoveResult;
}
