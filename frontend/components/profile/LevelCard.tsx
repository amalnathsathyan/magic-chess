import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ApiLevel, ApiPlayerProfile } from "@/lib/api";
import { reviewHref } from "@/lib/match-links";
import { timeAgo } from "@/lib/game-result";

const KIND_LABEL: Record<string, string> = {
  first_win: "First win today",
  result: "Result",
  length: "Long game",
  game: "Game played",
};
const KIND_ORDER = Object.keys(KIND_LABEL);

/** Level, tier and XP progress, with the games that earned the latest XP. */
export function LevelCard({
  level,
  recent,
}: {
  level: ApiLevel;
  recent: NonNullable<ApiPlayerProfile["recentXp"]>;
}) {
  const progress = level.levelSpan > 0 ? Math.min(1, level.levelXp / level.levelSpan) : 0;
  return (
    <section className="glass-card mb-6 p-5" aria-labelledby="level-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="level-heading" className="label flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Level
          </h2>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-4xl tabular-nums">{level.level}</span>
            <span className="font-mono text-sm uppercase tracking-widest text-primary">
              {level.tier}
            </span>
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {level.xp.toLocaleString()} XP total
        </p>
      </div>

      <div
        className="mt-4 h-2 w-full bg-border"
        role="progressbar"
        aria-label={`Progress to level ${level.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={level.levelSpan}
        aria-valuenow={level.levelXp}
      >
        <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {level.levelXp} / {level.levelSpan} XP to level {level.level + 1}
      </p>

      {recent.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {recent.slice(0, 5).map((entry) => (
            <li key={entry.matchId} className="flex items-center justify-between gap-3 py-2 text-xs">
              <Link
                href={reviewHref(entry.matchId)}
                className="min-w-0 truncate text-muted-foreground hover:text-foreground"
              >
                {[...entry.kinds]
                  .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
                  .map((kind) => KIND_LABEL[kind] ?? kind)
                  .join(" · ")}
                {entry.earnedAt ? ` · ${timeAgo(entry.earnedAt)}` : ""}
              </Link>
              <span className="shrink-0 font-mono font-semibold tabular-nums text-primary">
                +{entry.amount} XP
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Finish a game to earn XP. Wins, longer games and your first win each day earn more.
        </p>
      )}
    </section>
  );
}
