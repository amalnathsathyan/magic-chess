# Magic Speed Chess

On-chain chess engine on Solana, powered by [MagicBlock](https://magicblock.gg) ephemeral rollups.

## Features

- Complete chess logic -- all piece moves, castling, en passant, promotion, check, checkmate, stalemate, 50-move rule
- Two game modes via configurable per-move timeout (classic chess clocks planned)
- Wager matches with SPL token escrow
- Automated payout on game conclusion (winner gets pot minus platform fee, players refunded on draw)
- Session keys for gasless, seamless gameplay (planned -- MagicBlock integration)
- Automatic timeout detection via crank (planned)
- Prediction markets (future)

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.31.1

### Install

```bash
npm install
cd anchor && anchor build
```

### Test

```bash
# Run the full integration test suite (requires local validator)
npm run anchor-test

# Or run Anchor tests directly
cd anchor && anchor test
```

The test suite covers 30+ test cases across match initialization, joining, and chess move validation.

### Deploy (Devnet)

```bash
cd anchor
anchor build
anchor deploy --provider.cluster devnet
```

Update the program ID in `lib.rs` and `Anchor.toml` after the first deploy.

## Architecture

```
Browser (Next.js)  -->  MagicBlock Ephemeral Rollup (planned)  -->  Solana L1
                              |
                      SpeedChess Program (Anchor)
                              |
                    +----------+-----------+
                    |                      |
              Chess Engine            Token Escrow
           (validate moves,         (PDA-backed SPL
            checkmate, draw)         token vault)
```

Two PDAs per match:
- `chess_match` PDA (seeds: `["chess_match", match_id]`) -- stores full game state
- `match_escrow` PDA (seeds: `["match_escrow", match_id]`) -- holds wagered tokens

## Game Modes

| Mode | Config | Duration |
|------|--------|----------|
| Standard | `move_timeout_duration = 900` (15 min) | ~20-40 min |
| Blitz | `move_timeout_duration = 180` (3 min) | ~5-10 min |

The timeout is per-move. If a player exceeds the timeout, the opponent can claim a win.

## How It Works

1. **Player 1 creates a match** -- selects token mint, wager amount, timeout duration, and platform fee. Tokens are transferred to the escrow PDA. Match status: `WaitingForOpponent`.

2. **Player 2 joins** -- matches the wager amount in the same token. Tokens transferred to escrow. Match status: `Active`. It is White's (Player 1's) turn.

3. **Players take turns making moves** -- each move is validated against full FIDE rules on-chain. Moves are submitted as `(from_row, from_col, to_row, to_col, promotion?)`. The program updates the board, castling rights, en passant target, halfmove clock, and turn.

4. **Game ends** by one of:
   - **Checkmate** -- detected after each move (no legal moves + king in check)
   - **Stalemate** -- detected after each move (no legal moves + king not in check)
   - **Resignation** -- a player calls `resign_game`
   - **Timeout** -- opponent calls `claim_timeout_win` after move timeout exceeded
   - **50-move rule** -- automatic draw after 50 moves without capture or pawn advance

5. **Settlement** -- anyone calls `process_match_settlement` after game conclusion. Tokens are distributed:
   - **Win:** Winner receives pot minus platform fee. Platform receives fee.
   - **Draw:** Both players refunded equally (minus platform fee).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Anchor 0.31.1 (Rust) |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Wallet | @solana/wallet-adapter-react |
| State | Jotai |
| UI | Radix UI + shadcn/ui |
| Testing | Jest + ts-jest (30+ integration tests) |
| Indexing (planned) | Helius Webhooks + PostgreSQL |
| Backend (planned) | Fastify + Redis |
| Mobile (planned) | React Native (Expo) |
| Auth (planned) | Privy / Web3Auth |

## Program Instructions

| Instruction | Description |
|------------|-------------|
| `initialize_match` | Create a new match, escrow Player 1's bet |
| `join_match` | Join as Player 2, match the bet, start the game |
| `make_move` | Submit and validate a chess move |
| `resign_game` | Forfeit -- opponent wins |
| `claim_timeout_win` | Claim win when opponent exceeded move timeout |
| `process_match_settlement` | Distribute escrowed tokens to winner/draw |

## Project Structure

```
magic-speed-chess/
|-- anchor/                    # Anchor workspace (Rust program + tests)
|   |-- programs/speed-chess/  # On-chain chess engine
|   |-- tests/                 # TypeScript integration tests
|   |-- integration-scripts/   # Devnet deployment scripts + IDL
|-- src/                       # Next.js frontend
|   |-- app/                   # App router pages
|   |-- components/            # React components
```

## Security

- PDA-based escrow with derived authority -- only the program can move escrowed tokens
- All signer checks validated against registered players
- Token mint and ownership constraints on every instruction
- Double-payout prevention via `payout_processed` flag
- Integer overflow protection via `checked_*` arithmetic
- Account re-initialization prevented by Anchor's `init` constraint

For a detailed security analysis, known issues, and planned hardening, see [SPEC.md](./SPEC.md).

## Known Issues (in progress)

See [SPEC.md](./SPEC.md) for full details. Key items:
- Platform fee ATA owner constraint missing in settlement
- Hardcoded token mint addresses and bet amounts (to be replaced with generic support)
- Program Cargo.toml has artifact name `counter` from scaffold template

## License

MIT

## Links

- [SPEC.md](./SPEC.md) -- Full project specification
- [MagicBlock](https://magicblock.gg) -- Ephemeral rollup provider
- [Anchor Documentation](https://www.anchor-lang.com/)
