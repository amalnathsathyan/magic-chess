"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";


import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Square } from "chess.js";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { api, type ApiMatchHistory } from "@/lib/api";
import { shortenAddress } from "@/lib/chess";
import { cn } from "@/lib/utils";
import { boardToFen, type Piece } from "@magic-chess/sdk";
import { useMatch } from "@magic-chess/sdk/react";

interface SpectatePageProps {
  params: Promise<{ matchId: string }>;
}

const EMPTY_PUBLIC_KEY = "11111111111111111111111111111111";

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    waitingForOpponent: "Waiting for opponent",
    active: "In progress",
    whiteWins: "White won",
    blackWins: "Black won",
    draw: "Draw",
    aborted: "Aborted",
  };
  return labels[status] ?? status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatReason(reason: string | null): string | null {
  if (!reason) return null;
  return reason
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeBoardPiece(piece: Piece | null): {
  pieceType: "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";
  color: "White" | "Black";
} | null {
  if (!piece) return null;

  const pieceNames = {
    pawn: "Pawn",
    knight: "Knight",
    bishop: "Bishop",
    rook: "Rook",
    queen: "Queen",
    king: "King",
  } as const;

  return {
    pieceType: pieceNames[piece.pieceType],
    color: piece.color === "white" ? "White" : "Black",
  };
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function PlayerRow({
  address,
  color,
  active,
}: {
  address: string | null;
  color: "White" | "Black";
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 w-full max-w-[560px] items-center justify-between gap-3 rounded-lg border px-3 py-2",
        active ? "border-primary/40 bg-primary/10" : "border-border bg-card/40"
      )}
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{color}</p>
        <p className="truncate font-mono text-sm font-semibold" title={address ?? undefined}>
          {address ? shortenAddress(address, 6) : "Waiting for opponent"}
        </p>
      </div>
      {active ? (
        <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
          To move
        </span>
      ) : null}
    </div>
  );
}

