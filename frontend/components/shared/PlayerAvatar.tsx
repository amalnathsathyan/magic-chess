import { avatarFor, walletHue } from "@/lib/players";
import { cn } from "@/lib/utils";

/** A chess-piece badge, tinted per wallet so players are easy to tell apart. */
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
  const hue = walletHue(wallet);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border leading-none",
        size === "sm" && "h-7 w-7 text-base",
        size === "md" && "h-9 w-9 text-xl",
        size === "lg" && "h-12 w-12 text-2xl",
        size === "xl" && "h-20 w-20 text-5xl",
        className
      )}
      style={{
        backgroundColor: `hsl(${hue} 60% 50% / 0.14)`,
        borderColor: `hsl(${hue} 60% 55% / 0.35)`,
        color: `hsl(${hue} 70% 72%)`,
      }}
    >
      {avatarFor(wallet, avatar)}
    </span>
  );
}
