"use client";

import { cn } from "@/lib/utils";

type PromotionPiece = "q" | "r" | "b" | "n";

interface PromotionDialogProps {
  isOpen: boolean;
  color: "white" | "black";
  onSelect: (piece: PromotionPiece) => void;
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
  className,
}: PromotionDialogProps) {
  if (!isOpen) return null;

  const unicodeMap = color === "white" ? PIECE_UNICODE : PIECE_UNICODE_BLACK;

  return (
    <div
      className={cn(
        "glass-card absolute z-20 flex gap-1 p-2",
        className
      )}
    >
      {PIECES.map(({ piece, label }) => (
        <button
          key={piece}
          onClick={() => onSelect(piece)}
          title={label}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-lg text-3xl transition-all",
            "hover:bg-primary/10 hover:text-primary",
            "focus:outline-none focus:ring-2 focus:ring-primary/50"
          )}
        >
          {unicodeMap[piece]}
        </button>
      ))}
    </div>
  );
}
