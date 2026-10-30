"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Link2,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useWallets } from "@privy-io/react-auth/solana";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { ZugconRewardBanner } from "@/components/rewards/ZugconRewardModal";
import { useZugconReward } from "@/hooks/useZugconReward";
import { selectSolanaWallet } from "@/lib/privy-wallet";
import { MoveList } from "@/components/chess/MoveList";
import { ReplayControls } from "@/components/chess/ReplayControls";
import { ShareCardDialog } from "@/components/share/ShareCard";
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
import { compactAmount, drawMatchCard, renderCard, type MatchCardSide } from "@/lib/share-card";
import { formatTokenAmount, solanaConfig } from "@/lib/solana-config";

import { cn } from "@/lib/utils";
import { fitBoardWidth } from "@/lib/board-size";

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
  const [sharingCard, setSharingCard] = useState(false);
  const [showWager, setShowWager] = useState(true);

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
    const update = () => setBoardWidth(fitBoardWidth());
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

  // ZUGCON: a player who comes back to a finished game can still claim here.
  const { wallets } = useWallets();
  const wallet = selectSolanaWallet(wallets);
  const viewerRole =
    wallet && history?.whitePlayer === wallet.address
      ? "creator"
      : wallet && history?.blackPlayer === wallet.address
        ? "joiner"
        : null;
  const reward = useZugconReward({
    matchId: matchId || null,
    wallet,
    finished: finished && viewerRole !== null,
  });
  const reason = formatEndReason(history?.gameEndReason);
  const duration = formatDuration(history?.startedAt, history?.endedAt);
  const wager = BigInt(history?.betAmountPerPlayer ?? "0");

  const share = async () => {
    if (await copyToClipboard(absoluteUrl(reviewHref(matchId, replay.ply)))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }
  };

  const symbol = solanaConfig.wagerSymbol;
  const stakeLabel = `${compactAmount(formatTokenAmount(wager))} ${symbol}`;
  const potLabel = `${compactAmount(formatTokenAmount(BigInt(history?.totalPot ?? "0")))} ${symbol}`;
  const wagerShown = wager > 0n && showWager;
  const moveCount = Math.ceil((history?.plyCount ?? moves.length) / 2);
  const winnerColor = status === "WhiteWins" ? "white" : status === "BlackWins" ? "black" : null;
  const cardSide = (color: "white" | "black"): MatchCardSide => {
    const address = color === "white" ? history?.whitePlayer : history?.blackPlayer;
    const meta = color === "white" ? history?.white : history?.black;
    return {
      name: address ? playerLabel(address, meta?.name) : "Unknown",
      rating: meta?.rating ?? null,
      ratingChange: meta?.ratingChange ?? null,
      xp: meta?.xp ?? null,
    };
  };
  const shareCaption = (() => {
    const white = cardSide("white").name;
    const black = cardSide("black").name;
    const how = reason ? ` by ${reason.toLowerCase()}` : "";
    const stakes = wagerShown ? ` with ${potLabel} on the line` : "";
    const outcome =
      winnerColor === "white"
        ? `${white} beat ${black}${how}`
        : winnerColor === "black"
          ? `${black} beat ${white}${how}`
          : `${white} and ${black} drew${how}`;
    return `${outcome} in ${moveCount} moves${stakes} on @zugxyz. Every move matters.`;
  })();

  const topColor = orientation === "white" ? "black" : "white";
  const side = (color: "white" | "black") => ({
    address: color === "white" ? history?.whitePlayer ?? null : history?.blackPlayer ?? null,
    meta: color === "white" ? history?.white : history?.black,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/arena"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Play
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="btn btn-secondary btn-sm"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Share position"}
            </button>
          </div>
        </div>

      <div>
        {!matchId ? (
          <ReviewEmpty message="No game selected." />
        ) : loading && !history ? (
          <div className="grid gap-8 lg:grid-cols-[auto_360px] lg:justify-center" aria-label="Loading game">
            <div className="mx-auto aspect-square animate-pulse bg-card" style={{ width: boardWidth }} />
            <div className="h-72 animate-pulse bg-card" />
          </div>
        ) : !history ? (
          <ReviewEmpty message={error ?? "This game isn't available."} onRetry={load} />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[auto_360px] lg:justify-center">
            <section className="mx-auto flex flex-col gap-3" style={{ width: boardWidth }} aria-label="Game replay">
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

            <aside className="flex min-h-0 min-w-0 flex-col gap-4">
              <section className="panel p-4" aria-labelledby="game-result-heading">
                <div className="flex items-center justify-between gap-3">
                  <h1 id="game-result-heading" className="font-display text-2xl">
                    {resultHeadline(status)}
                  </h1>
                  <span className="shrink-0 bg-primary/15 px-2.5 py-1 text-xs font-semibold tnum text-primary">
                    {resultScore(status) ?? "—"}
                  </span>
                </div>
                {reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">by {reason.toLowerCase()}</p>
                ) : null}
                <dl className="-mx-4 mt-4 grid grid-cols-3 divide-x divide-border border-y border-border">
                  <div className="px-4 py-3">
                    <dt className="label">Moves</dt>
                    <dd className="mt-1 text-lg font-semibold tnum">
                      {moveCount}
                    </dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="label">Length</dt>
                    <dd className="mt-1 text-lg font-semibold tnum">{duration ?? "—"}</dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="label">Stake</dt>
                    <dd className="mt-1 text-lg font-semibold tnum">
                      {wager > 0n ? (
                        <>
                          {formatTokenAmount(wager)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {solanaConfig.wagerSymbol}
                          </span>
                        </>
                      ) : (
                        "Free"
                      )}
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
                  Played {timeAgo(history.endedAt ?? history.createdAt)}
                </p>
                {finished && viewerRole ? (
                  <ZugconRewardBanner
                    className="mt-4"
                    status={reward.status}
                    claim={reward.claim}
                    phase={reward.phase}
                    error={reward.error}
                    onClaim={() => void reward.claimReward()}
                    role={viewerRole}
                  />
                ) : null}
                {finished ? (
                  <button
                    type="button"
                    onClick={() => setSharingCard(true)}
                    className="btn btn-primary mt-4 w-full"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Share result card
                  </button>
                ) : null}
                {!finished ? (
                  <Link
                    href={status === "Active" ? spectateHref(matchId) : playHref(matchId)}
                    className="btn btn-secondary mt-4 w-full"
                  >
                    Still in play. Watch it live
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
                  className="btn btn-secondary"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Reload game
                </button>
              ) : null}
            </aside>
          </div>
        )}
      </div>

      {history && finished ? (
        <ShareCardDialog
          open={sharingCard}
          onOpenChange={setSharingCard}
          title="Share result card"
          description="The result, both players and what it did to their ratings, on one card."
          filename={`zug-game-${matchId}.png`}
          message={shareCaption}
          url={absoluteUrl(reviewHref(matchId))}
          renderKey={wagerShown ? "wager" : "no-wager"}
          options={
            wager > 0n ? (
              <div className="flex items-center justify-between gap-4 border border-border px-4 py-3">
                <div>
                  <p id="show-wager-label" className="text-sm font-medium">
                    Show stake
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Stake {stakeLabel} each, {potLabel} pot.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showWager}
                  aria-labelledby="show-wager-label"
                  onClick={() => setShowWager((current) => !current)}
                  className={cn(
                    "relative inline-flex h-8 w-14 shrink-0 items-center border transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    showWager ? "border-primary/50 bg-primary" : "border-border bg-muted"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-6 w-6 bg-background shadow-sm transition-transform",
                      showWager ? "translate-x-7" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ) : undefined
          }
          render={() =>
            renderCard((ctx) =>
              drawMatchCard(ctx, {
                headline: resultHeadline(status),
                reason,
                score: resultScore(status) ?? "",
                winner: winnerColor,
                white: cardSide("white"),
                black: cardSide("black"),
                moves: moveCount,
                length: duration,
                stake: wager > 0n ? (wagerShown ? stakeLabel : null) : "FREE",
                pot: wagerShown ? potLabel : null,
              })
            )
          }
        />
      ) : null}
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
    <div className="flex min-h-12 w-full items-center justify-between gap-3">
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
        <span className="shrink-0 text-sm tnum">
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
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-16">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <h1 className="font-display text-3xl">Game unavailable</h1>
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
          Back to Play
        </Link>
      </div>
    </div>
  );
}
