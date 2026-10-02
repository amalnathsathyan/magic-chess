"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sword,
  Zap,
} from "lucide-react";
import { Chess, type Move as ChessMove, type Square } from "chess.js";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@anchor-lang/core";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  DELEGATION_PROGRAM_ID,
  findChessMatchPda,
  findMatchEscrowPda,
  GameStatus,
  waitForDelegation,
  type ChessMatch,
} from "@magic-chess/sdk";
import { useMagicChessClient, useMatch } from "@magic-chess/sdk/react";
import { toast } from "sonner";
import { AuthGate } from "@/components/shared/AuthGate";
import { TransactionStatus } from "@/components/shared/TransactionStatus";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { BoardControls } from "@/components/chess/BoardControls";
import { api, type ApiMatchHistory } from "@/lib/api";
import { sounds } from "@/lib/sounds";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";
import {
  buildSettlementInstructions,
  buildWagerInstruction,
  getTransactionPayer,
} from "@/lib/wager";
import { useMagicBlock } from "@/hooks/useMagicBlock";
import { useMagicSession } from "@/components/shared/MagicSessionProvider";
import { cn } from "@/lib/utils";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { magicBlockTxUrl, solanaDevnetTxUrl } from "@/lib/explorer";
import { useMoveTransactionNotifications } from "@/hooks/useMoveTransactionNotifications";
import { useOnChainMoves } from "@/hooks/useOnChainMoves";
import { syncMoveMade, syncPlayerJoined } from "@/lib/sync";
import { PlayerRow } from "@/components/chess/PlayerRow";
import { PredictionPanel } from "@/components/predictions/PredictionPanel";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { copyToClipboard } from "@/lib/clipboard";
import { absoluteUrl, playHref, spectateHref } from "@/lib/match-links";
import {
  formatRemaining,
  isSquare,
  matchToFen,
  pliesPlayed,
} from "@/lib/match-board";

type TxStatus = "idle" | "submitting" | "confirming" | "success" | "error";
type PromotionPiece = "q" | "r" | "b" | "n";

const EMPTY_PUBLIC_KEY = PublicKey.default.toBase58();

function statusLabel(status: GameStatus): string {
  const labels: Record<GameStatus, string> = {
    [GameStatus.WaitingForOpponent]: "Waiting for opponent",
    [GameStatus.Active]: "In progress",
    [GameStatus.WhiteWins]: "White won",
    [GameStatus.BlackWins]: "Black won",
    [GameStatus.Draw]: "Draw",
    [GameStatus.Aborted]: "Aborted",
  };
  return labels[status];
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayView />
    </Suspense>
  );
}

