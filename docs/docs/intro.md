---
slug: /
sidebar_position: 1
title: Introduction
---

# Magic Chess

Magic Chess is an open-source chess platform where **every move is validated
on-chain**. A Solana program enforces the full FIDE rulebook. Games run on a
[MagicBlock Ephemeral Rollup](https://docs.magicblock.gg) so moves confirm in
milliseconds and cost players nothing. Wagers sit in program-owned escrow on
Solana and pay out automatically to the winner.

**ZUG Arena** is the reference app built on Magic Chess:
[arena.chessmagic.workers.dev](https://arena.chessmagic.workers.dev).

:::caution Devnet only
The program runs on **Solana devnet** and has not had a third-party audit.
Wagers use devnet tokens. Do not use it with real funds.
:::

## What you get

| | |
| --- | --- |
| **Full rules on-chain** | Legal moves, check, checkmate, stalemate, castling, en passant, promotion, fifty-move rule, threefold repetition and insufficient material. See [Chess engine](./architecture/chess-engine.md). |
| **Instant, free moves** | The match account is delegated to a MagicBlock rollup. A per-match session key signs moves, so there are no wallet popups. See [MagicBlock integration](./architecture/magicblock.md). |
| **Escrowed wagers** | Both players deposit the same SPL token amount (or play free). The winner takes the pot minus a platform fee; a draw splits it. See [Wagers and settlement](./features/wagers-and-settlement.md). |
| **Gasless onboarding** | Players sign in with email, social or a wallet through Privy. A backend fee payer sponsors base-layer transactions. See [Gas sponsorship](./features/gas-sponsorship.md). |
| **Spectating and predictions** | Anyone can watch a live game and predict upcoming moves for play points. See [Move predictions](./features/move-predictions.md). |
| **Ratings and replays** | Elo ratings, player profiles, match history and move-by-move replay. See [Ratings and profiles](./features/ratings-and-profiles.md). |
| **TypeScript SDK** | `@magic-chess/sdk` wraps every instruction, PDA and rollup routing. See [SDK reference](./build/sdk.md). |

## How a game works

1. **Create.** White calls `initialize_match` on Solana with a wager, a
   per-move time limit and a token mint. The wager moves into the match escrow.
2. **Join.** Black calls `join_match` with the same wager. In the same
   transaction the app registers Black's session key and delegates the match
   to the rollup.
3. **Play.** Both sides send `make_move` to the rollup. The program rejects
   every illegal move and detects the end of the game.
4. **Finish.** The game ends by checkmate, draw, resignation or a timeout claim.
   The match is committed and undelegated back to Solana.
5. **Settle.** `process_match_settlement` pays the escrow out on Solana and
   closes it.

## Project status

| Component | Status |
| --- | --- |
| `magic_chess` program | Deployed on devnet at `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| ZUG Arena frontend | Live on Cloudflare Workers |
| Backend (indexer, realtime, sponsor) | Live on Render with Supabase Postgres |
| SDK | Used by the app from source. Not published to npm yet |
| Automatic settlement (crank) | Disabled. Players claim timeouts and finalize from the app. See [Roadmap](./roadmap.md) |

## Where to go next

- **Players:** [How to play](./getting-started/how-to-play.md)
- **Contributors:** [Local setup](./getting-started/local-setup.md), then [Architecture overview](./architecture/overview.md)
- **Integrators and bot authors:** [SDK reference](./build/sdk.md) and [Building agents](./build/agents.md)
- **Operators:** [Deployment](./deployment.md)

Source code: [github.com/amalnathsathyan/magic-chess](https://github.com/amalnathsathyan/magic-chess) (MIT).
