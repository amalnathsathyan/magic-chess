# Live move predictions

Spectators can predict the **next move** — or any of the next ten — in a live
game, staking **play points** (no SOL or tokens). It's the live companion to
the on-chain outcome pool described in [prediction-market](./prediction-market.md).

## Flow

1. A spectator opens a live game (`/spectate?id=…`, or "Watch & predict" in the
   arena) and signs one free message to start predicting. New wallets start
   with 1,000 points; a wallet below 50 points with nothing open is refilled to
   500 once a day.
2. They pick a ply (Next, +2, +3, …). For the next move the UI lists only
   legal moves; further ahead they type SAN (`Nf3`, `exd5`, `O-O`).
3. When the move confirms on the MagicBlock ER, the market for that ply locks.
4. The backend indexer reads the verified `MoveMadeEvent`, converts it to SAN
   from the previous position, and settles the ply.

## Integrity rules

| Rule | Where |
|---|---|
| A prediction for ply *N* is accepted only while the **live** match account (read from its ER at request time) shows fewer than *N* plies played. | `MovePredictionService.placeBet` |
| Anything recorded at or after the move's block time is refunded, never paid. | `settleBets` (uses `moves.confirmed_at`) |
| Players can't predict their own match. | `placeBet` (index + chain players) |
| One prediction per wallet per ply; cancellable until locked. | `move_bets` unique key, `cancelBet` |
| Parimutuel per ply: winners split losers' stakes pro rata (floored). If nobody guessed right, or everyone did, all stakes are refunded. | `settleBets` |
| If the game ends before ply *N*, its market is voided and refunded. | `onGameEnded` |

## API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/predictions/challenge?wallet=` | — |
| POST | `/api/predictions/session` `{wallet, issuedAt, signature}` | wallet signature |
| GET | `/api/predictions/me` | Bearer |
| GET | `/api/predictions/leaderboard` | — |
| GET | `/api/matches/:matchId/predictions` | optional Bearer (adds `myBets`) |
| POST | `/api/matches/:matchId/predictions` `{ply, san, stake}` | Bearer |
| DELETE | `/api/matches/:matchId/predictions/:ply` | Bearer |

Realtime: the match's SSE stream (`/api/realtime/matches/:id/events`) carries
`prediction.market` (full public snapshot) and `prediction.settled` events.

## Why points, not tokens

While a match is delegated, the base-layer copy of the match account is stale
and token transfers can't happen on the ER, so the program can't enforce
"locked once the move confirms" for token bets without a redesign (ER-side
escrow or commit-gated markets). Points let the feature ship with
chain-authoritative locking today; on-chain move markets can reuse the same
ply/lock model later.
