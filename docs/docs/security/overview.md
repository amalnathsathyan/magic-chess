---
sidebar_position: 1
---

# Security overview

:::warning Devnet only
Magic Chess has not had an external audit. It runs on devnet with test tokens. Don't use it with real value.
:::

## Reporting a vulnerability

Report it privately through [GitHub security advisories](https://github.com/amalnathsathyan/magic-chess/security/advisories/new). Do not open a public issue. Scope and response times are in [SECURITY.md](https://github.com/amalnathsathyan/magic-chess/blob/main/SECURITY.md).

## Trust model

- **Tokens never leave L1.** Wagers sit in a PDA-owned escrow token account. Only `process_match_settlement` and `abort_match` move them, and only to accounts checked against the match.
- **The program enforces the rules.** Every move is validated on-chain against FIDE rules, on the rollup or on L1. Clients can't submit illegal moves or skip a turn.
- **Session keys can only move pieces.** A session key can sign `make_move` for one match until it expires. Resigning, claiming timeouts and anything that moves tokens need the player's wallet.
- **The backend is not trusted for funds.** The gas sponsor only pays fees for an allow-listed set of instructions, and only for signed-in Privy users. Ratings, history and move predictions are off-chain conveniences rebuilt from chain data.

See [Architecture → Overview](../architecture/overview.md) for the full picture.

## Internal reviews

| Review | Scope |
|--------|-------|
| [2026-10-01 full stack](./audit-2026-10-01.md) | Frontend, backend, SDK and the deployed program |
| [2026-08 master](./audit-2026-08-master.md) | Cross-component review |
| [2026-08 program](./audit-2026-08-program.md) | The Anchor program |

## Known open issues

These need a program upgrade. They are tracked on the [Roadmap](../roadmap.md).

- `close_match` doesn't restrict who receives the closed account's rent.
- `process_match_settlement` lets the caller choose where the escrow rent goes.
- `abort_match` returns escrow rent to the creator even when a sponsor paid it, and leaves the `ChessMatch` account open.
- `delegate_match` doesn't pin an ER validator.

None of these let anyone take wagers. They only affect rent lamports and rollup routing.
