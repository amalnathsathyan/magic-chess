# Security Policy

Magic Chess holds player wagers in on-chain escrow and runs a gas-sponsoring
fee payer, so we take vulnerability reports seriously.

## Supported versions

| Component | Version | Supported |
| --- | --- | --- |
| `magic_chess` program (devnet, `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`) | latest on `dev` | Yes |
| Backend, frontend, SDK | latest on `dev` | Yes |
| Anything older | — | No |

The program is deployed to **Solana devnet only**. It has not had a
third-party audit. Do not use it with real funds.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/amalnathsathyan/magic-chess/security/advisories/new).

Please include:

- the affected component (program instruction, backend route, SDK method, frontend page)
- steps to reproduce, ideally a failing test or transaction signature
- the impact you expect (funds at risk, sponsor drain, denial of service, …)

We aim to acknowledge reports within 3 days and to share a fix plan within 14.
We credit reporters in the advisory unless you ask us not to.

## Scope

In scope:

- loss or lock-up of escrowed wagers or prediction-pool funds
- moving or settling a game without the right signer
- draining the backend fee payer (`/api/transactions/sponsor`)
- forging indexed match data through `/api/sync/*`

Out of scope: devnet RPC rate limits, issues in third-party services (Privy,
MagicBlock, Supabase) unless our integration causes them, and social engineering.

## Past audits

Internal audit reports live in the docs:
[Security](https://amalnathsathyan.github.io/magic-chess/docs/security/).
