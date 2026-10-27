"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { api, type ApiMatch } from "@/lib/api";
import { shortenAddress } from "@/lib/chess";
import { playHref } from "@/lib/match-links";

const REFRESH_MS = 30_000;

/**
 * Games the wallet won on time but hasn't claimed. Until the claim, the game
 * stays Active on-chain and any wager stays in escrow.
 */
export function TimeoutClaims({ walletAddress }: { walletAddress: string | null }) {
  const [wins, setWins] = useState<ApiMatch[]>([]);

  useEffect(() => {
    if (!walletAddress) {
      setWins([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .listMatches({ status: "Active", player: walletAddress, timedOut: true, limit: 20 })
        .then(({ matches }) => {
          if (cancelled) return;
          // The side that ran out of time is the opponent's, so the wallet won.
          setWins(
            matches.filter((game) => {
              const mine = game.whitePlayer === walletAddress ? "white" : "black";
              return game.timedOutSide != null && game.timedOutSide !== mine;
            })
          );
        })
        .catch(() => undefined);
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [walletAddress]);

  if (wins.length === 0) return null;

  return (
    <section className="panel mb-6 border-primary/50 p-4" aria-labelledby="timeout-claims-heading">
      <h2 id="timeout-claims-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
        {wins.length === 1 ? "You won a game on time" : `You won ${wins.length} games on time`}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Claim the win to end the game and collect the pot.</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {wins.map((game) => {
          const opponent = game.whitePlayer === walletAddress ? game.blackPlayer : game.whitePlayer;
          const opponentName = game.whitePlayer === walletAddress ? game.blackName : game.whiteName;
          return (
            <li key={game.matchId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm">
                vs {opponentName ?? (opponent ? shortenAddress(opponent) : "—")}
                <span className="ml-2 text-xs tnum text-muted-foreground">
                  move {Math.ceil((game.moveCount + 1) / 2)}
                </span>
              </span>
              <Link
                href={playHref(game.matchId)}
                className="btn btn-primary btn-sm shrink-0"
              >
                Claim win
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
