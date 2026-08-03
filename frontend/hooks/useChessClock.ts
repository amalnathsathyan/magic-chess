"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ClockConfig {
  initialTimeMs: number; // Total time per player in ms
  incrementMs: number; // Increment per move in ms
}

interface UseChessClockReturn {
  whiteTime: number;
  blackTime: number;
  activeSide: "white" | "black" | null;
  isPaused: boolean;
  startClock: () => void;
  pauseClock: () => void;
  resetClock: (config: ClockConfig) => void;
  toggleSide: () => void;
  /** Call when a move is made — increments the side that just moved and switches */
  onMove: (side: "white" | "black") => void;
}

export function useChessClock(config: ClockConfig): UseChessClockReturn {
  const [whiteTime, setWhiteTime] = useState(config.initialTimeMs);
  const [blackTime, setBlackTime] = useState(config.initialTimeMs);
  const [activeSide, setActiveSide] = useState<"white" | "black" | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const incrementRef = useRef(config.incrementMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 100ms while clock is active
  useEffect(() => {
    if (activeSide === null || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (activeSide === "white") {
        setWhiteTime((prev) => {
          if (prev <= 0) {
            setActiveSide(null);
            return 0;
          }
          return prev - 100;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 0) {
            setActiveSide(null);
            return 0;
          }
          return prev - 100;
        });
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSide, isPaused]);

  const startClock = useCallback(() => {
    setIsPaused(false);
    if (activeSide === null) setActiveSide("white");
  }, [activeSide]);

  const pauseClock = useCallback(() => {
    setIsPaused(true);
  }, []);

  const toggleSide = useCallback(() => {
    setActiveSide((prev) => (prev === "white" ? "black" : "white"));
  }, []);

  const onMove = useCallback(
    (side: "white" | "black") => {
      // Add increment to the side that just moved
      if (side === "white") {
        setWhiteTime((prev) => prev + incrementRef.current);
        setActiveSide("black");
      } else {
        setBlackTime((prev) => prev + incrementRef.current);
        setActiveSide("white");
      }
    },
    []
  );

  const resetClock = useCallback((newConfig: ClockConfig) => {
    setWhiteTime(newConfig.initialTimeMs);
    setBlackTime(newConfig.initialTimeMs);
    setActiveSide(null);
    setIsPaused(true);
    incrementRef.current = newConfig.incrementMs;
  }, []);

  return {
    whiteTime,
    blackTime,
    activeSide,
    isPaused,
    startClock,
    pauseClock,
    resetClock,
    toggleSide,
    onMove,
  };
}
