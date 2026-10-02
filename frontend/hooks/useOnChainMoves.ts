"use client";

import { useEffect, useRef, useState } from "react";
import { EventParser } from "@anchor-lang/core";
import type { Connection } from "@solana/web3.js";
import { Chess, type Square } from "chess.js";
import {
  findChessMatchPda,
  resolveAccountRuntime,
} from "@magic-chess/sdk";
import { useMagicChessClient } from "@magic-chess/sdk/react";

export interface OnChainMove {
  san: string;
  from: Square;
  to: Square;
}

interface RawMove {
  slot: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotion?: "q" | "r" | "b" | "n";
}

const SIGNATURE_PAGE = 1_000;

const PROMOTIONS: Record<string, RawMove["promotion"]> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
};

function promotionFrom(piece: unknown): RawMove["promotion"] {
  if (!piece) return undefined;
  const name = typeof piece === "string" ? piece : Object.keys(piece)[0];
  return name ? PROMOTIONS[name.toLowerCase()] : undefined;
}

function square(row: number, col: number): Square {
  return `${String.fromCharCode(97 + col)}${row + 1}` as Square;
}

/** Replays the logged moves from the start position, stopping at the first gap. */
function replay(rawMoves: RawMove[]): OnChainMove[] {
  const chess = new Chess();
  const moves: OnChainMove[] = [];
  for (const raw of rawMoves) {
    const from = square(raw.fromRow, raw.fromCol);
    const to = square(raw.toRow, raw.toCol);
    try {
      const move = chess.move({ from, to, promotion: raw.promotion });
      moves.push({ san: move.san, from, to });
    } catch {
      break;
    }
  }
  return moves;
}

/**
 * Move list rebuilt from the MagicBlock rollup's own transaction history, so
 * the Moves panel never depends on the indexer database being up. Each scan
 * only fetches signatures newer than the last one it saw.
 *
 * Returns null until the first scan succeeds, or when the match isn't on a
 * rollup (before delegation, or after it settles back to Solana).
 */
export function useOnChainMoves(input: {
  matchId: string;
  enabled: boolean;
  /** Changes whenever the board changes, to trigger a rescan. */
  refreshKey: string | null;
}): OnChainMove[] | null {
  const client = useMagicChessClient();
  const [moves, setMoves] = useState<OnChainMove[] | null>(null);
  const cache = useRef<{
    matchId: string;
    connection: Connection | null;
    newestSignature: string | null;
    rawMoves: RawMove[];
  } | null>(null);
  const scanning = useRef(false);
  const rerun = useRef(false);
  const latestScan = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (cache.current?.matchId !== input.matchId) {
      cache.current = {
        matchId: input.matchId,
        connection: null,
        newestSignature: null,
        rawMoves: [],
      };
      setMoves(null);
    }
  }, [input.matchId]);

  useEffect(() => {
    if (!input.enabled || !input.matchId) return;
    const [matchPda] = findChessMatchPda(input.matchId, client.programId);
    const parser = new EventParser(client.programId, client.program.coder);

    const readMoves = async (connection: Connection, signatures: { signature: string; slot: number }[]) => {
      const found: RawMove[] = [];
      for (const { signature, slot } of signatures) {
        const transaction = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        // Not served yet: retry on the next scan rather than skip the move.
        if (!transaction) throw new Error(`Transaction ${signature} not available yet`);
        if (transaction.meta?.err || !transaction.meta?.logMessages) continue;
        for (const event of parser.parseLogs(transaction.meta.logMessages)) {
          if (event.name !== "MoveMadeEvent") continue;
          const data = event.data as {
            matchId?: string;
            fromRow: number;
            fromCol: number;
            toRow: number;
            toCol: number;
            promotionPiece?: unknown;
          };
          if (data.matchId !== input.matchId) continue;
          found.push({
            slot,
            fromRow: Number(data.fromRow),
            fromCol: Number(data.fromCol),
            toRow: Number(data.toRow),
            toCol: Number(data.toCol),
            promotion: promotionFrom(data.promotionPiece),
          });
        }
      }
      return found;
    };

    const scan = async () => {
      if (scanning.current) {
        rerun.current = true;
        return;
      }
      scanning.current = true;
      try {
        const state = cache.current;
        if (!state || state.matchId !== input.matchId) return;
        if (!state.connection) {
          const runtime = await resolveAccountRuntime(
            client.program.provider.connection,
            matchPda,
            client.programId,
            client.routerEndpoint
          );
          if (!runtime || runtime.runtime !== "ephemeral") return;
          state.connection = runtime.connection;
        }
        const connection = state.connection;

        // Newest first; page back until the last signature we already read.
        const fresh: { signature: string; slot: number }[] = [];
        let before: string | undefined;
        for (;;) {
          const page = await connection.getSignaturesForAddress(
            matchPda,
            {
              limit: SIGNATURE_PAGE,
              before,
              until: state.newestSignature ?? undefined,
            },
            "confirmed"
          );
          for (const entry of page) {
            if (!entry.err) fresh.push({ signature: entry.signature, slot: entry.slot });
          }
          if (page.length < SIGNATURE_PAGE) break;
          before = page[page.length - 1].signature;
        }
        if (fresh.length === 0 && state.newestSignature) return;

        const oldestFirst = fresh.reverse();
        const found = await readMoves(connection, oldestFirst);
        if (cache.current !== state) return;
        state.rawMoves.push(...found);
        if (oldestFirst.length > 0) {
          state.newestSignature = oldestFirst[oldestFirst.length - 1].signature;
        }
        setMoves(replay(state.rawMoves));
      } catch {
        // The database history is still used; the next board change retries.
      } finally {
        scanning.current = false;
        if (rerun.current) {
          rerun.current = false;
          void latestScan.current();
        }
      }
    };

    latestScan.current = scan;
    void scan();
  }, [client, input.enabled, input.matchId, input.refreshKey]);

  return moves;
}
