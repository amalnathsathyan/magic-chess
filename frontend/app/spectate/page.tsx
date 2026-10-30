"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  Link2,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import type { Square } from "chess.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { GameStatus } from "@magic-chess/sdk";
import { useMatch } from "@magic-chess/sdk/react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { PlayerRow } from "@/components/chess/PlayerRow";
import { PredictionPanel } from "@/components/predictions/PredictionPanel";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { useMoveTransactionNotifications } from "@/hooks/useMoveTransactionNotifications";
import { api, type ApiMatchHistory } from "@/lib/api";
import { useOnChainMoves } from "@/hooks/useOnChainMoves";
import { useMoveLog } from "@/hooks/useMoveLog";
import { copyToClipboard } from "@/lib/clipboard";
import { absoluteUrl, playHref, spectateHref } from "@/lib/match-links";
import { formatRemaining, isSquare, matchToFen, pliesPlayed } from "@/lib/match-board";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { cn } from "@/lib/utils";
import { fitBoardWidth } from "@/lib/board-size";

const EMPTY_PUBLIC_KEY = "11111111111111111111111111111111";

const STATUS_LABEL: Record<string, string> = {
  waitingForOpponent: "Waiting for opponent",
  active: "In progress",
  whiteWins: "White won",
  blackWins: "Black won",
  draw: "Draw",
  aborted: "Aborted",
};

