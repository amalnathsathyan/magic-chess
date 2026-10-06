import { User } from "lucide-react";
import { shortenAddress } from "@/lib/chess";
import { cn } from "@/lib/utils";

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
  /** Realtime presence, when known. */
  online?: boolean;
}) {
  const isYou = Boolean(address && connectedAddress === address);
  return (
    <div
      className={cn(
        "flex min-h-12 w-full max-w-[560px] items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
        active ? "border-primary/40 bg-primary/10" : "border-border bg-card/40"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center bg-secondary">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {online !== undefined ? (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                online ? "bg-primary" : "bg-muted-foreground/50"
              )}
              aria-label={online ? "Online" : "Offline"}
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {color}
            {isYou ? " · You" : ""}
          </p>
          <p className="truncate font-mono text-sm font-semibold" title={address ?? undefined}>
            {address ? shortenAddress(address, 6) : "Waiting for opponent"}
          </p>
        </div>
      </div>
      {active ? (
        <span className="shrink-0 bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
          To move
        </span>
      ) : null}
    </div>
  );
}
