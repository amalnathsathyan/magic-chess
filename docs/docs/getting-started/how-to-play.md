---
sidebar_position: 1
title: How to play
---

# How to play on ZUG Arena

[ZUG Arena](https://arena.chessmagic.workers.dev) is the web app for Magic
Chess. It runs on Solana **devnet**, so any wager uses devnet tokens.

## 1. Sign in

Press **Sign in** and pick email, a social account, or an external Solana
wallet (Phantom, Solflare, Backpack, or WalletConnect).

- **Email or social login** creates a Privy embedded wallet for you. Gameplay
  transactions (moves, timeout claims, finalizing) are signed without a popup,
  and a backend fee payer covers network fees.
- **External wallets** approve each base-layer transaction in the wallet as
  usual. Moves still go through a session key, so there are no popups during
  the game.

## 2. Create or join a match

Open the **Arena**.

- **Create a match.** Pick a time control and a wager.
  - *Time control* is the limit **per move**: Bullet 1 min, Blitz 3 min, Rapid
    10 min. If the player to move goes over, the opponent can claim the win.
  - *Wager* is any SPL token in your wallet, or a custom mint. An amount of `0`
    is a free match. Your wager goes into the match escrow right away.
  - The creator plays White. Share the invite link (`/play?id=<match-id>`).
- **Join a match.** Pick an open match from the lobby or open an invite link.
  You deposit the same amount in the same token. Joining also turns on instant
  moves for you and moves the game onto the MagicBlock rollup, all with one
  approval.
- **Cancel.** Until someone joins, the creator can cancel and get the wager back.

## 3. Play

Drag or tap pieces to move. Every move is checked by the on-chain engine. An
illegal move is rejected and the board snaps back.

- The first time you move in a match, the app asks once to enable **instant
  moves**. That registers a session key for this match (valid for 24 hours). It
  is stored in your browser and signs every later move.
- The clock above the board counts down the **current move's** time limit.
- **Resign** ends the game in your opponent's favour.

## 4. Game over

The banner above the board says who won and why: checkmate, resignation,
timeout, stalemate, threefold repetition, fifty-move rule or insufficient
material.

- **Timeout.** When the side to move runs out of time, both players see it.
  Embedded wallets claim the win automatically. External wallets get a
  **Claim timeout win** button.
- **Finalize and settle payout.** After the game ends, press this to move the
  match back to Solana and pay out the escrow:
  - Winner: the whole pot minus the platform fee (1% on ZUG Arena).
  - Draw: the pot minus the fee, split evenly.
  - Free match: nothing to pay; finalizing only records the result.

Automatic settlement through MagicBlock's task scheduler is turned off for
now, which is why these two steps need a press. See the [Roadmap](../roadmap.md).

## Watch, predict and review

- **Spectate** any live game from the Arena, or open `/spectate?id=<match-id>`.
- **Predict moves.** Spectators sign one free message, then stake play points
  on the next moves. Points only, no tokens. See [Move predictions](../features/move-predictions.md).
- **Review.** Finished games open in a replay view with move-by-move controls.
- **Profile and Ladder.** Your profile shows your Elo rating, record, results
  by colour, how your games end and favourite openings. The Ladder ranks
  players and top predictors.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| "Confirming transaction…" stays up | Devnet can be slow. Wait 30 s and refresh. The match state lives on-chain, so a refresh is safe. |
| Not enough tokens to join | Get devnet SOL from [faucet.solana.com](https://faucet.solana.com). The app wraps SOL into WSOL for you. |
| No sound on a phone | Tap the board once. Mobile browsers only allow sound after a tap. |
| Something else | [Open an issue](https://github.com/amalnathsathyan/magic-chess/issues/new/choose) with the match ID. |
