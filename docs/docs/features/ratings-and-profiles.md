---
sidebar_position: 5
title: Ratings and profiles
---

# Ratings, profiles and replays

Ratings, profiles and history are computed by the [backend](../architecture/backend.md)
from indexed on-chain events. They are not stored on-chain.

## Elo rating

- Everyone starts at **1200**.
- K-factor is **40** for a player's first 30 rated games, then **20**.
- Expected score: `1 / (1 + 10^((opponent - you) / 400))`.
- Every decided game is rated: wins, losses and draws, wagered or free.
  Aborted matches are not rated.

Implementation: `backend/src/services/rating.ts`, applied once per match when
the `GameEndedEvent` is ingested.

## Profiles

`/profile?address=<wallet>` shows:

- rating chart and current rating
- record (wins, losses, draws) and results by colour
- how games end (checkmate, timeout, resignation, …) for wins and losses
- favourite openings: White's first move, and Black's reply to it
- paginated game list linking to replays

Players can set a display name (max 20 characters, unique), a short bio and an
avatar. Edits are authorized by signing a one-time challenge message with the
wallet (`GET …/profile/challenge`, then `POST …/profile`). No transaction or
fee is needed.

## Ladder

`/leaderboard` ranks players by rating, wins, win rate or games played, and
lists the top move predictors by points.

## Replay

`/review?id=<match>` replays a finished game from the indexed move list
(`GET /api/matches/:id/history`), which stores the FEN after each move. Use the
controls or arrow keys to step through, or link to a position with `&ply=<n>`.
