"use client";

import { cn } from "@/lib/utils";
import { User, CircleDollarSign } from "lucide-react";
import { useMemo } from "react";

interface PlayerCardProps {
  side: "white" | "black";
  isActive: boolean;
  address?: string;
  wagerAmount?: number;
  className?: string;
}

export function PlayerCard({
  side,
  isActive,
  address = "Unknown",
  wagerAmount = 0,
  className,
}: PlayerCardProps) {
  const shortAddress = useMemo(() => {
    if (!address || address === "Unknown") return "Unknown";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, [address]);

  return (
    <div
      className={cn(
        "glass-card flex items-center justify-between p-3 transition-all",
        isActive && "border-primary/50 shadow-[0_0_15px_rgba(0,230,118,0.15)] bg-primary/5",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 border border-border">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          {isActive && (
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold capitalize">{side} Player</span>
          <span className="font-mono text-xs text-muted-foreground">
            {shortAddress}
          </span>
        </div>
      </div>
      {wagerAmount > 0 && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
          <CircleDollarSign className="h-4 w-4" />
          {wagerAmount}
        </div>
      )}
    </div>
  );
}
