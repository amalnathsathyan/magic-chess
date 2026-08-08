"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FlipVertical, Flag, Volume2, VolumeX } from "lucide-react";
import { sounds } from "@/lib/sounds";

interface BoardControlsProps {
  onFlipBoard: () => void;
  onResign: () => void;
  canResign?: boolean;
  className?: string;
}

export function BoardControls({
  onFlipBoard,
  onResign,
  canResign = true,
  className,
}: BoardControlsProps) {
  const [isMuted, setIsMuted] = useState(() => !sounds.isEnabled());

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    sounds.setEnabled(!newMuted);
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
        onClick={onResign}
        disabled={!canResign}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
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