function PlayView() {
  const matchId = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const client = useMagicChessClient();
  const { match, loading, error, refetch } = useMatch(matchId || null);
  const realtime = useMatchRealtime({ matchId });
  const [copied, setCopied] = useState(false);
  const { wallets } = useWallets();
  const wallet = selectSolanaWallet(wallets);
  const {
    submitMove,
    sessionStatus,
    sessionError,
    getFastPlaySession,
    enableFastPlay,
  } = useMagicBlock();
  const { prepareMatchSession } = useMagicSession();

  const [history, setHistory] = useState<ApiMatchHistory | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [boardWidth, setBoardWidth] = useState(320);
  const [now, setNow] = useState(() => Date.now());
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<ChessMove | null>(null);
  // Confirmed moves listed when the optimistic move was played.
  const [optimisticBase, setOptimisticBase] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txSignature, setTxSignature] = useState<string>();
  const [txExplorerHref, setTxExplorerHref] = useState<string>();
  const [txError, setTxError] = useState<string>();

  const loadHistory = useCallback(async () => {
    if (!matchId) return;
    try {
      setHistory(await api.getMatchHistory(matchId));
      setHistoryUnavailable(false);
    } catch {
      setHistoryUnavailable(true);
    }
  }, [matchId]);

  const refreshAfterMove = useCallback(() => {
    void Promise.allSettled([refetch(), loadHistory()]);
  }, [loadHistory, refetch]);

  useMoveTransactionNotifications({
    matchId,
    enabled: Boolean(match?.isDelegated),
    onMove: refreshAfterMove,
  });

  useEffect(() => {
    if (realtime.refreshSequence > 0) refreshAfterMove();
  }, [realtime.refreshSequence, refreshAfterMove]);

  useEffect(() => {
    void loadHistory();
    let polling = false;
    const intervalId = window.setInterval(() => {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      void Promise.allSettled([refetch(), loadHistory()]).finally(() => {
        polling = false;
      });
    }, realtime.status === "live" ? 8_000 : 3_000);
    return () => window.clearInterval(intervalId);
  }, [loadHistory, realtime.status, refetch]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Unlock audio on first user gesture (browser autoplay policy)
  useEffect(() => {
    const cleanup = sounds.bindUnlock();
    return cleanup;
  }, []);

  const authoritativeFen = useMemo(() => (match ? matchToFen(match) : null), [match]);

  useEffect(() => {
    const resize = () =>
      setBoardWidth(Math.min(560, Math.max(280, window.innerWidth - 32)));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // The board follows the chain as soon as it changes. The optimistic Moves
  // entry stays until a move source lists it (see confirmedMoves below).
  useEffect(() => {
    setOptimisticFen(null);
  }, [authoritativeFen]);

  const chainMoves = useOnChainMoves({
    matchId,
    enabled: Boolean(match?.isDelegated),
    refreshKey: authoritativeFen,
  });

  const displayFen = optimisticFen ?? authoritativeFen;
  const whiteAddress = match?.players[0].toBase58() ?? null;
  const rawBlackAddress = match?.players[1].toBase58() ?? null;
  const blackAddress = rawBlackAddress === EMPTY_PUBLIC_KEY ? null : rawBlackAddress;
  const walletAddress = wallet?.address;
  const playerColor =
    walletAddress && walletAddress === whiteAddress
      ? "white"
      : walletAddress && walletAddress === blackAddress
        ? "black"
        : null;
  const isParticipant = playerColor !== null;
  const isWaiting = match?.gameStatus === GameStatus.WaitingForOpponent;
  const isActive = match?.gameStatus === GameStatus.Active;
  const isFinished = Boolean(match && !isWaiting && !isActive);
  const isMyTurn = Boolean(
    match && playerColor && match.currentTurn === playerColor
  );
  const isBusy = txStatus === "submitting" || txStatus === "confirming";
  const canMove = Boolean(
    isActive && match?.isDelegated && isMyTurn && !isBusy && displayFen
  );
  const fastPlaySession = getFastPlaySession(matchId);
  // Moves are popup-free when the key saved here has a MagicBlock session
  // token, or is the one the match has registered for our side. A key the
  // rollup rejects is dropped on the first move, which brings the panel back.
  const registeredSigner = match
    ? playerColor === "white"
      ? match.whiteSessionSigner
      : playerColor === "black"
        ? match.blackSessionSigner
        : null
    : null;
  const fastPlayReady = Boolean(
    fastPlaySession &&
      (fastPlaySession.token ||
        registeredSigner?.equals(fastPlaySession.signer.publicKey))
  );

  useEffect(() => {
    if (playerColor) setOrientation(playerColor);
  }, [playerColor]);

  // Viewers who aren't in this game belong on the live spectator view, which
  // doesn't need sign-in and carries the prediction market.
  useEffect(() => {
    if (match && !isWaiting && !isParticipant && walletAddress) {
      router.replace(spectateHref(matchId));
    }
  }, [isParticipant, isWaiting, match, matchId, router, walletAddress]);

  const timeoutMilliseconds = match
    ? Number(match.moveTimeoutDuration) * 1_000
    : 0;
  const remainingMilliseconds =
    match && isActive && timeoutMilliseconds > 0
      ? Math.max(
          0,
          timeoutMilliseconds -
            (now - Number(match.lastMoveTimestamp) * 1_000)
        )
      : null;
  const canClaimTimeout = Boolean(
    isParticipant &&
      isActive &&
      !isMyTurn &&
      remainingMilliseconds === 0 &&
      !isBusy
  );

  // The indexer database and the rollup's own transaction log both list the
  // confirmed moves; use whichever is further along, so the list survives the
  // database being asleep or behind.
  const historyMoves =
    history?.moves.map((move) => ({
      san: move.san ?? move.algebraicMove,
      from: move.from,
      to: move.to,
    })) ?? [];
  const confirmedMoves =
    chainMoves && chainMoves.length > historyMoves.length ? chainMoves : historyMoves;
  const showOptimisticMove = Boolean(
    optimisticMove &&
      confirmedMoves.length <= optimisticBase &&
      (!match || pliesPlayed(match) <= optimisticBase + 1)
  );
  const moves = [
    ...confirmedMoves.map((move) => move.san),
    ...(showOptimisticMove && optimisticMove ? [optimisticMove.san] : []),
  ];
  const lastConfirmedMove = confirmedMoves.at(-1);
  const lastMove = showOptimisticMove && optimisticMove
    ? { from: optimisticMove.from, to: optimisticMove.to }
    : lastConfirmedMove &&
        isSquare(lastConfirmedMove.from) &&
        isSquare(lastConfirmedMove.to)
      ? { from: lastConfirmedMove.from, to: lastConfirmedMove.to }
      : null;
  const moveListBehind = Boolean(
    match && !showOptimisticMove && confirmedMoves.length < pliesPlayed(match)
  );

  const resetTransaction = () => {
    setTxStatus("idle");
    setTxSignature(undefined);
    setTxExplorerHref(undefined);
    setTxError(undefined);
  };

  const runTransaction = async (
    action: () => Promise<{ signature: string; rpcEndpoint?: string }>,
    successMessage: string
  ) => {
    resetTransaction();
    setTxStatus("submitting");
    try {
      const result = await action();
      setTxStatus("confirming");
      setTxSignature(result.signature);
      setTxExplorerHref(
        result.rpcEndpoint
          ? magicBlockTxUrl(result.signature, result.rpcEndpoint)
          : solanaDevnetTxUrl(result.signature)
      );
      await Promise.allSettled([refetch(), loadHistory()]);
      setTxStatus("success");
      toast.success(successMessage);
      return result.signature;
    } catch (transactionError) {
      const message =
        transactionError instanceof Error
          ? transactionError.message
          : "Transaction failed.";
      setTxError(message);
      setTxStatus("error");
      toast.error(message);
      throw transactionError;
    }
  };

  const handleJoin = async () => {
    if (!match || !wallet || !isWaiting) return;
    try {
      const owner = new PublicKey(wallet.address);
      const amount = match.betAmountPlayerOne;
      const programId = new PublicKey(solanaConfig.programId);

      // 1. Build ATA creation instruction(s) — no separate send
      const wagerPrep = await buildWagerInstruction(
        client,
        owner,
        match.bettingTokenMint,
        amount
      );

      // 2. Build join_match instruction
      const [chessMatchPda] = findChessMatchPda(matchId, programId);
      const [matchEscrowPda] = findMatchEscrowPda(matchId, programId);
      const joinIx = await client.program.methods
        .joinMatch(new BN(amount.toString()))
        .accountsPartial({
          chessMatch: chessMatchPda,
          playerTwoSigner: owner,
          playerTokenAccount: wagerPrep.tokenAccount,
          matchEscrowTokenAccount: matchEscrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // 3. Authorize this player's instant-move key (session token and match
      //    registration) in the same transaction, before delegation, so the
      //    clock never runs on a separate approval.
      const fastPlay = await prepareMatchSession(matchId);

      // 4. Build delegate_match instruction
      const rentPayer = getTransactionPayer(client, owner);
      const [bufferChessMatch] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), chessMatchPda.toBuffer()],
        programId
      );
      const [delegationRecordChessMatch] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), chessMatchPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      const [delegationMetadataChessMatch] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      const delegateIx = await client.program.methods
        .delegateMatch()
        .accountsStrict({
          payer: rentPayer,
          player: owner,
          bufferChessMatch,
          delegationRecordChessMatch,
          delegationMetadataChessMatch,
          chessMatch: chessMatchPda,
          ownerProgram: programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // 5. Bundle everything into a single transaction and send once
      await runTransaction(
        async () => {
          const provider = client.program.provider as unknown as {
            connection: Connection;
            sendAndConfirm(tx: Transaction, signers?: Keypair[]): Promise<string>;
          };

          const transaction = new Transaction();
          for (const ix of wagerPrep.instructions) {
            transaction.add(ix);
          }
          transaction.add(joinIx);
          transaction.add(...fastPlay.instructions);
          transaction.add(delegateIx);

          const signature = await provider.sendAndConfirm(transaction, fastPlay.signers);
          fastPlay.save();

          void syncPlayerJoined({ matchId, signature });

          // Wait for the delegation to propagate so the ER is game-ready
          await waitForDelegation(
            provider.connection,
            chessMatchPda,
            programId,
            solanaConfig.routerEndpoint
          );

          return { signature };
        },
        "You joined the match"
      );
    } catch {
      // TransactionStatus handles error display.
      // The single-transaction design means there is no partial state
      // to clean up — either everything lands or nothing does.
    } finally {
      await refetch();
    }
  };

  const handleCopyInvite = async () => {
    if (await copyToClipboard(absoluteUrl(playHref(matchId)))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } else {
      toast.error("Couldn't copy the invite link.");
    }
  };

  const handleAbort = async () => {
    if (!match || !wallet || !isWaiting || walletAddress !== whiteAddress) return;
    if (!window.confirm("Cancel this match and refund your wager?")) return;
    try {
      const owner = new PublicKey(wallet.address);
      // Recreate the refund ATA idempotently in case it was closed since.
      const prep = await buildWagerInstruction(client, owner, match.bettingTokenMint, 0n);
      await runTransaction(
        () =>
          client.abortMatch(matchId, prep.tokenAccount, {
            preInstructions: prep.instructions,
          }),
        "Match cancelled and wager refunded"
      );
    } catch {
      // TransactionStatus contains the actionable error.
    }
  };

  const handleEnableFastPlay = async () => {
    try {
      await enableFastPlay(matchId);
      await refetch();
      toast.success("Instant moves enabled");
    } catch (cause) {
      toast.error("Could not enable instant moves", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const handleDelegate = async () => {
    if (!wallet) return;
    try {
      const player = new PublicKey(wallet.address);
      await runTransaction(
        () =>
          client.delegateMatch(
            matchId,
            getTransactionPayer(client, player)
          ),
        "Fast on-chain play is ready"
      );
    } catch {
      // TransactionStatus contains the actionable error.
    }
  };

  const submitLegalMove = async (
    source: Square,
    target: Square,
    promotion?: PromotionPiece
  ) => {
    if (!displayFen || !canMove) return;
    const chess = new Chess(displayFen);
    const move = chess.move({ from: source, to: target, promotion });
    if (!move) return;

    setOptimisticFen(chess.fen());
    setOptimisticMove(move);
    setOptimisticBase(confirmedMoves.length);
    resetTransaction();
    setTxStatus("submitting");
    try {
      const submission = await submitMove(matchId, source, target, promotion);
      void syncMoveMade({
        matchId,
        signature: submission.signature,
        runtimeEndpoint: submission.rpcEndpoint,
      });
      setTxSignature(submission.signature);
      setTxExplorerHref(
        magicBlockTxUrl(submission.signature, submission.rpcEndpoint)
      );
      setTxStatus("confirming");
      await Promise.all([refetch(), loadHistory()]);
      setTxStatus("success");
      sounds.playMoveSound(move.san);
    } catch (moveError) {
      const message =
        moveError instanceof Error ? moveError.message : "Move was rejected.";
      setOptimisticFen(null);
      setOptimisticMove(null);
      setTxError(message);
      setTxStatus("error");
      toast.error("Move was not accepted", { description: message });
    }
  };

  const handlePieceDrop = (source: Square, target: Square): boolean => {
    if (!displayFen || !canMove) return false;
    const chess = new Chess(displayFen);
    const piece = chess.get(source);
    if (
      piece?.type === "p" &&
      ((piece.color === "w" && target[1] === "8") ||
        (piece.color === "b" && target[1] === "1"))
    ) {
      const canPromote = chess
        .moves({ square: source, verbose: true })
        .some((move) => move.to === target && move.promotion);
      if (canPromote) setPendingPromotion({ from: source, to: target });
      return false;
    }

    try {
      const legal = chess.move({ from: source, to: target });
      if (!legal) return false;
      void submitLegalMove(source, target);
      return true;
    } catch {
      return false;
    }
  };

  const handleResign = async () => {
    if (!isParticipant || !isActive) return;
    if (!window.confirm("Resign this on-chain match? This cannot be undone.")) {
      return;
    }
    try {
      await runTransaction(() => client.resign(matchId), "Resignation confirmed");
    } catch {
      // TransactionStatus contains the actionable error.
    }
  };

  const handleClaimTimeout = async () => {
    try {
      await runTransaction(
        () => client.claimTimeout(matchId),
        "Timeout win confirmed"
      );
    } catch {
      // TransactionStatus contains the actionable error.
    }
  };

  const handleFinalize = async () => {
    if (!match || !wallet || !isFinished || match.payoutProcessed) return;
    try {
      let baseMatch: ChessMatch | null = match;
      if (match.isDelegated) {
        await runTransaction(
          () => client.undelegateMatch(matchId),
          "Final state committed to Solana"
        );

        baseMatch = null;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          baseMatch = await client.getMatch(matchId);
          if (baseMatch && !baseMatch.isDelegated) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
      if (!baseMatch || baseMatch.isDelegated) {
        throw new Error(
          "The final state is still settling. Refresh shortly to process the payout."
        );
      }

      const payer = new PublicKey(wallet.address);
      if (!payer.equals(baseMatch.players[0]) && !payer.equals(baseMatch.players[1])) {
        throw new Error("Only a match player can finalize this game.");
      }
      // Payout ATAs ride in the settlement transaction: one approval, and
      // escrow rent returns to whoever funded it.
      const settlement = buildSettlementInstructions(
        client,
        payer,
        baseMatch.bettingTokenMint,
        [baseMatch.players[0], baseMatch.players[1], baseMatch.platformFeeWallet]
      );
      const [playerOneAta, playerTwoAta, platformFeeAta] = settlement.accounts;
      await runTransaction(
        () =>
          client.settleMatch(matchId, playerOneAta, playerTwoAta, platformFeeAta, {
            preInstructions: settlement.instructions,
            rentRecipient: settlement.rentRecipient,
          }),
        "Payout settled on Solana"
      );
    } catch {
      await refetch();
    }
  };

  // ── Debug hooks for cross-browser automated play ──
  useEffect(() => {
    const debug: Record<string, unknown> = {
      getState: () => ({
        matchId,
        fen: authoritativeFen,
        currentTurn: match?.currentTurn,
        isMyTurn,
        isActive,
        isDelegated: match?.isDelegated,
        gameStatus: match?.gameStatus,
        playerColor,
        canMove,
        sessionStatus,
        txStatus,
      }),
      makeMove: (from: string, to: string, promotion?: PromotionPiece) => {
        if (!canMove) return { ok: false, error: "Cannot move now" };
        submitLegalMove(from as Square, to as Square, promotion).catch(() => {});
        return { ok: true, from, to };
      },
      enableSession: () => {
        enableFastPlay(matchId)
          .then(() => toast.success("Session enabled"))
          .catch((e: unknown) => toast.error("Session failed", { description: String(e) }));
      },
      refresh: () => { void Promise.allSettled([refetch(), loadHistory()]); },
      getFen: () => authoritativeFen,
      getMoves: () => moves,
    };
    (window as unknown as Record<string, unknown>).__magicChess = debug;
    return () => { delete (window as unknown as Record<string, unknown>).__magicChess; };
  }, [matchId, authoritativeFen, match, isMyTurn, isActive, canMove, playerColor, sessionStatus, txStatus, moves, submitLegalMove, enableFastPlay, refetch, loadHistory]);

  return (
    <AuthGate>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Arena
            </Link>
            <button
              type="button"
              onClick={() => void Promise.allSettled([refetch(), loadHistory()])}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {loading && !match ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]" aria-label="Loading match">
              <div className="mx-auto h-[min(560px,calc(100vw-2rem))] w-full max-w-[560px] animate-pulse rounded-xl bg-card" />
              <div className="h-64 animate-pulse rounded-xl bg-card" />
            </div>
          ) : !match ? (
            <div className="glass-card mx-auto max-w-xl p-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <h1 className="font-heading text-lg font-semibold">Match unavailable</h1>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {!matchId
                  ? "No match was selected."
                  : error?.message ||
                    "No on-chain match was found for this ID yet. A new match can take a few seconds to appear; this page keeps checking."}
              </p>
              <Link
                href="/arena"
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to the arena
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <section className="flex flex-col items-center gap-3" aria-label="Chess board">
                <PlayerRow
                  address={orientation === "white" ? blackAddress : whiteAddress}
                  color={orientation === "white" ? "Black" : "White"}
                  active={
                    isActive &&
                    match.currentTurn ===
                      (orientation === "white" ? "black" : "white")
                  }
                  connectedAddress={walletAddress}
                  online={
                    orientation === "white"
                      ? realtime.presence?.black.online
                      : realtime.presence?.white.online
                  }
                />

                {isActive && isParticipant ? (
                  <p
                    aria-live="polite"
                    className={cn(
                      "w-full max-w-[560px] rounded-lg px-3 py-2 text-center text-sm font-medium",
                      isMyTurn ? "bg-primary/15 text-primary" : "bg-card/60 text-muted-foreground"
                    )}
                  >
                    {isBusy && txStatus === "submitting"
                      ? "Sending your move…"
                      : isMyTurn
                        ? "Your move"
                        : "Waiting for your opponent…"}
                  </p>
                ) : null}

                <div className="relative">
                  {displayFen ? (
                    <ChessBoard
                      fen={displayFen}
                      orientation={orientation}
                      boardWidth={boardWidth}
                      arePiecesDraggable={canMove}
                      onPieceDrop={handlePieceDrop}
                      lastMove={lastMove}
                    />
                  ) : (
                    <div className="glass-card flex h-80 w-[min(560px,calc(100vw-2rem))] items-center justify-center text-sm text-destructive">
                      The on-chain board could not be decoded.
                    </div>
                  )}
                  <PromotionDialog
                    isOpen={pendingPromotion !== null}
                    color={playerColor ?? "white"}
                    onSelect={(piece) => {
                      if (pendingPromotion) {
                        void submitLegalMove(
                          pendingPromotion.from,
                          pendingPromotion.to,
                          piece
                        );
                      }
                      setPendingPromotion(null);
                    }}
                    className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                </div>

                <PlayerRow
                  address={orientation === "white" ? whiteAddress : blackAddress}
                  color={orientation === "white" ? "White" : "Black"}
                  active={
                    isActive &&
                    match.currentTurn ===
                      (orientation === "white" ? "white" : "black")
                  }
                  connectedAddress={walletAddress}
                />

                <BoardControls
                  onFlipBoard={() =>
                    setOrientation((current) =>
                      current === "white" ? "black" : "white"
                    )
                  }
                  onResign={handleResign}
                  canResign={isParticipant && isActive && !isBusy}
                />
              </section>

              <aside className="flex min-h-0 flex-col gap-4">
                <section className="glass-card p-4" aria-labelledby="match-heading">
                  <div className="flex items-center justify-between gap-3">
                    <h1 id="match-heading" className="truncate font-heading text-sm font-semibold">
                      #{match.matchId}
                    </h1>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {statusLabel(match.gameStatus)}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Wager</dt>
                      <dd className="font-mono font-medium">
                        {formatTokenAmount(match.betAmountPlayerOne)} {solanaConfig.wagerSymbol}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Total pot</dt>
                      <dd className="font-mono font-medium">
                        {formatTokenAmount(match.totalPot)} {solanaConfig.wagerSymbol}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Move timer
                      </dt>
                      <dd className={cn(
                        "font-mono font-bold tabular-nums",
                        remainingMilliseconds !== null && formatRemaining(remainingMilliseconds).isLow && "animate-pulse text-red-400"
                      )}>
                        {remainingMilliseconds !== null
                          ? formatRemaining(remainingMilliseconds).text
                          : timeoutMilliseconds > 0
                            ? `${timeoutMilliseconds / 1_000}s / move`
                            : "No timer"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Runtime</dt>
                      <dd className="inline-flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {match.isDelegated ? "MagicBlock ER" : "Solana base"}
                      </dd>
                    </div>
                  </dl>

                  {isWaiting && walletAddress !== whiteAddress ? (
                    <button
                      type="button"
                      onClick={() => void handleJoin()}
                      disabled={isBusy}
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      {match.betAmountPlayerOne === 0n
                        ? "Join free match"
                        : `Join for ${formatTokenAmount(match.betAmountPlayerOne)} ${solanaConfig.wagerSymbol}`}
                    </button>
                  ) : null}

                  {isWaiting && walletAddress === whiteAddress ? (
                    <div className="mt-5 space-y-3">
                      <p className="rounded-lg border border-border bg-card/50 p-3 text-sm text-muted-foreground">
                        Your match is open. Send the invite link to an opponent — this page
                        updates the moment they join.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCopyInvite()}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Invite link copied" : "Copy invite link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAbort()}
                        disabled={isBusy}
                        className="min-h-10 w-full rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                      >
                        Cancel match and refund
                      </button>
                    </div>
                  ) : null}

                  {isActive && isParticipant && !match.isDelegated ? (
                    <button
                      type="button"
                      onClick={() => void handleDelegate()}
                      disabled={isBusy}
                      className="mt-5 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      Enable fast play
                    </button>
                  ) : null}

                  {isActive && isParticipant && match.isDelegated ? (
                    fastPlayReady ? (
                      <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                        Instant moves on — no wallet popups
                      </p>
                    ) : (
                      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-foreground">
                          {sessionStatus === "authorizing" ? "Setting up instant moves…" : "Enable instant moves"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Approve once: a temporary key that can only move your pieces in this game
                          signs each move, so there&apos;s no popup per move.
                        </p>
                        {sessionError ? (
                          <p className="mt-2 text-xs text-destructive">{sessionError}</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleEnableFastPlay()}
                          disabled={sessionStatus === "authorizing" || isBusy}
                          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary/40 px-3 text-xs font-semibold text-primary disabled:opacity-60"
                        >
                          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                          {sessionStatus === "authorizing" ? "Approve in wallet…" : "Enable with one approval"}
                        </button>
                      </div>
                    )
                  ) : null}

                  {canClaimTimeout ? (
                    <button
                      type="button"
                      onClick={() => void handleClaimTimeout()}
                      className="mt-3 min-h-11 w-full rounded-lg border border-primary/40 px-4 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Claim timeout win
                    </button>
                  ) : null}

                  {isFinished && isParticipant && !match.payoutProcessed ? (
                    <button
                      type="button"
                      onClick={() => void handleFinalize()}
                      disabled={isBusy}
                      className="mt-5 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      {match.isDelegated ? "Finalize and settle payout" : "Settle payout"}
                    </button>
                  ) : null}

                  {isFinished && !isParticipant && !match.payoutProcessed ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                      A match player must submit the final payout settlement.
                    </p>
                  ) : null}

                  {match.payoutProcessed ? (
                    <div className="mt-4 space-y-2">
                      <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                        Payout settled on Solana.
                      </p>
                      <Link
                        href="/arena"
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Sword className="h-4 w-4" aria-hidden="true" />
                        New match
                      </Link>
                    </div>
                  ) : null}

                  {!isParticipant && !isWaiting ? (
                    <Link
                      href={spectateHref(matchId)}
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Open spectator mode
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </section>

                <PredictionPanel
                  matchId={matchId}
                  fen={authoritativeFen}
                  pliesPlayed={pliesPlayed(match)}
                  isActive={isActive}
                  isFinished={isFinished}
                  playerColor={playerColor}
                  liveMarket={realtime.predictionMarket}
                  liveSettled={realtime.predictionSettled}
                />

                <TransactionStatus
                  status={txStatus}
                  signature={txSignature}
                  explorerHref={txExplorerHref}
                  error={txError}
                  onDismiss={resetTransaction}
                />

                <MoveList
                  moves={moves}
                  fen={displayFen ?? undefined}
                  currentMoveIndex={moves.length - 1}
                  result={
                    match?.gameStatus === GameStatus.WhiteWins ? "1-0"
                    : match?.gameStatus === GameStatus.BlackWins ? "0-1"
                    : match?.gameStatus === GameStatus.Draw ? "1/2-1/2"
                    : undefined
                  }
                  className="min-h-56"
                />
                {(historyUnavailable && !chainMoves) || moveListBehind ? (
                  <p className="text-xs text-muted-foreground">
                    Move list is catching up. The board always comes straight from the on-chain match.
                  </p>
                ) : null}
              </aside>
            </div>
          )}
        </main>
      </div>
    </AuthGate>
  );
}
