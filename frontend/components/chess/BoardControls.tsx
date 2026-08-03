"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FlipVertical, Flag, Hand, Volume2, VolumeX } from "lucide-react";
import { sounds } from "@/lib/sounds";

interface BoardControlsProps {
  onFlipBoard: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  className?: string;
}

export function BoardControls({
  onFlipBoard,
  onResign,
  onOfferDraw,
  className,
}: BoardControlsProps) {
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    // Basic implementation - in a real app you'd connect this to a sound context/store
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (newMuted) {
      sounds.destroy();
    } else {
      // Re-init or toggle internal mute state
      sounds.play("game_start"); // just to test
    }
  };

  return (
    <div className={cn("glass-card flex items-center justify-center gap-2 p-2", className)}>
      <button
        onClick={onFlipBoard}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        title="Flip Board"
      >
        <FlipVertical className="h-4 w-4" />
        <span className="hidden sm:inline">Flip</span>
      </button>

      <div className="h-4 w-px bg-border/50" />

      <button
        onClick={onOfferDraw}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        title="Offer Draw"
      >
        <Hand className="h-4 w-4" />
        <span className="hidden sm:inline">Draw</span>
      </button>

      <button
        onClick={onResign}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        title="Resign"
      >
        <Flag className="h-4 w-4" />
        <span className="hidden sm:inline">Resign</span>
      </button>

      <div className="h-4 w-px bg-border/50" />

      <button
        onClick={toggleMute}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