export default function SpectatePage({ params }: SpectatePageProps) {
  const { matchId } = use(params);
  const { match, loading, error, refetch } = useMatch(matchId);
  const [history, setHistory] = useState<ApiMatchHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [boardWidth, setBoardWidth] = useState(320);

  const loadHistory = useCallback(
    async (showLoading = true) => {
      if (showLoading) setHistoryLoading(true);
      try {
        const response = await api.getMatchHistory(matchId);
        setHistory(response);
        setHistoryError(null);
      } catch {
        setHistoryError("Move history is temporarily unavailable.");
      } finally {
        if (showLoading) setHistoryLoading(false);
      }
    },
    [matchId]
  );

  useEffect(() => {
    void loadHistory();

    let polling = false;
    const intervalId = window.setInterval(() => {
      if (polling) return;
      polling = true;
      void Promise.allSettled([refetch(), loadHistory(false)]).finally(() => {
        polling = false;
      });
    }, 3_000);

    return () => window.clearInterval(intervalId);
  }, [loadHistory, refetch]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const updateBoardWidth = () => {
      setBoardWidth(Math.min(560, Math.max(280, window.innerWidth - 32)));
    };
    updateBoardWidth();
    window.addEventListener("resize", updateBoardWidth);
    return () => window.removeEventListener("resize", updateBoardWidth);
  }, []);

  const fen = useMemo(() => {
    if (!match || match.board.length !== 8) return null;
    try {
      const board = match.board.map((row) => row.map(normalizeBoardPiece));
      return boardToFen(
        board,
        match.currentTurn,
        match.castlingRights,
        match.enPassantTarget,
        match.halfmoveClock,
        match.fullmoveNumber
      );
    } catch {
      return null;
    }
  }, [match]);

  const moves = useMemo(
    () => history?.moves.map((move) => move.algebraicMove) ?? [],
    [history]
  );
  const lastHistoryMove = history?.moves.at(-1);
  const lastMove =
    lastHistoryMove && isSquare(lastHistoryMove.from) && isSquare(lastHistoryMove.to)
      ? { from: lastHistoryMove.from, to: lastHistoryMove.to }
      : null;

  const whiteAddress = match?.players[0]?.toBase58() ?? history?.whitePlayer ?? null;
  const rawBlackAddress = match?.players[1]?.toBase58() ?? history?.blackPlayer ?? null;
  const blackAddress = rawBlackAddress === EMPTY_PUBLIC_KEY ? null : rawBlackAddress;
  const status = match?.gameStatus ?? null;
  const isActive = status === "active";
  const timeoutMilliseconds = match ? Number(match.moveTimeoutDuration) * 1_000 : 0;
  const lastMoveMilliseconds = match ? Number(match.lastMoveTimestamp) * 1_000 : 0;
  const remainingMilliseconds =
    isActive && timeoutMilliseconds > 0
      ? Math.max(0, timeoutMilliseconds - (now - lastMoveMilliseconds))
      : null;

  const handleRefresh = () => {
    void Promise.allSettled([refetch(), loadHistory()]);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/arena"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
            <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">
              |
            </span>
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Spectating
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || historyLoading}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", (loading || historyLoading) && "animate-spin")}
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
          <div className="glass-card mx-auto flex max-w-xl flex-col items-start gap-4 p-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <h1 className="font-heading text-lg font-semibold">Match unavailable</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {error?.message || "No on-chain match was found for this identifier."}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="flex flex-col items-center gap-3" aria-label="Read-only chess board">
              <PlayerRow
                address={blackAddress}
                color="Black"
                active={isActive && match.currentTurn === "black"}
              />

              {fen ? (
                <ChessBoard
                  fen={fen}
                  orientation="white"
                  boardWidth={boardWidth}
                  arePiecesDraggable={false}
                  lastMove={lastMove}
                />
              ) : (
                <div className="glass-card flex min-h-72 w-full max-w-[560px] items-center justify-center p-6 text-center">
                  <div>
                    <AlertCircle className="mx-auto h-7 w-7 text-destructive" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium">Board data unavailable</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The on-chain board could not be converted to a valid position.
                    </p>
                  </div>
                </div>
              )}

              <PlayerRow
                address={whiteAddress}
                color="White"
                active={isActive && match.currentTurn === "white"}
              />
              <p className="text-center text-xs text-muted-foreground">
                Spectator mode is read-only. The on-chain position refreshes automatically.
              </p>
            </section>

            <aside className="flex min-h-0 flex-col gap-4">
              <section className="glass-card p-4" aria-labelledby="match-status-heading">
                <div className="flex items-center justify-between gap-3">
                  <h1 id="match-status-heading" className="font-heading text-sm font-semibold">
                    Match status
                  </h1>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {formatStatus(match.gameStatus)}
                  </span>
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  {match.gameEndReason ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Result</dt>
                      <dd className="font-medium">{formatReason(match.gameEndReason)}</dd>
                    </div>
                  ) : null}
                  {isActive ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Turn</dt>
                      <dd className="font-medium capitalize">{match.currentTurn}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Moves</dt>
                    <dd className="font-mono font-medium tabular-nums">{history?.totalMoves ?? moves.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Move timer
                    </dt>
                    <dd className="font-mono font-medium tabular-nums">
                      {remainingMilliseconds !== null
                        ? formatRemaining(remainingMilliseconds)
                        : timeoutMilliseconds > 0
                          ? `${Math.round(timeoutMilliseconds / 1_000)}s per move`
                          : "No timer"}
                    </dd>
                  </div>
                </dl>
              </section>

              {historyError ? (
                <div className="glass-card flex items-start gap-3 border-destructive/30 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">{historyError}</p>
                    <button
                      type="button"
                      onClick={() => void loadHistory()}
                      className="mt-2 min-h-10 rounded-md text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Retry history
                    </button>
                  </div>
                </div>
              ) : historyLoading && !history ? (
                <div className="glass-card flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading move history
                </div>
              ) : (
                <MoveList
                  moves={moves}
                  fen={fen ?? undefined}
                  currentMoveIndex={moves.length - 1}
                  className="min-h-64 flex-1"
                />
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
