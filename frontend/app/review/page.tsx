"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  Coins,
  Link2,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/chess/MoveList";
import { ReplayControls } from "@/components/chess/ReplayControls";
import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { useReplay, useReplayKeyboard } from "@/hooks/useReplay";
import { api, type ApiMatchHistory } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import {
  formatDuration,
  formatEndReason,
  isFinishedStatus,
  pgnResult,
  resultHeadline,
  resultScore,
  timeAgo,
} from "@/lib/game-result";
import { absoluteUrl, playHref, profileHref, reviewHref, spectateHref } from "@/lib/match-links";
import { formatRatingChange, playerLabel } from "@/lib/players";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";

import { cn } from "@/lib/utils";

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewView />
    </Suspense>
  );
}

function ReviewView() {
  const params = useSearchParams();
  const matchId = params.get("id") ?? "";
  const startPly = Number(params.get("ply"));
  const [history, setHistory] = useState<ApiMatchHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [boardWidth, setBoardWidth] = useState(320);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setHistory(await api.getMatchHistory(matchId));
      setError(null);
    } catch {
      setError("We couldn't load this game. It may still be indexing.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const update = () => setBoardWidth(Math.min(560, Math.max(280, window.innerWidth - 32)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const moves = useMemo(() => history?.moves ?? [], [history]);
  const replay = useReplay(moves);
  useReplayKeyboard(replay);

  // Deep links can open the game at a given ply.
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (jumped || moves.length === 0) return;
    setJumped(true);
    replay.goTo(Number.isFinite(startPly) && startPly > 0 ? startPly : moves.length);
  }, [jumped, moves.length, replay, startPly]);

  // Games rebuilt from the on-chain account may be missing some moves: the
  // final position still comes from the chain, so show it at the end.
  const movesMissing = history?.movesComplete === false;
  const boardFen =
    movesMissing && replay.atEnd && history?.finalFen ? history.finalFen : replay.fen;

  const sans = useMemo(
    () => moves.map((move) => move.san ?? move.algebraicMove),
    [moves]
  );
  const status = history?.gameStatus ?? "";
  const finished = isFinishedStatus(status);
  const reason = formatEndReason(history?.gameEndReason);
  const duration = formatDuration(history?.startedAt, history?.endedAt);
  const wager = BigInt(history?.betAmountPerPlayer ?? "0");

  const share = async () => {
    if (await copyToClipboard(absoluteUrl(reviewHref(matchId, replay.ply)))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }
  };

  const topColor = orientation === "white" ? "black" : "white";
  const side = (color: "white" | "black") => ({
    address: color === "white" ? history?.whitePlayer ?? null : history?.blackPlayer ?? null,
    meta: color === "white" ? history?.white : history?.black,
  });

  return (
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Share position"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!matchId ? (
          <ReviewEmpty message="No game selected." />
        ) : loading && !history ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]" aria-label="Loading game">
            <div className="mx-auto h-[min(560px,calc(100vw-2rem))] w-full max-w-[560px] animate-pulse rounded-xl bg-card" />
            <div className="h-72 animate-pulse rounded-xl bg-card" />
          </div>
        ) : !history ? (
          <ReviewEmpty message={error ?? "This game isn't available."} onRetry={load} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="flex flex-col items-center gap-3" aria-label="Game replay">
              <ReviewPlayer color={topColor} {...side(topColor)} />
              <ChessBoard
                fen={boardFen}
                orientation={orientation}
                boardWidth={boardWidth}
                arePiecesDraggable={false}
                lastMove={replay.lastMove}
              />
              <ReviewPlayer color={orientation} {...side(orientation)} />
              <ReplayControls
                replay={replay}
                onFlip={() => setOrientation((current) => (current === "white" ? "black" : "white"))}
              />
            </section>

            <aside className="flex min-h-0 flex-col gap-4">
              <section className="glass-card p-4" aria-labelledby="game-result-heading">
                <div className="flex items-center justify-between gap-3">
                  <h1 id="game-result-heading" className="flex items-center gap-2 font-heading text-base font-semibold">
                    <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
                    {resultHeadline(status)}
                  </h1>
                  <span className="shrink-0 bg-primary/15 px-2.5 py-1 font-mono text-xs font-semibold text-primary">
                    {resultScore(status) ?? "—"}
                  </span>
                </div>
                {reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">by {reason.toLowerCase()}</p>
                ) : null}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-card/60 p-2">
                    <dt className="text-muted-foreground">Moves</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums">
                      {Math.ceil((history.plyCount ?? moves.length) / 2)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-card/60 p-2">
                    <dt className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock3 className="h-3 w-3" aria-hidden="true" />
                      Length
                    </dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums">{duration ?? "—"}</dd>
                  </div>
                  <div className="rounded-md bg-card/60 p-2">
                    <dt className="inline-flex items-center gap-1 text-muted-foreground">
                      <Coins className="h-3 w-3" aria-hidden="true" />
                      Wager
                    </dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums">
                      {wager > 0n
                        ? `${formatTokenAmount(wager)} ${solanaConfig.wagerSymbol}`
                        : "Free"}
                    </dd>
                  </div>
                </dl>
                {movesMissing ? (
                  <p className="mt-3 border border-border px-3 py-2 text-xs text-muted-foreground">
                    {moves.length === 0
                      ? "This game's moves weren't recorded, so it can't be replayed. The board shows the final position."
                      : "Some of this game's moves weren't recorded. The board shows the final position at the end."}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  Played {timeAgo(history.endedAt ?? history.createdAt)} · #{matchId}
                </p>
                {!finished ? (
                  <Link
                    href={status === "Active" ? spectateHref(matchId) : playHref(matchId)}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-primary/40 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    This game is still going — open it live
                  </Link>
                ) : null}
              </section>

              <MoveList
                moves={sans}
                fen={boardFen}
                currentMoveIndex={replay.ply - 1}
                onSelectMove={(index) => replay.goTo(index + 1)}
                result={pgnResult(status)}
                emptyText={movesMissing ? "The moves of this game weren't recorded." : undefined}
                className="min-h-64"
              />
              {error ? (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Reload game
                </button>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function ReviewPlayer({
  color,
  address,
  meta,
}: {
  color: "white" | "black";
  address: string | null;
  meta?: {
    name: string | null;
    avatar: string | null;
    rating: number | null;
    ratingChange: number | null;
    xp?: number | null;
  };
}) {
  const delta = formatRatingChange(meta?.ratingChange);
  return (
    <div className="flex min-h-12 w-full max-w-[560px] items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {address ? <PlayerAvatar wallet={address} avatar={meta?.avatar} /> : null}
        <div className="min-w-0">
          <p className="text-xs capitalize text-muted-foreground">{color}</p>
          {address ? (
            <Link
              href={profileHref(address)}
              className="truncate text-sm font-semibold hover:text-primary hover:underline"
            >
              {playerLabel(address, meta?.name)}
            </Link>
          ) : (
            <p className="text-sm font-semibold">Unknown</p>
          )}
        </div>
      </div>
      {meta?.rating != null ? (
        <span className="shrink-0 font-mono text-sm tabular-nums">
          {meta.rating}
          {delta ? (
            <span
              className={cn(
                "ml-1 text-xs",
                (meta.ratingChange ?? 0) > 0 && "text-success",
                (meta.ratingChange ?? 0) < 0 && "text-destructive"
              )}
            >
              {delta}
            </span>
          ) : null}
          {meta.xp ? <span className="ml-2 text-xs text-primary">+{meta.xp} XP</span> : null}
        </span>
      ) : null}
    </div>
  );
}

function ReviewEmpty({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="glass-card mx-auto flex max-w-xl flex-col items-start gap-4 p-6">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <h1 className="font-heading text-lg font-semibold">Game unavailable</h1>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        ) : null}
        <Link
          href="/arena"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          Back to the arena
        </Link>
      </div>
    </div>
  );
}
