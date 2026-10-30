---
sidebar_position: 8
---

# Roadmap

Magic Chess runs on **devnet**. These are the open items, roughly in priority order.

## Gameplay

- **Automatic game endings.** A timeout needs someone to call `claim_timeout_win`, and a finished game needs a player to press "Collect the pot" / "Save result and pay out". Next step: let anyone call `claim_timeout_win` and `undelegate_match` once a game is over, then have the backend keeper claim, undelegate and settle. The old task-scheduler instructions were removed; see [MagicBlock](./architecture/magicblock.md).
- **Draw offers.** Draws only happen through engine rules (stalemate, insufficient material, 50-move rule, threefold repetition). Agreed draws need a new instruction.
- **Phone testing.** Retest drag and tap moves, sound and the bottom nav on iOS Safari and Android Chrome.

## Program upgrade

These come from the [2026-10-01 audit](./security/audit-2026-10-01.md) and need a program upgrade:

- Done in source, waiting for the devnet redeploy (PRs #69 and the 2026-10-30 hardening pass): `close_match` only by a player or the platform wallet; `process_match_settlement` escrow rent only to a player or the platform wallet; a mandatory 30 s to 7 day move clock; the task-scheduler instructions removed.
- `abort_match`: close the `ChessMatch` account and refund rent to the funder (needs a `rent_payer` field, a layout change).
- `delegate_match`: pin the ER validator instead of using `DelegateConfig::default()`.
- Permissionless `claim_timeout_win`, `undelegate_match` and `abort_match` after the join deadline, so a keeper can end abandoned games.

## Platform

- Spectator UI for the on-chain [prediction market](./features/prediction-market.md).
- Publish `@magic-chess/sdk` to npm. The package builds and passes its smoke test; it needs the `magic-chess` npm org and a first `npm publish`.
- Run several backend replicas behind a shared pub/sub for the SSE hub.
- Before mainnet: an external audit, mainnet RPC and validator configuration, and a decision on fees and tokens (see [Proposals](./proposals/fee-split.md)).

Want to work on one of these? See [CONTRIBUTING.md](https://github.com/amalnathsathyan/magic-chess/blob/dev/CONTRIBUTING.md).
