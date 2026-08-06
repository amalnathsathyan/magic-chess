import { useState, useEffect } from "react";
// @ts-ignore
import { useMagicChessClient } from "@magic-chess/sdk/react";
import { findPredictionPoolPda } from "@magic-chess/sdk";

export function usePredictionPool(matchId: string) {
  const client = useMagicChessClient();
  const [pool, setPool] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client || !matchId) {
      setLoading(false);
      return;
    }

    const fetchPool = async () => {
      try {
        const [poolPda] = findPredictionPoolPda(matchId, client.programId);
        const account = await client.program.account.predictionPool.fetch(poolPda);
        setPool({
          totalBetOnWhite: account.totalBetOnWhite.toNumber(),
          totalBetOnBlack: account.totalBetOnBlack.toNumber(),
          totalBetOnDraw: account.totalBetOnDraw.toNumber(),
          platformFeeBps: account.platformFeeBps,
          settlementProcessed: account.settlementProcessed,
        });
      } catch (err) {
        // Normal if pool doesn't exist yet
        setPool(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPool();
    const interval = setInterval(fetchPool, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [client, matchId]);

  return { pool, loading };
}
