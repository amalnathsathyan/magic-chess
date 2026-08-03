"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { ChessClock } from "@/components/chess/ChessClock";
import { MoveList } from "@/components/chess/MoveList";
import { CapturedPieces } from "@/components/chess/CapturedPieces";
import { GameStatus } from "@/components/chess/GameStatus";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { PlayerCard } from "@/components/chess/PlayerCard";
import { BoardControls } from "@/components/chess/BoardControls";
import { TransactionStatus } from "@/components/shared/TransactionStatus";
import type { Square } from "chess.js";
import { Chess } from "chess.js";
import { sounds } from "@/lib/sounds";
// @ts-ignore
import { useMatch, useMatchEvents, useMagicChessClient } from "@magic-chess/sdk/react";
// @ts-ignore
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

interface PlayPageProps {
  params: Promise<{ matchId: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  const { matchId } = use(params);
  const router = useRouter();
  
  // SDK Hooks
  let client: any = null;
  let matchContext: any = { match: null, loading: false, refetch: async () => {} };
  
  try {
    client = useMagicChessClient();
    matchContext = useMatch(matchId);
  } catch (e) {
    // Graceful fallback when no provider
  }

  const { match, loading, refetch } = matchContext;

  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [moves, setMoves] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [promotionSquare, setPromotionSquare] = useState<Square | null>(null);

  // Sync with on-chain match
  useEffect(() => {
    if (match) {
      // Very basic sync - if there's a custom FEN stored we'd set it
      // But typically we parse moves to get FEN or just rely on events
      // For this scaffold, we'll wait for events or initial FEN if provided.
    }
  }, [match]);

  // Subscribe to live move events
  let unsubscribeEvents = () => {};
  try {
    unsubscribeEvents = useMatchEvents(matchId, {
      onMoveMade: (event: any) => {
        setFen(event.boardFen);
        if (event.algebraicMove) {
          setMoves((prev) => [...prev, event.algebraicMove]);
          setCurrentMoveIndex((prev) => prev + 1);
        }
        sounds.playMoveSound(event.algebraicMove || "move");
      },
      onGameEnded: (event: any) => {
        sounds.play("game_end");
        toast.info(`Game ended! ${event.status}`);
      }
    });
  } catch (e) {}

  useEffect(() => {
    sounds.play("game_start");
    return () => {
      sounds.destroy();
      unsubscribeEvents();
    };
  }, [unsubscribeEvents]);

  // Clock state (mock — 5 minutes each)
  const [whiteTime] = useState(300_000);
  const [blackTime] = useState(300_000);
  const [activeSide] = useState<"white" | "black" | null>("white");

  // Tx status (mock)
  const [txStatus] = useState<"idle" | "submitting" | "confirming" | "success" | "error">("idle");

  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      try {
        const game = new Chess(fen);

        // Check for promotion
        const piece = game.get(sourceSquare as never);
        if (
          piece &&
          piece.type === "p" &&
          ((piece.color === "w" && targetSquare[1] === "8") ||
            (piece.color === "b" && targetSquare[1] === "1"))
        ) {
          setPromotionSquare(targetSquare);
          return false;
        }

        const move = game.move({
          from: sourceSquare,
          to: targetSquare,
        });

        if (move) {
          // Optimistic update
          setFen(game.fen());
          setMoves((prev) => [...prev, move.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: sourceSquare, to: targetSquare });
          
          if (game.isGameOver()) {
            sounds.play("game_end");
          } else {
            sounds.playMoveSound(move.san);
          }
          
          // Trigger on-chain move here if client is available
          if (client) {
            // e.g. client.makeMove({ matchId, move: ... })
          }

          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [fen, client, matchId]
  );

  const handlePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n") => {
      if (!promotionSquare) return;

      try {
        const game = new Chess(fen);
        const legalMoves = game.moves({ verbose: true });
        const promoMove = legalMoves.find(
          (m) => m.to === promotionSquare && m.promotion
        );

        if (promoMove) {
          game.move({ from: promoMove.from as Square, to: promotionSquare, promotion: piece });
          setFen(game.fen());
          setMoves((prev) => [...prev, promoMove.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: promoMove.from as Square, to: promotionSquare });
          
          if (game.isGameOver()) {
            sounds.play("game_end");
          } else {
            sounds.playMoveSound(promoMove.san);
          }
          
          // Trigger on-chain move here if client is available
          if (client) {
             // client.makeMove({ matchId, move: ... })
          }
        }
      } catch {
        // Invalid move
      }

      setPromotionSquare(null);
    },
    [fen, promotionSquare, client, matchId]
  );

