"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Chess, type Move as ChessMove, type Square } from "chess.js";
import { PublicKey } from "@solana/web3.js";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import {
  boardToFen,
  GameStatus,
  type ChessMatch,
  type Piece,
} from "@magic-chess/sdk";
import { useMagicChessClient, useMatch } from "@magic-chess/sdk/react";
import { toast } from "sonner";
import { WalletButton } from "@/components/shared/WalletButton";
import { TransactionStatus } from "@/components/shared/TransactionStatus";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { BoardControls } from "@/components/chess/BoardControls";
import { api, type ApiMatchHistory } from "@/lib/api";
import { shortenAddress } from "@/lib/chess";
import { sounds } from "@/lib/sounds";
import { getPlatformFeeWallet, solanaConfig } from "@/lib/solana-config";
import {
  prepareSettlementAccounts,
  prepareWagerAccount,
} from "@/lib/wager";
import { useMagicBlock } from "@/hooks/useMagicBlock";
import {
  formatOnChainTokenAmount,
  useMintDetails,
} from "@/hooks/useMintDetails";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { cn } from "@/lib/utils";

interface PlayPageProps {
  params: Promise<{ matchId: string }>;
}

type TxStatus = "idle" | "submitting" | "confirming" | "success" | "error";
type PromotionPiece = "q" | "r" | "b" | "n";

const EMPTY_PUBLIC_KEY = PublicKey.default.toBase58();

function normalizeBoardPiece(piece: Piece | null): {
  pieceType: "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";
  color: "White" | "Black";
} | null {
  if (!piece) return null;
  const names = {
    pawn: "Pawn",
    knight: "Knight",
    bishop: "Bishop",
    rook: "Rook",
    queen: "Queen",
    king: "King",
  } as const;
  return {
    pieceType: names[piece.pieceType],
    color: piece.color === "white" ? "White" : "Black",
  };
}

