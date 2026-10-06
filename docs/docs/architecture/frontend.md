---
sidebar_position: 6
title: Frontend
---

# Frontend (ZUG Arena)

`frontend/` is a Next.js 15 app exported as static files (`out/`) and served by
a Cloudflare Worker (`_worker.js`). Styling is Tailwind CSS 4 with Radix
primitives. Auth and wallets come from Privy.

## Routes

| Route | Page |
| --- | --- |
| `/` | Landing |
| `/arena` | Lobby: open matches, live games, recent games, create-match dialog |
| `/play?id=<match>` | The game: board, clocks, move list, resign, claim timeout, finalize |
| `/spectate?id=<match>` | Live view for spectators with the move-prediction panel |
| `/review?id=<match>` | Replay of a finished game |
| `/profile?address=<pubkey>` | Rating chart, record, openings, games. Your own when omitted |
| `/leaderboard` | Ladder of players and top predictors |
| `/settings` | Wallet, sound and preferences |

Match pages read the ID from the query string because the app is a static
export. The worker redirects legacy `/play/<id>` and `/play/<id>/spectate`
links and returns a real 404 for unknown paths.

## Layout

```
app/                 # routes above
components/
  chess/             # ChessBoard, MoveList, PlayerRow, PromotionDialog, ReplayControls
  lobby/             # CreateMatchForm, MatchCard, LiveGames, RecentGames
  predictions/       # PredictionPanel
  profile/           # ProfileEditor, RatingChart
  shared/            # Providers, SolanaProgramProvider, MagicSessionProvider, Header, AuthGate
hooks/               # useMatchRealtime, useOnChainMoves, useReplay, useMovePredictions, ...
lib/                 # chess helpers, wager building, sponsor client, explorer links, sounds
```

## How it talks to the chain

- **`SolanaProgramProvider`** builds the Anchor `Program` and a
  `MagicChessClient` from the SDK around the signed-in Privy wallet. For
  embedded wallets, gameplay-only transactions (`make_move`, `set_session_key`,
  `revoke_session_key`, `commit_state`, `undelegate_match`,
  `claim_timeout_win`) sign without a popup. Everything that moves value keeps
  the approval screen.
- **Sponsored transactions.** With `NEXT_PUBLIC_SOLANA_SPONSOR_MODE=backend`,
  base-layer transactions from embedded wallets use the backend fee payer
  (`/api/transactions/sponsor`). See [Gas sponsorship](../features/gas-sponsorship.md).
- **`MagicSessionProvider`** creates and stores the per-match session key and
  builds the `set_session_key` instruction.
- **Live board.** `useOnChainMoves` subscribes to the match account on its
  rollup through `client.subscribeToMatch`, so the board updates the moment a
  move lands. `useMatchRealtime` adds presence, the shared clock and
  notifications from the backend's SSE stream.
- **Wagers.** `lib/wager.ts` creates the player's token account if needed and
  wraps SOL into WSOL in the same transaction as create or join.

## Configuration

Build-time variables (inlined by Next.js). See `frontend/.env.example`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app |
| `NEXT_PUBLIC_RPC_ENDPOINT`, `NEXT_PUBLIC_RPC_WS_ENDPOINT` | Base-layer RPC |
| `NEXT_PUBLIC_MAGICBLOCK_ROUTER` | MagicBlock router |
| `NEXT_PUBLIC_PROGRAM_ID` | `magic_chess` program |
| `NEXT_PUBLIC_WAGER_MINT`, `_SYMBOL`, `_DECIMALS` | Default wager token |
| `NEXT_PUBLIC_PLATFORM_FEE_BPS`, `NEXT_PUBLIC_PLATFORM_FEE_WALLET` | Fee terms used when creating matches |
| `NEXT_PUBLIC_API_URL` | Backend base URL |
| `NEXT_PUBLIC_SOLANA_SPONSOR_MODE`, `NEXT_PUBLIC_SOLANA_FEE_PAYER_ADDRESS` | Gas sponsoring (public key only) |

`frontend/.env.production` holds the public devnet values used by the
Cloudflare build.
