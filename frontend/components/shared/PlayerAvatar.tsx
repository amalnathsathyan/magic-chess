import { avatarFor } from "@/lib/players";
import { cn } from "@/lib/utils";

/** A chess-piece badge: bone glyph on a graphite square. */
export function PlayerAvatar({
  wallet,
  avatar,
  size = "md",
  className,
}: {
  wallet: string;
  avatar?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center border border-border-hover bg-card-hover leading-none text-foreground",
        size === "sm" && "h-7 w-7 text-base",
        size === "md" && "h-9 w-9 text-xl",
        size === "lg" && "h-12 w-12 text-2xl",
        size === "xl" && "h-20 w-20 text-5xl",
        className
      )}
    >
      {avatarFor(wallet, avatar)}
    </span>
  );
}
