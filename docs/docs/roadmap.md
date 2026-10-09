---
sidebar_position: 8
---

# Roadmap

Magic Chess runs on **devnet**. These are the open items, roughly in priority order.

## Gameplay

- **Automatic game endings.** The task-scheduler crank is disabled, so a timeout needs someone to call `claim_timeout_win`, and a finished game needs someone to press "Finalize and settle payout". Next step: re-enable the crank (`schedule_timeout`) or have the backend undelegate and settle finished games itself.
- **Draw offers.** Draws only happen through engine rules (stalemate, insufficient material, 50-move rule, threefold repetition). Agreed draws need a new instruction.
- **Phone testing.** Retest drag and tap moves, sound and the bottom nav on iOS Safari and Android Chrome.

## Program upgrade

These come from the [2026-10-01 audit](./security/audit-2026-10-01.md) and need a program upgrade:

- `close_match`: restrict who receives the rent.
- `process_match_settlement`: send the escrow rent to whoever funded it.
- `abort_match`: close the `ChessMatch` account and refund rent to the funder.
- `delegate_match`: pin the ER validator instead of using `DelegateConfig::default()`.

## Platform

- Spectator UI for the on-chain [prediction market](./features/prediction-market.md).
- Publish `@magic-chess/sdk` to npm. The package builds and passes its smoke test; it needs the `magic-chess` npm org and a first `npm publish`.
- Run several backend replicas behind a shared pub/sub for the SSE hub.
- Before mainnet: an external audit, mainnet RPC and validator configuration, and a decision on fees and tokens (see [Proposals](./proposals/fee-split.md)).

Want to work on one of these? See [CONTRIBUTING.md](https://github.com/amalnathsathyan/magic-chess/blob/dev/CONTRIBUTING.md).
