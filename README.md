<div align="center">
  <img src="https://raw.githubusercontent.com/amalnathsathyan/magic-chess/main/docs/assets/logo.png" alt="Magic Chess Logo" width="120" style="border-radius: 20px" onerror="this.style.display='none'"/>
  <h1>Magic Chess ♟️✨</h1>
  <p><strong>The first 100% on-chain, gasless, real-time chess engine on Solana.</strong></p>
  <p>
    <a href="https://github.com/amalnathsathyan/magic-chess"><img src="https://img.shields.io/badge/Open%20Source-Yes-blue.svg" alt="Open Source"></a>
    <a href="https://magicblock.gg"><img src="https://img.shields.io/badge/Powered_by-MagicBlock-purple.svg" alt="MagicBlock"></a>
    <a href="https://solana.com"><img src="https://img.shields.io/badge/Network-Solana-black.svg?logo=solana" alt="Solana"></a>
  </p>
</div>

---

**Magic Chess** is a decentralized, trustless chess arena built on Solana. By leveraging **MagicBlock's Ephemeral Rollups**, we deliver a seamless, traditional Web2 chess experience (50ms latency, 0 gas fees) while maintaining the security, immutability, and wager capabilities of Web3.

Whether you're a builder, a player, or a judge, Magic Chess showcases the cutting edge of what's possible with Solana's composability and MagicBlock's rollup infrastructure.

## 🌟 Key Highlights

### ⚡ 100% On-Chain & Gasless (Ephemeral Rollups)
The *entire FIDE rulebook* is enforced on-chain. Castling, en passant, promotions, check/checkmate, stalemate, and the 50-move rule are computed directly on the Ephemeral Rollup (ER).
- **50ms Latency:** Moves are executed instantly on the ER.
- **Zero Gas:** MagicBlock enables gasless interactions. You sign a session key *once* and play the entire match without wallet popups.
- **No Compromises:** State commits back to the Solana L1 seamlessly for final settlement.

### 💰 Trustless Wagers & Automated Payouts
Wager any SPL token on your matches.
- **PDA Escrow:** Tokens are securely locked in a Program Derived Address (PDA) escrow.
- **Automated Settlement:** The smart contract handles payouts automatically (Winner takes all minus a configurable platform fee; Draws refund both players).
- **No Third-Party Risk:** The tokens never leave the L1 until the game concludes.

### 🔮 Parimutuel Prediction Markets
Spectators can get in on the action!
- Infrastructure built-in for per-match prediction pools.
- **Trustless Parimutuel System:** Bet on White, Black, or Draw. Payouts are proportionally distributed to the winning pool immediately after game settlement.

### 🛠️ Developer-Ready `@magic-chess/sdk`
A fully typed, comprehensive TypeScript SDK built for rapid integration.
- Includes React hooks (`useMatch`, `useMatches`, `usePlayerMatches`, `useMatchEvents`)
- Built-in FEN string parsing and board state utilities
- Abstracts MagicBlock connection routing and PDA derivations

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Solana L1
        Tokens[SPL Tokens]
        Escrow[PDA Escrow]
        MatchState[Match Initialization & Settlement]
    end

    subgraph Ephemeral Rollup MagicBlock
        Engine[100% On-Chain Chess Engine]
        Session[Session Keys]
        Gasless[Zero-Gas Moves]
    end

    subgraph Client
        UI[Next.js App / Shadcn UI]
        SDK[@magic-chess/sdk]
    end

    UI <-->|Types & Hooks| SDK
    SDK -->|Creates Match / Locks Wager| MatchState
    MatchState -->|Delegates State| Engine
    SDK <-->|Instant, Gasless Moves| Engine
    Engine -->|Commits Final State| MatchState
    MatchState -->|Payout| Escrow
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+, Rust 1.89+, Solana CLI 4.1+, Anchor 1.1.2, Yarn

### Installation

```bash
git clone https://github.com/amalnathsathyan/magic-chess.git
cd magic-chess
yarn install
```

### Build & Test

```bash
# Build the Anchor program
cd magic-chess-program
cargo build-sbf --tools-version v1.52

# Run all 205 tests (182 pure Rust + 23 LiteSVM + 8 Mollusk CU + 12 Anchor TS)
cargo test -p magic_chess
cargo test -- litesvm
cargo test --features integration-tests -p magic_chess --test cu_benchmarks
anchor test
```

## 📦 What's Inside?

This is a fully open-source monorepo showcasing how to build a scalable, real-time gaming application on Solana.

- **`magic-chess-program/`**: The core Anchor program (Rust). Features 22 instructions, complete FIDE validation, and token escrow logic.
- **`sdk/`**: `@magic-chess/sdk`, an easy-to-use TypeScript library.
- **`frontend/`**: A sleek Next.js 15 Web App using Tailwind CSS and Radix UI. Built for instantaneous gameplay via Jotai state management and our custom SDK.

## 🤝 For Judges & Builders
Magic Chess isn't just a game—it's a demonstration of **Solana's future in high-frequency, logic-heavy apps**.

We heavily utilized MagicBlock Ephemeral Rollups to offload state mutation limits, bypassing traditional L1 congestion entirely. The codebase is heavily documented and thoroughly tested (205 tests across unit, integration, and performance benchmarking).

Feel free to explore our extensive docs, including:
- [Detailed Specification](./docs/spec.md)
- [Architecture Deep-Dive](./docs/architecture.md)
- [Security Audit & Report](./docs/security-audit.md)
- [SDK Reference](./docs/sdk.md)

## 📄 License
This project is open-source and available under the **MIT License**. Build on top of it, fork it, and help us push the boundaries of on-chain gaming!
