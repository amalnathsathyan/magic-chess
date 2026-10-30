import { PlayerAvatar } from "@/components/shared/PlayerAvatar";
import { playerLabel } from "@/lib/players";

/** A player above or below the board: who, which side, and whose move it is. */
export function PlayerRow({
  address,
  color,
  active,
  connectedAddress,
  online,
}: {
  address: string | null;
  color: "White" | "Black";
  active: boolean;
  connectedAddress?: string;
  /**
   * Realtime presence. Only a confirmed "online" is shown: a player who
   * hasn't announced themselves to the stream looks the same as one who is
   * away, so a grey dot would mostly be wrong.
   */
  online?: boolean;
}) {
  const isYou = Boolean(address && connectedAddress === address);
  return (
    <div className="flex min-h-12 w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative">
          {address ? (
            <PlayerAvatar wallet={address} size="md" />
          ) : (
            <span className="block h-9 w-9 border border-dashed border-border-hover" aria-hidden="true" />
          )}
          {online ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-success"
              aria-label="Online"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={address ?? undefined}>
            {address ? (isYou ? "You" : playerLabel(address)) : "Waiting for opponent"}
          </p>
          <p className="text-xs text-muted-foreground">{color}</p>
        </div>
      </div>
      {active ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
          To move
        </span>
      ) : null}
    </div>
  );
}