  // Determine game result
  const game = new Chess(fen);
  const isGameOver = game.isGameOver();
  const turn = game.turn();

  let result: "in_progress" | "checkmate" | "stalemate" | "draw" = "in_progress";
  let winner: "white" | "black" | null = null;

  if (game.isCheckmate()) {
    result = "checkmate";
    winner = turn === "w" ? "black" : "white";
  } else if (game.isStalemate()) {
    result = "stalemate";
  } else if (game.isDraw()) {
    result = "draw";
  }

  // Calculate captured pieces
  const calculateCaptured = () => {
    const startCounts: Record<string, number> = {
      p: 8, n: 2, b: 2, r: 2, q: 1,
      P: 8, N: 2, B: 2, R: 2, Q: 1,
    };
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const char = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
          if (startCounts[char] !== undefined) startCounts[char]--;
        }
      }
    }
    
    const wCaptured: string[] = []; // Black pieces captured by White
    const bCaptured: string[] = []; // White pieces captured by Black

    Object.entries(startCounts).forEach(([char, count]) => {
      for (let i = 0; i < count; i++) {
        if (char === char.toLowerCase()) {
          wCaptured.push(char); // Black piece
        } else {
          bCaptured.push(char.toLowerCase()); // White piece
        }
      }
    });
    return { wCaptured, bCaptured };
  };

  const { wCaptured, bCaptured } = calculateCaptured();

  return (
    <div className="min-h-screen bg-background">
      <GameStatus
        result={result}
        winner={winner}
        turn={turn === "w" ? "white" : "black"}
      />
      
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/arena")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Arena
            </button>
            <span className="hidden text-sm text-muted sm:inline">|</span>
            <span className="hidden font-mono text-xs text-muted sm:inline">
              Match ID: {matchId}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/play/${matchId}/spectate`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              Spectate
            </Link>
            <TransactionStatus status={txStatus} />
          </div>
        </div>
      </header>

      {/* Game layout */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          {/* Left column: board */}
          <div className="flex flex-col items-center gap-4">
            {/* Black player info + clock + captured pieces */}
            <div className="flex w-full max-w-[560px] flex-col gap-2">
              <div className="flex items-end justify-between">
                <PlayerCard
                  side="black"
                  isActive={turn === "b" && !isGameOver}
                  address="8xTk...9aF1"
                  wagerAmount={10}
                  className="flex-1 mr-4"
                />
                <ChessClock
                  whiteTime={whiteTime}
                  blackTime={blackTime}
                  activeSide={activeSide}
                  isPaused={isGameOver}
                />
              </div>
              <CapturedPieces
                whiteCaptured={wCaptured}
                blackCaptured={bCaptured}
                side="white"
              />
            </div>

            {/* Chess board */}
            <div className="relative">
              <ChessBoard
                fen={fen}
                orientation="white"
                boardWidth={560}
                onPieceDrop={handlePieceDrop}
                lastMove={lastMove}
              />
              {promotionSquare && (
                <PromotionDialog
                  isOpen={!!promotionSquare}
                  color={turn === "w" ? "white" : "black"}
                  onSelect={handlePromotion}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                />
              )}
            </div>
            
            <BoardControls 
              onFlipBoard={() => {}}
              onOfferDraw={() => {}}
              onResign={() => {}}
              className="w-full max-w-[560px]"
            />

            {/* White player info + captured pieces */}
            <div className="flex w-full max-w-[560px] flex-col gap-2">
              <CapturedPieces
                whiteCaptured={wCaptured}
                blackCaptured={bCaptured}
                side="black"
              />
              <PlayerCard
                side="white"
                isActive={turn === "w" && !isGameOver}
                address="7xYk...2bR9"
                wagerAmount={10}
              />
            </div>
          </div>

          {/* Right column: move list */}
          <div className="flex flex-col gap-4">
            <MoveList
              moves={moves}
              fen={fen}
              currentMoveIndex={currentMoveIndex}
              className="flex-1 min-h-[400px]"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