function formatReason(reason: string | null): string | null {
  if (!reason) return null;
  return reason
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

export default function SpectatePage() {
  return (
    <Suspense fallback={null}>
      <SpectateView />
    </Suspense>
  );
}

function SpectateView() {
  const matchId = useSearchParams().get("id") ?? "";
  const { match, loading, error, refetch } = useMatch(matchId || null);
  const realtime = useMatchRealtime({ matchId });
  const { wallets } = useWallets();
  const viewer = selectSolanaWallet(wallets)?.address;
  const [history, setHistory] = useState<ApiMatchHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [boardWidth, setBoardWidth] = useState(320);
  const [preview, setPreview] = useState<{ from: Square; to: Square } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!matchId) return;
    try {
      setHistory(await api.getMatchHistory(matchId));
      setHistoryError(null);
    } catch {
      setHistoryError("Move history is catching up.");
    }
  }, [matchId]);

  const refreshAll = useCallback(() => {
    void Promise.allSettled([refetch(), loadHistory()]);
  }, [loadHistory, refetch]);

  // Instant ER log subscription, realtime pushes from the indexer, and a slow
  // poll as the safety net.
  useMoveTransactionNotifications({
    matchId,
    enabled: Boolean(match?.isDelegated),
    onMove: refreshAll,
  });
  useEffect(() => {
    if (realtime.refreshSequence > 0) refreshAll();
  }, [realtime.refreshSequence, refreshAll]);
  useEffect(() => {
    void loadHistory();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAll();
    }, realtime.status === "live" ? 10_000 : 3_000);
    return () => window.clearInterval(id);
  }, [loadHistory, realtime.status, refreshAll]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const update = () => setBoardWidth(fitBoardWidth());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const fen = useMemo(() => (match ? matchToFen(match) : null), [match]);
  const chainMoves = useOnChainMoves({
    matchId,
    enabled: Boolean(match?.isDelegated),
    refreshKey: fen,
  });
  // Same rule as the player view: the indexer database or the rollup's own
  // log, whichever lists more moves.
  // Same list as the player view: live board, database and rollup log.
  const historyMoves = useMemo(
    () =>
      history?.moves.map((move) => ({
        san: move.san ?? move.algebraicMove,
        from: move.from as Square,
        to: move.to as Square,
      })) ?? [],
    [history]
  );
  const confirmedMoves = useMoveLog({
    matchId,
    fen,
    sources: [historyMoves, chainMoves],
  });
  const moves = useMemo(() => confirmedMoves.map((move) => move.san), [confirmedMoves]);
  const lastConfirmedMove = confirmedMoves.at(-1);
  const lastMove =
    lastConfirmedMove && isSquare(lastConfirmedMove.from) && isSquare(lastConfirmedMove.to)
      ? { from: lastConfirmedMove.from, to: lastConfirmedMove.to }
      : null;

  const whiteAddress = match?.players[0]?.toBase58() ?? history?.whitePlayer ?? null;
  const rawBlackAddress = match?.players[1]?.toBase58() ?? history?.blackPlayer ?? null;
  const blackAddress = rawBlackAddress === EMPTY_PUBLIC_KEY ? null : rawBlackAddress;
  const isActive = match?.gameStatus === GameStatus.Active;
  const isFinished = Boolean(
    match &&
      match.gameStatus !== GameStatus.Active &&
      match.gameStatus !== GameStatus.WaitingForOpponent
  );
  const viewerColor =
    viewer && viewer === whiteAddress ? "white" : viewer && viewer === blackAddress ? "black" : null;
  const timeoutMs = match ? Number(match.moveTimeoutDuration) * 1_000 : 0;
  const remainingMs =
    isActive && match && timeoutMs > 0
      ? Math.max(
          0,
          // Server-corrected clock, so a skewed device doesn't flag the game early.
          timeoutMs - (now + realtime.serverOffsetMs - Number(match.lastMoveTimestamp) * 1_000)
        )
      : null;
  const remaining = remainingMs !== null ? formatRemaining(remainingMs) : null;
  // On-chain the game stays Active until the waiting side claims the win.
  const timedOut = remainingMs === 0;
  const outOfTime = match?.currentTurn === "black" ? "Black" : "White";
  const claimant = outOfTime === "White" ? "Black" : "White";
  const spectators = realtime.presence?.spectators ?? null;

  const share = async () => {
    if (await copyToClipboard(absoluteUrl(spectateHref(matchId)))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Play
            </Link>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Watching
              {realtime.status === "live" ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  live
                </span>
              ) : null}
            </span>
            {spectators !== null ? (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {spectators}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="btn btn-secondary btn-sm"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Share"}
            </button>
            <button
              type="button"
              onClick={refreshAll}
              aria-label="Refresh"
              className="btn btn-secondary btn-sm w-9 px-0"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            </button>
          </div>
        </div>

      <div>
        {!matchId ? (
          <EmptyState message="No match selected." />
        ) : loading && !match ? (
          <div className="grid gap-8 lg:grid-cols-[auto_360px] lg:justify-center" aria-label="Loading match">
            <div className="mx-auto aspect-square animate-pulse bg-card" style={{ width: boardWidth }} />
            <div className="h-64 animate-pulse bg-card" />
          </div>
        ) : !match ? (
          <EmptyState message={error?.message || "No on-chain match was found for this ID yet."} onRetry={refreshAll} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[auto_360px] lg:justify-center">
            <section className="mx-auto flex flex-col gap-3" style={{ width: boardWidth }} aria-label="Live board">
              <PlayerRow
                address={blackAddress}
                color="Black"
                active={isActive && match.currentTurn === "black"}
                online={realtime.presence?.black.online}
              />
              {fen ? (
                <ChessBoard
                  fen={fen}
                  orientation="white"
                  boardWidth={boardWidth}
                  arePiecesDraggable={false}
                  lastMove={lastMove}
                  customArrows={
                    preview ? [{ from: preview.from, to: preview.to, color: "rgba(251, 191, 36, 0.85)" }] : undefined
                  }
                />
              ) : (
                <div className="panel flex aspect-square w-full items-center justify-center p-6 text-sm text-muted-foreground">
                  Board data unavailable.
                </div>
              )}
              <PlayerRow
                address={whiteAddress}
                color="White"
                active={isActive && match.currentTurn === "white"}
                online={realtime.presence?.white.online}
              />
              {viewerColor ? (
                <Link
                  href={playHref(matchId)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  You&apos;re playing this game. Open your board
                </Link>
              ) : null}
            </section>

            <aside className="flex min-h-0 min-w-0 flex-col gap-4">
              <section className="panel" aria-labelledby="match-status-heading">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <h1
                    id="match-status-heading"
                    className={cn(
                      "section-title",
                      timedOut ? "text-destructive" : isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {timedOut ? "Out of time" : STATUS_LABEL[match.gameStatus] ?? match.gameStatus}
                  </h1>
                  <span className="truncate font-mono text-xs text-muted-foreground" title={matchId}>
                    {matchId}
                  </span>
                </div>
                <dl className="grid grid-cols-3 divide-x divide-border">
                  <div className="px-4 py-3">
                    <dt className="label">Moves</dt>
                    <dd className="mt-1 text-lg font-semibold tnum">{pliesPlayed(match)}</dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="label">To move</dt>
                    <dd className="mt-1 text-lg font-semibold capitalize">{isActive ? match.currentTurn : "—"}</dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="label">Clock</dt>
                    <dd
                      className={cn(
                        "mt-1 text-lg font-semibold tnum",
                        timedOut
                          ? "text-destructive"
                          : remaining?.isLow && "animate-pulse text-primary"
                      )}
                    >
                      {timedOut ? "Out" : remaining ? remaining.text : "—"}
                    </dd>
                  </div>
                </dl>
                {timedOut ? (
                  <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    {viewerColor === claimant.toLowerCase() ? (
                      <>
                        {outOfTime} ran out of time, so you won.{" "}
                        <Link href={playHref(matchId)} className="font-semibold text-primary hover:underline">
                          Claim the win
                        </Link>{" "}
                        to end the game{match.totalPot > 0n ? " and collect the pot" : ""}.
                      </>
                    ) : (
                      <>
                        {outOfTime} ran out of time. The game ends when {claimant} claims the win.
                      </>
                    )}
                  </p>
                ) : null}
                {match.gameEndReason ? (
                  <p className="border-t border-border px-4 py-3 text-sm">
                    Result: <strong>{formatReason(match.gameEndReason)}</strong>
                  </p>
                ) : null}
              </section>

              <PredictionPanel
                matchId={matchId}
                fen={fen}
                pliesPlayed={pliesPlayed(match)}
                isActive={isActive && !timedOut}
                isFinished={isFinished}
                timedOut={timedOut}
                playerColor={viewerColor}
                liveMarket={realtime.predictionMarket}
                liveSettled={realtime.predictionSettled}
                onPreview={setPreview}
              />

              {historyError && moves.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {historyError}
                </p>
              ) : (
                <MoveList moves={moves} fen={fen ?? undefined} currentMoveIndex={moves.length - 1} className="min-h-48" />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-16">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <h1 className="font-display text-3xl">Match unavailable</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-secondary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        ) : null}
        <Link
          href="/arena"
          className="btn btn-primary"
        >
          Browse live games
        </Link>
      </div>
    </div>
  );
}
