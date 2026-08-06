"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, User } from "lucide-react";
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
import { useChessClock } from "@/hooks/useChessClock";
import { useAtomValue } from "jotai";
import { shortAddressAtom } from "@/store/wallet";
import { useMagicBlock } from "@/hooks/useMagicBlock";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { PredictionBars } from "@/components/chess/PredictionBars";
import { usePredictionPool } from "@/hooks/usePredictionPool";
interface PlayPageProps {
  params: Promise<{ matchId: string }>;
}

export default function PlayPage({ params }: PlayPageProps) {
  const { matchId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const { pool, loading: poolLoading } = usePredictionPool(matchId);

  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [moves, setMoves] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [promotionSquare, setPromotionSquare] = useState<Square | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [resigned, setResigned] = useState<"white" | "black" | null>(null);
  const [firstMoveMade, setFirstMoveMade] = useState(false);

  // Read time control from URL search params
  const timeParam = searchParams.get("time");
  const incrementParam = searchParams.get("increment");
  const initialTimeMs = timeParam ? parseInt(timeParam, 10) : 300_000; // 5 min default
  const incrementMs = incrementParam ? parseInt(incrementParam, 10) : 2000; // 2 sec default

  // Wire the chess clock hook
  const clock = useChessClock({
    initialTimeMs,
    incrementMs,
  });

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

  // Pause clock when game is over or someone resigned
  useEffect(() => {
    if (resigned) {
      clock.pauseClock();
    }
  }, [resigned, clock]);

  const { submitMove } = useMagicBlock();
  const [txStatus, setTxStatus] = useState<"idle" | "submitting" | "confirming" | "success" | "error">("idle");
  const [txSignature, setTxSignature] = useState<string | undefined>();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  const handleJoinMatch = async () => {
    if (!client || !match) return;
    try {
      setTxStatus("submitting");
      setTxSignature(undefined);
      const dummyPubkey = new PublicKey("11111111111111111111111111111111");
      const playerTokenAccount = wallet?.address ? new PublicKey(wallet.address) : dummyPubkey;

      const res = await client.joinMatch({
        matchId,
        betAmount: match.betAmount,
        playerTokenAccount,
      });
      setTxSignature(res.signature);
      setTxStatus("success");
      toast.success("Joined match!");
      setTimeout(() => setTxStatus("idle"), 5000);
      refetch();
    } catch (e) {
      console.error(e);
      setTxStatus("error");
      toast.error("Failed to join match");
      setTimeout(() => setTxStatus("idle"), 5000);
    }
  };

  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      // Don't allow moves after resignation or game over
      if (resigned) return false;

      try {
        const game = new Chess(fen);

        if (game.isGameOver()) return false;

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

        // Enforce turn — only allow the current side to move
        const turnColor = game.turn() === "w" ? "white" : "black";
        if (piece && piece.color !== game.turn()) {
          return false;
        }

        const move = game.move({
          from: sourceSquare,
          to: targetSquare,
        });

        if (move) {
          // Start clock on first move
          if (!firstMoveMade) {
            setFirstMoveMade(true);
            clock.startClock();
          }

          // Optimistic update
          setFen(game.fen());
          setMoves((prev) => [...prev, move.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: sourceSquare, to: targetSquare });

          // Notify clock: increment the side that just moved and switch
          clock.onMove(turnColor);

          if (game.isGameOver()) {
            sounds.play("game_end");
            clock.pauseClock();
          } else {
            sounds.playMoveSound(move.san);
          }

          // Trigger on-chain move here if client is available
          if (client && wallet && !matchId.startsWith("demo-")) {
            setTxStatus("submitting");
            setTxSignature(undefined);
            submitMove(matchId, sourceSquare, targetSquare).then(sig => {
              if (sig) {
                setTxSignature(sig);
                setTxStatus("success");
                toast.success("Move submitted");
                setTimeout(() => setTxStatus("idle"), 5000);
              } else {
                setTxStatus("error");
              }
            }).catch(e => {
              console.error(e);
              setTxStatus("error");
              toast.error("Failed to submit move on-chain");
              setTimeout(() => setTxStatus("idle"), 5000);
            });
          }

          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [fen, client, matchId, resigned, firstMoveMade, clock]
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
          const turnColor = game.turn() === "w" ? "white" : "black";

          game.move({ from: promoMove.from as Square, to: promotionSquare, promotion: piece });
          setFen(game.fen());
          setMoves((prev) => [...prev, promoMove.san]);
          setCurrentMoveIndex((prev) => prev + 1);
          setLastMove({ from: promoMove.from as Square, to: promotionSquare });

          // Notify clock: increment the side that just moved and switch
          clock.onMove(turnColor);

          if (game.isGameOver()) {
            sounds.play("game_end");
            clock.pauseClock();
          } else {
            sounds.playMoveSound(promoMove.san);
          }

          // Trigger on-chain move here if client is available
          if (client && wallet && !matchId.startsWith("demo-")) {
             setTxStatus("submitting");
             setTxSignature(undefined);
             submitMove(matchId, promoMove.from, promotionSquare, piece).then(sig => {
               if (sig) {
                 setTxSignature(sig);
                 setTxStatus("success");
                 toast.success("Move submitted");
                 setTimeout(() => setTxStatus("idle"), 5000);
               } else {
                 setTxStatus("error");
               }
             }).catch(e => {
               console.error(e);
               setTxStatus("error");
               toast.error("Failed to submit move on-chain");
               setTimeout(() => setTxStatus("idle"), 5000);
             });
          }
        }
      } catch {
        // Invalid move
      }

      setPromotionSquare(null);
    },
    [fen, promotionSquare, client, matchId, clock]
  );

  // Determine game result
  const game = new Chess(fen);
  const isGameOver = game.isGameOver() || resigned !== null;
  const turn = game.turn();

  let result: "in_progress" | "checkmate" | "stalemate" | "draw" | "resign" = "in_progress";
  let winner: "white" | "black" | null = null;

  if (resigned) {
    result = "resign";
    winner = resigned === "white" ? "black" : "white";
  } else if (game.isCheckmate()) {
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

  const shortAddress = useAtomValue(shortAddressAtom);

  // Build player labels: show "You (White)" / "Opponent (Black)" for local demo,
  // or truncated pubkey if wallet is connected
  const getPlayerLabel = (side: "white" | "black"): string => {
    if (side === orientation) {
      if (shortAddress) return `${shortAddress} (${side === "white" ? "White" : "Black"})`;
      return `You (${side === "white" ? "White" : "Black"})`;
    }
    return `Opponent (${side === "white" ? "White" : "Black"})`;
  };

  const calculateMaterialAdvantage = (side: "white" | "black") => {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let white = 0, black = 0;
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          if (piece.color === 'w') white += values[piece.type] || 0;
          else black += values[piece.type] || 0;
        }
      }
    }
    const diff = side === "white" ? white - black : black - white;
    return diff > 0 ? `+${diff}` : null;
  };

  const renderPlayerHeader = (side: "white" | "black") => {
    const isWhite = side === "white";
    const isActive = turn === (isWhite ? "w" : "b") && !isGameOver;
    const time = isWhite ? clock.whiteTime : clock.blackTime;
    const adv = calculateMaterialAdvantage(side);
    
    return (
      <div className="flex w-full max-w-[560px] items-center justify-between mb-3 mt-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary border border-border overflow-hidden">
             <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{getPlayerLabel(side)}</span>
            {adv && <span className="text-xs font-medium text-emerald-500">{adv}</span>}
          </div>
        </div>
        <ChessClock time={time} isActive={isActive} />
      </div>
    );
  };

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
            {match && (
              <>
                <span className="hidden text-sm text-muted sm:inline">|</span>
                <span className="hidden font-mono text-xs text-muted sm:inline">
                  Wager: {Number(match.betAmount) / 1e9} per player
                </span>
                <span className="hidden text-sm text-muted sm:inline">|</span>
                <span className="hidden font-mono text-xs text-muted sm:inline">
                  Mint: {match.bettingTokenMint?.toBase58() === "11111111111111111111111111111111" ? "Native SOL" : (match.bettingTokenMint?.toBase58().slice(0, 4) + "..." + match.bettingTokenMint?.toBase58().slice(-4))}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/play/${matchId}/spectate`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              Spectate
            </Link>
            <div className="absolute top-16 right-4 z-50">
               <TransactionStatus status={txStatus} signature={txSignature} onDismiss={() => setTxStatus("idle")} />
            </div>
          </div>
        </div>
      </header>

      {/* Game layout */}
      <div className="mx-auto max-w-6xl px-4 py-6 relative">
        {match?.state?.joinable && authenticated && wallet?.address !== match?.playerOne?.toBase58() && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="glass-card p-6 flex flex-col items-center gap-4 text-center">
              <h2 className="font-heading text-xl font-bold">Match is Open</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                Wager: {Number(match.betAmount) / 1e9} SOL. Join to play as Black.
              </p>
              <button
                onClick={handleJoinMatch}
                disabled={txStatus === "submitting" || txStatus === "confirming"}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {txStatus === "submitting" || txStatus === "confirming" ? "Joining..." : "Join Match"}
              </button>
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          {/* Left column: board */}
          <div className="flex flex-col items-center justify-center w-full">
            {/* Top Player */}
            {renderPlayerHeader(orientation === "white" ? "black" : "white")}

            {/* Chess board */}
            <div className="relative w-full max-w-[560px]">
              <ChessBoard
                fen={fen}
                orientation={orientation}
                boardWidth={560}
                onPieceDrop={handlePieceDrop}
                lastMove={lastMove}
                arePiecesDraggable={!isGameOver}
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

            {/* Board Controls */}
            <BoardControls
              onFlipBoard={() => setOrientation((prev) => prev === "white" ? "black" : "white")}
              onOfferDraw={() => {}}
              onResign={() => {
                if (!isGameOver) {
                  const currentTurn = turn === "w" ? "white" : "black";
                  setResigned(currentTurn);
                }
              }}
              className="w-full max-w-[560px] mt-4 mb-2"
            />

            {/* Bottom Player */}
            {renderPlayerHeader(orientation === "white" ? "white" : "black")}
          </div>

          {/* Right column: move list & predictions */}
          <div className="flex flex-col gap-4">
            <MoveList
              moves={moves}
              fen={fen}
              currentMoveIndex={currentMoveIndex}
              className="flex-1 min-h-[400px]"
            />

            {/* Prediction Market Panel */}
            {match && (
              <div className="glass-card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-sm font-bold text-primary">Prediction Market</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Live</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Predict the winner of this match. Parimutuel pool splits the total wagered amount among the winning predictors.
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button className="flex flex-col items-center justify-center rounded-lg border border-border bg-card/50 p-2 hover:bg-card hover:border-primary/50 transition-colors">
                    <span className="font-semibold text-sm">White</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Pool: {pool ? (pool.totalBetOnWhite / 1e9).toFixed(2) : 0} SOL
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center rounded-lg border border-border bg-card/50 p-2 hover:bg-card hover:border-accent/50 transition-colors">
                    <span className="font-semibold text-sm">Draw</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Pool: {pool ? (pool.totalBetOnDraw / 1e9).toFixed(2) : 0} SOL
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center rounded-lg border border-border bg-card/50 p-2 hover:bg-card hover:border-primary/50 transition-colors">
                    <span className="font-semibold text-sm">Black</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Pool: {pool ? (pool.totalBetOnBlack / 1e9).toFixed(2) : 0} SOL
                    </span>
                  </button>
                </div>
                
                <div className="mt-4">
                  <PredictionBars 
                    poolWhite={pool?.totalBetOnWhite || 0}
                    poolBlack={pool?.totalBetOnBlack || 0}
                    poolDraw={pool?.totalBetOnDraw || 0}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