function matchToFen(match: ChessMatch): string {
  return boardToFen(
    match.board.map((row) => row.map(normalizeBoardPiece)),
    match.currentTurn,
    match.castlingRights,
    match.enPassantTarget,
    match.halfmoveClock,
    match.fullmoveNumber
  );
}

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

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function PlayerRow({
  address,
  color,
  active,
  connectedAddress,
  clock,
  urgent = false,
  online,
}: {
  address: string | null;
  color: "White" | "Black";
  active: boolean;
  connectedAddress?: string;
  clock?: string | null;
  urgent?: boolean;
  online?: boolean | null;
}) {
  const isYou = Boolean(address && connectedAddress === address);
  return (
    <div
      className={cn(
        "flex min-h-12 w-full max-w-[560px] items-center justify-between gap-3 rounded-lg border px-3 py-2",
        active ? "border-primary/40 bg-primary/10" : "border-border bg-card/40"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {color}{isYou ? " · You" : ""}
            {online !== undefined && online !== null ? (
              <span className={online ? "text-primary" : "text-muted-foreground"}>
                {online ? " · Online" : " · Offline"}
              </span>
            ) : null}
          </p>
          <p className="truncate font-mono text-sm font-semibold" title={address ?? undefined}>
            {address ? shortenAddress(address, 6) : "Waiting for opponent"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {active ? (
          <span className="hidden rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary sm:inline">
            To move
          </span>
        ) : null}
        {clock ? (
          <span
            className={cn(
              "min-w-20 rounded-md bg-background px-3 py-1.5 text-right font-mono text-lg font-semibold tabular-nums",
              urgent && "bg-destructive/15 text-destructive"
            )}
            aria-label={`${color} move clock ${clock}`}
          >
            {clock}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PlayPage({ params }: PlayPageProps) {
  const { matchId } = use(params);
  const client = useMagicChessClient();
  const { match, loading, error, refetch } = useMatch(matchId);
  const { authenticated, login } = usePrivy();
  const { wallets, createWallet } = useSolanaWallets();
  const wallet = wallets[0];
  const { submitMove } = useMagicBlock();
  const realtime = useMatchRealtime({
    matchId,
    walletAddress: wallet?.address,
    signMessage: wallet
      ? (message) => wallet.signMessage(message)
      : undefined,
  });

  const [history, setHistory] = useState<ApiMatchHistory | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [boardWidth, setBoardWidth] = useState(320);
  const [now, setNow] = useState(() => Date.now());
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [optimisticMove, setOptimisticMove] = useState<ChessMove | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txSignature, setTxSignature] = useState<string>();
  const [txError, setTxError] = useState<string>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const previousStatusRef = useRef<GameStatus | null>(null);
  const previousTurnRef = useRef<"white" | "black" | null>(null);
  const previousMoveCountRef = useRef<number | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.getMatchHistory(matchId));
      setHistoryUnavailable(false);
    } catch {
      setHistoryUnavailable(true);
    }
  }, [matchId]);

  useEffect(() => {
    void loadHistory();
    let polling = false;
    const intervalMs = realtime.status === "live" ? 30_000 : 3_000;
    const intervalId = window.setInterval(() => {
      if (polling) return;
      polling = true;
      void Promise.allSettled([refetch(), loadHistory()]).finally(() => {
        polling = false;
      });
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [loadHistory, realtime.status, refetch]);

  useEffect(() => {
    if (realtime.refreshSequence === 0) return;
    void Promise.allSettled([refetch(), loadHistory()]);
  }, [loadHistory, realtime.refreshSequence, refetch]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const resize = () =>
      setBoardWidth(Math.min(560, Math.max(280, window.innerWidth - 32)));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => sounds.bindUnlock(), []);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    setNotificationsEnabled(
      window.localStorage.getItem("magic-chess:match-notifications") === "true" &&
        "Notification" in window &&
        Notification.permission === "granted"
    );
  }, []);

  const notify = useCallback(
    (title: string, body: string) => {
      setAnnouncement(`${title}. ${body}`);
      if (
        !notificationsEnabled ||
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        document.visibilityState === "visible"
      ) {
        return;
      }
      new Notification(title, { body, tag: `magic-chess:${matchId}` });
    },
    [matchId, notificationsEnabled]
  );

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      window.localStorage.setItem("magic-chess:match-notifications", "false");
      toast.success("Match notifications off");
      return;
    }
    if (!("Notification" in window)) {
      toast.error("This browser does not support notifications.");
      return;
    }
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      toast.error("Notifications are blocked", {
        description: "Allow notifications in your browser settings to receive turn alerts.",
      });
      return;
    }
    setNotificationsEnabled(true);
    window.localStorage.setItem("magic-chess:match-notifications", "true");
    toast.success("Turn notifications on");
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/play/${encodeURIComponent(matchId)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Magic Chess match",
          text: "Join or watch this on-chain chess match.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1_500);
        toast.success("Match link copied");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      toast.error("Could not share the match link");
    }
  };

  const handleVerifyPresence = async () => {
    try {
      await realtime.verifyPlayerPresence();
      toast.success("Player presence verified", {
        description: "Your side now appears online to the opponent and spectators.",
      });
    } catch (verificationError) {
      const message =
        verificationError instanceof Error
          ? verificationError.message
          : "Could not verify player presence.";
      if (/reject|declin|cancel/i.test(message)) return;
      toast.error("Presence verification failed", { description: message });
    }
  };

  const authoritativeFen = useMemo(() => {
    if (!match) return null;
    try {
      return matchToFen(match);
    } catch {
      return null;
    }
  }, [match]);

  const mintAddress = match?.bettingTokenMint.toBase58() ?? "";
  const mintDetails = useMintDetails(mintAddress ? [mintAddress] : []);
  const wagerMint = mintDetails.get(mintAddress);

  useEffect(() => {
    setOptimisticFen(null);
    setOptimisticMove(null);
  }, [authoritativeFen]);

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
    isOnline && isActive && match?.isDelegated && isMyTurn && !isBusy && displayFen
  );

  useEffect(() => {
    if (playerColor) setOrientation(playerColor);
  }, [playerColor]);

  const timeoutMilliseconds = match
    ? Number(match.moveTimeoutDuration) * 1_000
    : 0;
  const localRemainingMilliseconds =
    match && isActive && timeoutMilliseconds > 0
      ? Math.max(
          0,
          timeoutMilliseconds -
            (now - Number(match.lastMoveTimestamp) * 1_000)
        )
      : null;
  const realtimeClock = realtime.clock;
  const remainingMilliseconds =
    realtime.status === "live" &&
    realtimeClock !== null &&
    realtimeClock.activeColor === match?.currentTurn &&
    realtimeClock.remainingMs !== null
      ? realtimeClock.remainingMs
      : localRemainingMilliseconds;
  const canClaimTimeout = Boolean(
      isParticipant &&
      isOnline &&
      isActive &&
      !isMyTurn &&
      remainingMilliseconds === 0 &&
      !isBusy
  );

  useEffect(() => {
    if (!match) return;
    const previousStatus = previousStatusRef.current;
    const previousTurn = previousTurnRef.current;

    if (
      previousStatus === GameStatus.WaitingForOpponent &&
      match.gameStatus === GameStatus.Active
    ) {
      sounds.play("game_start");
      toast.success("Opponent joined. The game is live.");
      notify("Opponent joined", "Your Magic Chess match is ready.");
    } else if (
      previousStatus === GameStatus.Active &&
      match.gameStatus !== GameStatus.Active
    ) {
      sounds.play("game_end");
      notify("Game finished", statusLabel(match.gameStatus));
    } else if (
      match.gameStatus === GameStatus.Active &&
      previousTurn !== null &&
      previousTurn !== match.currentTurn &&
      isMyTurn
    ) {
      notify("Your turn", `Move in match ${matchId}.`);
    }

    previousStatusRef.current = match.gameStatus;
    previousTurnRef.current = match.currentTurn;
  }, [isMyTurn, match, matchId, notify]);

  useEffect(() => {
    if (!history) return;
    const moveCount = history.totalMoves;
    const previousMoveCount = previousMoveCountRef.current;
    if (previousMoveCount !== null && moveCount > previousMoveCount) {
      const latestMove = history.moves.at(-1);
      if (latestMove && latestMove.playerPubkey !== walletAddress) {
        sounds.playMoveSound(latestMove.algebraicMove);
      }
    }
    previousMoveCountRef.current = moveCount;
  }, [history, walletAddress]);

  useEffect(() => {
    const originalTitle = document.title;
    if (isMyTurn) document.title = `Your turn · ${matchId} · Magic Chess`;
    else if (isActive) document.title = `Live · ${matchId} · Magic Chess`;
    else document.title = `${matchId} · Magic Chess`;
    return () => {
      document.title = originalTitle;
    };
  }, [isActive, isMyTurn, matchId]);

  const historyMoves = history?.moves.map((move) => move.algebraicMove) ?? [];
  const moves = optimisticMove
    ? [...historyMoves, optimisticMove.san]
    : historyMoves;
  const lastHistoryMove = history?.moves.at(-1);
  const lastMove = optimisticMove
    ? { from: optimisticMove.from, to: optimisticMove.to }
    : lastHistoryMove &&
        isSquare(lastHistoryMove.from) &&
        isSquare(lastHistoryMove.to)
      ? { from: lastHistoryMove.from, to: lastHistoryMove.to }
      : null;

  const resetTransaction = () => {
    setTxStatus("idle");
    setTxSignature(undefined);
    setTxError(undefined);
  };

  const runTransaction = async (
    action: () => Promise<{ signature: string }>,
    successMessage: string
  ) => {
    resetTransaction();
    setTxStatus("submitting");
    try {
      const result = await action();
      setTxStatus("confirming");
      setTxSignature(result.signature);
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
    if (!match || !isWaiting) return;
    if (!authenticated) {
      login();
      return;
    }
    if (!wallet) {
      try {
        await createWallet();
        toast.success("Wallet ready", {
          description: "Review the match and join when your wallet appears.",
        });
      } catch {
        toast.error("Could not create your Solana wallet. Try again.");
      }
      return;
    }
    let joined = false;
    try {
      const expectedMint = new PublicKey(solanaConfig.wagerMint);
      const expectedFeeWallet = getPlatformFeeWallet();
      if (
        !match.bettingTokenMint.equals(expectedMint) ||
        !match.platformFeeWallet.equals(expectedFeeWallet) ||
        match.platformFeeBasisPoints !== solanaConfig.platformFeeBps
      ) {
        throw new Error(
          "This match does not use the deployment's approved wager and fee policy."
        );
      }

      const owner = new PublicKey(wallet.address);
      const amount = match.betAmountPlayerOne;
      const playerTokenAccount = await prepareWagerAccount(
        client,
        owner,
        match.bettingTokenMint,
        amount
      );
      await runTransaction(
        () =>
          client.joinMatch({
            matchId,
            betAmount: amount,
            playerTokenAccount,
          }),
        "You joined the match"
      );
      joined = true;
      await runTransaction(
        () => client.delegateMatch(matchId),
        "Fast on-chain play is ready"
      );
    } catch {
      if (joined) {
        toast.info(
          "The match is joined. Use “Enable fast play” to retry delegation."
        );
      }
    } finally {
      await refetch();
    }
  };

  const handleDelegate = async () => {
    try {
      await runTransaction(
        () => client.delegateMatch(matchId),
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
    resetTransaction();
    setTxStatus("submitting");
    try {
      const signature = await submitMove(matchId, source, target, promotion);
      setTxSignature(signature);
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
      const [playerOneAta, playerTwoAta, platformFeeAta] =
        await prepareSettlementAccounts(
          client,
          payer,
          baseMatch.bettingTokenMint,
          [
            baseMatch.players[0],
            baseMatch.players[1],
            baseMatch.platformFeeWallet,
          ]
        );
      await runTransaction(
        () =>
          client.settleMatch(
            matchId,
            playerOneAta,
            playerTwoAta,
            platformFeeAta
          ),
        "Payout settled on Solana"
      );
    } catch {
      await refetch();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Arena
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary sm:px-3"
                aria-label="Share match link"
              >
                {shareCopied ? (
                  <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">Share</span>
              </button>
              <button
                type="button"
                onClick={() => void toggleNotifications()}
                className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary sm:px-3"
                aria-label={notificationsEnabled ? "Turn match notifications off" : "Turn match notifications on"}
                aria-pressed={notificationsEnabled}
              >
                {notificationsEnabled ? (
                  <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <BellOff className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden md:inline">Notify</span>
              </button>
              <button
                type="button"
                onClick={() => void Promise.allSettled([refetch(), loadHistory()])}
                disabled={loading}
                className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 sm:px-3"
                aria-label="Refresh match"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")}
                  aria-hidden="true"
                />
                <span className="hidden lg:inline">Refresh</span>
              </button>
              <WalletButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {!isOnline ? (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              You&apos;re offline. The board is read-only until the connection returns.
            </div>
          ) : error && match ? (
            <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-muted-foreground">
              <span>Live sync paused. The last confirmed board is still shown.</span>
              <button type="button" onClick={() => void refetch()} className="min-h-10 shrink-0 rounded-md px-3 font-medium text-primary focus-visible:ring-2 focus-visible:ring-primary">
                Retry
              </button>
            </div>
          ) : null}
          {loading && !match ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]" aria-label="Loading match" aria-busy="true">
              <div className="mx-auto h-[min(560px,calc(100vw-2rem))] w-full max-w-[560px] animate-pulse rounded-xl bg-card motion-reduce:animate-none" />
              <div className="h-64 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />
            </div>
          ) : !match ? (
            <div className="glass-card mx-auto max-w-xl p-6" role="alert">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <h1 className="font-heading text-lg font-semibold">Match unavailable</h1>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {error?.message || "No on-chain match was found for this identifier."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => void refetch()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </button>
                <Link href="/arena" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary">
                  Return to lobby
                </Link>
              </div>
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
                  clock={
                    isActive &&
                    match.currentTurn ===
                      (orientation === "white" ? "black" : "white") &&
                    remainingMilliseconds !== null
                      ? formatRemaining(remainingMilliseconds)
                      : null
                  }
                  urgent={Boolean(
                    remainingMilliseconds !== null && remainingMilliseconds <= 10_000
                  )}
                  online={
                    realtime.presence
                      ? orientation === "white"
                        ? realtime.presence.black.online
                        : realtime.presence.white.online
                      : null
                  }
                />

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
                    onCancel={() => setPendingPromotion(null)}
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
                  clock={
                    isActive &&
                    match.currentTurn ===
                      (orientation === "white" ? "white" : "black") &&
                    remainingMilliseconds !== null
                      ? formatRemaining(remainingMilliseconds)
                      : null
                  }
                  urgent={Boolean(
                    remainingMilliseconds !== null && remainingMilliseconds <= 10_000
                  )}
                  online={
                    realtime.presence
                      ? orientation === "white"
                        ? realtime.presence.white.online
                        : realtime.presence.black.online
                      : null
                  }
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
                  {!isParticipant ? (
                    <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      You&apos;re watching on the same live match link.
                    </p>
                  ) : null}
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Wager</dt>
                      <dd className="font-mono font-medium tabular-nums">
                        {formatOnChainTokenAmount(match.betAmountPlayerOne, wagerMint)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Total pot</dt>
                      <dd className="font-mono font-medium tabular-nums">
                        {formatOnChainTokenAmount(match.totalPot, wagerMint)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Wager mint</dt>
                      <dd className="max-w-44 text-right">
                        <span className="block truncate font-mono text-xs" title={mintAddress}>
                          {mintAddress.slice(0, 6)}...{mintAddress.slice(-6)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {wagerMint?.loading
                            ? "Checking decimals…"
                            : wagerMint?.verifiedOnChain
                              ? `${wagerMint.decimals} decimals · RPC verified`
                              : "Configured display fallback"}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Current move
                      </dt>
                      <dd className="font-mono font-medium tabular-nums">
                        {remainingMilliseconds !== null
                          ? formatRemaining(remainingMilliseconds)
                          : timeoutMilliseconds > 0
                            ? `${timeoutMilliseconds / 1_000}s / move`
                            : "No timer"}
                      </dd>
                    </div>
                    {timeoutMilliseconds > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Clock rule</dt>
                        <dd className="font-mono text-xs tabular-nums">
                          {formatRemaining(timeoutMilliseconds)} resets each move
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Runtime</dt>
                      <dd className="inline-flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {match.isDelegated ? "MagicBlock ER" : "Solana base"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Live sync</dt>
                      <dd className="inline-flex items-center gap-1.5 font-medium">
                        {realtime.status === "live" ? (
                          <Wifi className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                        {realtime.status === "live"
                          ? "Connected"
                          : realtime.status === "reconnecting"
                            ? "Reconnecting"
                            : realtime.status === "connecting"
                              ? "Connecting"
                              : "Polling fallback"}
                      </dd>
                    </div>
                    {realtime.presence ? (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Watching</dt>
                        <dd className="font-mono text-xs tabular-nums">
                          {realtime.presence.spectators} spectator{realtime.presence.spectators === 1 ? "" : "s"}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {isParticipant && realtime.role === "spectator" && wallet ? (
                    <div className="mt-4 rounded-lg border border-border bg-card/50 p-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Live updates already work. Verify once with your wallet to show your side as online; this signature does not send a transaction.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleVerifyPresence()}
                        disabled={realtime.verifying}
                        aria-busy={realtime.verifying}
                        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary/30 px-3 text-xs font-semibold text-primary transition-colors duration-100 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                      >
                        {realtime.verifying ? (
                          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : null}
                        {realtime.verifying ? "Waiting for signature…" : "Verify player presence"}
                      </button>
                    </div>
                  ) : null}

                  {isWaiting && walletAddress !== whiteAddress ? (
                    <button
                      type="button"
                      onClick={() => void handleJoin()}
                      disabled={isBusy || !isOnline}
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                      {!authenticated
                        ? "Sign in to join"
                        : !wallet
                          ? "Create wallet to join"
                          : `Join for ${formatOnChainTokenAmount(match.betAmountPlayerOne, wagerMint)}`}
                    </button>
                  ) : null}

                  {isWaiting && walletAddress === whiteAddress ? (
                    <p className="mt-5 rounded-lg border border-border bg-card/50 p-3 text-sm text-muted-foreground">
                      Your match is confirmed on Solana. Share this page&apos;s link—your opponent joins here and everyone else can watch here.
                    </p>
                  ) : null}

                  {isActive && isParticipant && !match.isDelegated ? (
                    <button
                      type="button"
                      onClick={() => void handleDelegate()}
                      disabled={isBusy || !isOnline}
                      className="mt-5 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    >
                      Enable fast play
                    </button>
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
                      disabled={isBusy || !isOnline}
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
                    <p className="mt-4 rounded-lg bg-primary/10 p-3 text-sm text-primary">
                      Payout settled on Solana.
                    </p>
                  ) : null}

                  {!isParticipant && !isWaiting ? (
                    <p className="mt-5 rounded-lg border border-border bg-card/50 p-3 text-sm text-muted-foreground">
                      Spectator mode is read-only and refreshes from the same authoritative match account.
                    </p>
                  ) : null}
                </section>

                <TransactionStatus
                  status={txStatus}
                  signature={txSignature}
                  error={txError}
                  onDismiss={resetTransaction}
                />

                <MoveList
                  moves={moves}
                  fen={displayFen ?? undefined}
                  currentMoveIndex={moves.length - 1}
                  className="min-h-56"
                />
                {historyUnavailable ? (
                  <p className="text-xs text-muted-foreground">
                    Move notation is unavailable because the read-only indexer is not configured. The board still comes directly from the authoritative on-chain account.
                  </p>
                ) : null}
              </aside>
            </div>
          )}
      </main>
    </div>
  );
}
