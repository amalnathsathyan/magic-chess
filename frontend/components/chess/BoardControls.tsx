"use client";

import { useState } from "react";
import { FlipVertical, Flag, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sounds } from "@/lib/sounds";

interface BoardControlsProps {
  onFlipBoard: () => void;
  onResign: () => void;
  canResign?: boolean;
  className?: string;
}

const controlClass =
  "inline-flex min-h-10 items-center justify-center gap-1.5 border border-border px-3 text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

export function BoardControls({
  onFlipBoard,
  onResign,
  canResign = true,
  className,
}: BoardControlsProps) {
  const [isMuted, setIsMuted] = useState(() => !sounds.isEnabled());
  const [confirmingResign, setConfirmingResign] = useState(false);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    sounds.setEnabled(!newMuted);
  };

  return (
    <div
      className={cn("flex min-h-10 flex-wrap items-center justify-end gap-2", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setConfirmingResign(false);
      }}
    >
      {confirmingResign ? (
        <>
          <span className="mr-auto px-1 text-sm text-muted-foreground">Resign this game?</span>
          <button
            type="button"
            onClick={() => setConfirmingResign(false)}
            className={cn(controlClass, "text-muted-foreground hover:border-border-hover hover:text-foreground")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingResign(false);
              onResign();
            }}
            className={cn(controlClass, "bg-destructive/10 text-destructive hover:bg-destructive/20")}
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            Confirm resign
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onFlipBoard}
            className={cn(controlClass, "text-muted-foreground hover:border-border-hover hover:text-foreground")}
            aria-label="Flip board"
          >
            <FlipVertical className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Flip</span>
          </button>

          <button
            onClick={() => setConfirmingResign(true)}
            disabled={!canResign}
            className={cn(controlClass, "text-muted-foreground hover:border-destructive/50 hover:text-destructive")}
            title="Resign"
          >
            <Flag className="h-4 w-4" />
            <span className="hidden sm:inline">Resign</span>
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className={cn(controlClass, "min-w-10 text-muted-foreground hover:border-border-hover hover:text-foreground")}
            aria-label={isMuted ? "Turn move sounds on" : "Mute move sounds"}
            aria-pressed={isMuted}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
