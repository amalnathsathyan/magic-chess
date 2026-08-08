"use client";

import { cn } from "@/lib/utils";

type PromotionPiece = "q" | "r" | "b" | "n";

interface PromotionDialogProps {
  isOpen: boolean;
  color: "white" | "black";
  onSelect: (piece: PromotionPiece) => void;
  onCancel?: () => void;
  className?: string;
}

const PIECES: { piece: PromotionPiece; label: string }[] = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

const PIECE_UNICODE: Record<PromotionPiece, string> = {
  q: "♕",
  r: "♖",
  b: "♗",
  n: "♘",
};

const PIECE_UNICODE_BLACK: Record<PromotionPiece, string> = {
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
};

export function PromotionDialog({
  isOpen,
  color,
  onSelect,
  onCancel,
  className,
}: PromotionDialogProps) {
  if (!isOpen) return null;

  const unicodeMap = color === "white" ? PIECE_UNICODE : PIECE_UNICODE_BLACK;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a promotion piece"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel?.();
      }}
      className={cn(
        "glass-card absolute z-20 flex gap-1 p-2",
        className
      )}
    >
      {PIECES.map(({ piece, label }) => (
        <button
          key={piece}
          type="button"
          onClick={() => onSelect(piece)}
          title={label}
          aria-label={`Promote to ${label}`}
          autoFocus={piece === "q"}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-lg text-3xl transition-colors duration-100",
            "hover:bg-primary/10 hover:text-primary",
            "active:translate-y-px focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
          )}
        >
          {unicodeMap[piece]}
        </button>
      ))}
    </div>
  );
}
