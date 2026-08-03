# Magic Chess

Magic Chess is an on-chain chess engine on Solana with SPL token wagering and [MagicBlock](https://magicblock.gg) Ephemeral Rollup integration. Two players wager tokens, play a full game of chess with every move validated on-chain against FIDE rules, and the winner is settled automatically via PDA-backed escrow. Built with Anchor and Solana 3.x, the program features a complete chess engine (all piece moves, castling, en passant, promotion, check/checkmate/stalemate, 50-move rule, threefold repetition, insufficient material detection), a generic SPL token escrow system with configurable platform fees, and a TypeScript SDK for client integration.

---

## Quick Links

| Section | Description |
|---------|-------------|
| [Architecture](/architecture) | System design, program structure, state accounts, PDA derivation, token model, and tech stack |
| [Chess Engine](/chess-engine) | Deep dive into the on-chain chess logic, FIDE rules coverage, CU benchmarks, and test strategy |
| [SDK Reference](/sdk) | TypeScript SDK (`@magic-chess/sdk`) — client, React hooks, PDA utilities, FEN helpers |

---

## Why On-Chain Chess?

Most blockchain chess projects store only move history on-chain and run validation off-chain. Magic Chess performs **all chess logic on-chain** — every move is validated, every rule enforced, every checkmate detected — directly in the Solana Virtual Machine runtime.

**Unique value proposition:**

- **Trustless wagering** — PDA-backed escrow means no central authority controls the funds. Payouts are enforced by the program, not by a server.
- **Verifiable gameplay** — every move is a Solana transaction. The full game state and outcome are publicly verifiable on-chain.
- **Complete FIDE rules** — not just piece movement: castling with rook presence verification, en passant with full simulation, 50-move rule, threefold repetition via Zobrist hashing, and insufficient material detection.
- **Gasless UX (via MagicBlock)** — session keys and ephemeral rollups eliminate the need to sign every move. The platform sponsors compute for a seamless chess experience.
- **Composable** — the on-chain game state can be read by other programs, enabling prediction markets, tournament contracts, and ELO rating systems.

---

## Status

| Metric | Value |
|--------|-------|
| Anchor | 1.1.2 |
| Solana | 3.x |
| Tests | 179 |
| Audit Score | 94 / 100 |
| Instructions | 13 (6 core + 7 supporting/planned) |
| License | MIT |

---

## Quick Start

**Prerequisites:** Node.js 18+, Rust 1.75+, Solana CLI 1.18+, Anchor 0.31.1+

```bash
git clone https://github.com/amalnathsathyan/magic-chess && cd magic-chess/magic-chess-program
npm install
cd anchor && anchor build
npm run anchor-test
```

---

## Repo

[https://github.com/amalnathsathyan/magic-chess](https://github.com/amalnathsathyan/magic-chess)

Program ID (devnet): `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
