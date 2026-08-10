"use client";

import { useEffect } from "react";
import { EventParser } from "@anchor-lang/core";
import {
  findChessMatchPda,
  resolveAccountRuntime,
} from "@magic-chess/sdk";
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { toast } from "sonner";
import { magicBlockTxUrl } from "@/lib/explorer";

const POLL_MILLISECONDS = 2_500;
const MAX_SEEN_SIGNATURES = 64;

export function useMoveTransactionNotifications(input: {
  matchId: string;
  enabled: boolean;
  onMove: () => void;
}) {
  const client = useMagicChessClient();

  useEffect(() => {
    if (!input.enabled) return;
    let stopped = false;
    let subscription: number | null = null;
    let pollId: number | null = null;
    let retryId: number | null = null;
    let scanning = false;
    let rerun = false;
    const seen = new Set<string>();
    const seenOrder: string[] = [];
    const [matchPda] = findChessMatchPda(input.matchId, client.programId);

    const remember = (signature: string) => {
      if (seen.has(signature)) return false;
      seen.add(signature);
      seenOrder.push(signature);
      while (seenOrder.length > MAX_SEEN_SIGNATURES) {
        seen.delete(seenOrder.shift()!);
      }
      return true;
    };

    const connect = async () => {
      try {
        const runtime = await resolveAccountRuntime(
          client.program.provider.connection,
          matchPda,
          client.programId,
          client.routerEndpoint
        );
        if (stopped || !runtime || runtime.runtime !== "ephemeral") return;
        const connection = runtime.connection;
        const rpcEndpoint = connection.rpcEndpoint;
        const parser = new EventParser(client.programId, client.program.coder);

        const isMoveTransaction = async (signature: string) => {
          const transaction = await connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          if (transaction?.meta?.err || !transaction?.meta?.logMessages) return null;
          for (const event of parser.parseLogs(transaction.meta.logMessages)) {
            if (event.name !== "MoveMadeEvent") continue;
            const data = event.data as { matchId?: string; algebraicMove?: string };
            if (data.matchId === input.matchId) return data.algebraicMove ?? "move";
          }
          return null;
        };

        const emitIfMove = async (signature: string) => {
          if (!remember(signature)) return;
          const move = await isMoveTransaction(signature).catch(() => null);
          if (!move || stopped) return;
          const href = magicBlockTxUrl(signature, rpcEndpoint);
          toast.success(`Move confirmed: ${move}`, {
            id: `move-${signature}`,
            description: "Confirmed on the MagicBlock ephemeral rollup.",
            action: {
              label: "Explorer",
              onClick: () => window.open(href, "_blank", "noopener,noreferrer"),
            },
          });
          input.onMove();
        };

        const scan = async (silentBaseline = false) => {
          if (scanning) {
            rerun = true;
            return;
          }
          scanning = true;
          try {
            const signatures = await connection.getSignaturesForAddress(
              matchPda,
              { limit: 12 },
              "confirmed"
            );
            if (silentBaseline) {
              signatures.forEach(({ signature }) => remember(signature));
              return;
            }
            for (const { signature, err } of [...signatures].reverse()) {
              if (!err) await emitIfMove(signature);
            }
          } finally {
            scanning = false;
            if (rerun && !stopped) {
              rerun = false;
              void scan();
            }
          }
        };

        // Seed without replaying historical moves, subscribe, then immediately
        // catch up to close the baseline/subscription race.
        await scan(true);
        if (stopped) return;
        subscription = connection.onLogs(
          matchPda,
          ({ signature, err }) => {
            if (!err) void emitIfMove(signature);
          },
          "confirmed"
        );
        await scan();
        pollId = window.setInterval(() => void scan(), POLL_MILLISECONDS);

        return () => {
          if (subscription !== null) {
            void connection.removeOnLogsListener(subscription).catch(() => undefined);
          }
        };
      } catch {
        if (!stopped) retryId = window.setTimeout(() => void connect(), 3_000);
      }
    };

    let disconnect: (() => void) | undefined;
    void connect().then((cleanup) => {
      disconnect = cleanup;
    });
    return () => {
      stopped = true;
      disconnect?.();
      if (pollId !== null) window.clearInterval(pollId);
      if (retryId !== null) window.clearTimeout(retryId);
    };
  }, [client, input.enabled, input.matchId, input.onMove]);
}
