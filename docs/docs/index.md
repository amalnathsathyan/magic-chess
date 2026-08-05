# Magic Chess

Magic Chess is an on-chain chess engine on Solana with SPL token wagering and [MagicBlock](https://magicblock.gg) Ephemeral Rollup integration. Two players wager tokens, play a full game of chess with every move validated on-chain against FIDE rules, and the winner is settled automatically via PDA-backed escrow. Built with Anchor and Solana 3.x, the program features a complete chess engine (all piece moves, castling, en passant, promotion, check/checkmate/stalemate, 50-move rule, threefold repetition, insufficient material detection), a generic SPL token escrow system with configurable platform fees, and a TypeScript SDK for client integration.

---

## Quick Links

| Section | Description |
|---------|-------------|
| [Architecture](./architecture.md) | System design, program structure, state accounts, PDA derivation, token model, and tech stack |
| [Chess Engine](./chess-engine.md) | Deep dive into the on-chain chess logic, FIDE rules coverage, CU benchmarks, and test strategy |
| [SDK Reference](./sdk.md) | TypeScript SDK (`@magic-chess/sdk`) — client, React hooks, PDA utilities, FEN helpers |

---

## Welcome to Magic Chess Docs

Magic Chess is a **fully open-source**, on-chain chess engine on Solana with SPL token wagering and [MagicBlock](https://magicblock.gg) Ephemeral Rollup integration.

We believe in open-source gaming. Anyone can audit the code, contribute to the engine, or fork it to build new experiences.

### Key Highlights

- **Open Source**: The entire project (smart contracts, SDK, and frontend) is open-source under the MIT License. Dive into the code on [GitHub](https://github.com/amalnathsathyan/magic-chess).
- **Architecture**: A robust, purely on-chain game state machine built with Anchor. Uses PDA-backed escrows and Zobrist hashing. Read the full [Architecture](./architecture.md) deep dive.
- **TypeScript SDK**: A complete `@magic-chess/sdk` for easy client integration. Includes React hooks and FEN helpers. Read the [SDK Reference](./sdk.md).

---

## Status

| Metric | Value |
|--------|-------|
| Anchor | 1.1.2 (Rust), 0.32.1 (TS) |
| Network | Devnet (deployed) |
| Tests | 205 (182 unit + 23 LiteSVM + 8 CU + 12 Anchor TS) |
| Instructions | 22 |
| Program ID | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| License | MIT |

### Quick Links for Next Agent
- [Current State & Handoff](current-state.md) — start here
- [Frontend Research & UI/UX Audit](frontend-research.md) — Sections 10-11
- [Specification](spec.md) — updated for current reality

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
