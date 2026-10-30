---
sidebar_position: 1
---

# Security overview

:::warning Devnet only
Magic Chess has not had an external audit. It runs on devnet with test tokens. Don't use it with real value.
:::

## Reporting a vulnerability

Report it privately through [GitHub security advisories](https://github.com/amalnathsathyan/magic-chess/security/advisories/new). Do not open a public issue. Scope and response times are in [SECURITY.md](https://github.com/amalnathsathyan/magic-chess/blob/dev/SECURITY.md).

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

- Fixed in source, live once the next devnet deploy lands: `close_match` and `process_match_settlement` only send rent to a player or the platform wallet; the creator can no longer set an arbitrary fee or fee wallet; a match must have a move clock (30 s to 7 days); the unused task-scheduler instructions are gone. See the [2026-10-30 program audit](https://github.com/amalnathsathyan/magic-chess/blob/dev/research/agent-findings/19-program-audit-2026-10-30.md).
- `abort_match` returns escrow rent to the creator even when a sponsor paid it, and leaves the `ChessMatch` account open.
- `delegate_match` doesn't pin an ER validator.
- Predictions can be placed on the base layer after the result is known on the rollup. Predictions carry play points only until this is closed.

None of these let anyone take wagers. They only affect rent lamports and rollup routing.
