# Magic Chess — Project Specification

> **Repo**: https://github.com/amalnathsathyan/magic-chess
> **Program**: `magic_chess` (Anchor 0.31.1)
> **Program ID**: `4f7VH9vbhNnwBSeby9wKLjtbu8vM8RhUX2KVcE9havUB`
> **Branch**: `main`
> **Commit convention**: Standard commits. Do NOT use "Co-Authored-By: Claude" going forward.

## 0. Architecture Decisions (Locked In)

These decisions were made during the 18-agent audit and are reflected in the current codebase:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Program name | `magic_chess` | Clean, descriptive, matches repo |
| Anchor version | 0.31.1 | Stable, matching existing code |
| Token model | **Generic SPL** — any mint, flexible amounts | No hardcoded addresses |
| Bet validation | `bet_amount >= 1`, `platform_fee <= 10000` | Prevents zero-bet spam, caps fees |
| PDA seeds | `b"chess_match"` / `b"match_escrow"` | Single source in `constants.rs` |
| Auth provider | **Privy** (planned) | Google sign-in, TEE session keys |
| Session keys | **MagicBlock Delegation Program** | Zero-confirmation moves |
| Gas model | **Platform-sponsored** (~$0.06-0.16/match) | ER free + sponsor pays commit/close |
| Frontend | **Next.js 15** + react-chessboard | Web-first, deferred React Native |
| Backend | **Fastify + Postgres + Redis** on Railway | $0/month MVP |
| Indexing | **Helius Enhanced Webhooks** | Free tier, Anchor event decoding |
| FEN | **Off-chain only** (TS utility in SDK) | Zero CU cost |
| Repetition detection | **Zobrist hashing** (future) | 8 bytes/position, ~10 CU |
| ELO rating | **Off-chain** (webhook handler) | No on-chain dependency |
| Fee split | **50/50** — treasury vault + dev wallet | PDA-controlled vault |
| Token launch | **Manual SPL** ($SPEED), not pump.fun | Pump.fun can't reserve supply |
| Testing | Plain `#[test]` + Mollusk + LiteSVM | 3-tier strategy |

## 1. Overview

Magic Chess is an on-chain chess engine on Solana, built for the MagicBlock hackathon. Two players wager SPL tokens and play a full game of chess with all moves validated on-chain. PDA-based escrow holds wagers; winner is settled automatically.

**Core value proposition:**
- Trustless wager-based chess with PDA escrow
- Complete FIDE chess rules enforced on-chain
- MagicBlock ephemeral rollups for gasless, low-latency gameplay
- Extensible for prediction markets and ELO ratings

---

## 2. Game Modes

### Per-Move Timeout Model (Current)
The current implementation uses a **per-move timeout** rather than traditional chess clocks. The match creator sets a `move_timeout_duration` (in seconds). If a player exceeds this duration on their turn, the opponent can call `claim_timeout_win`. The timeout is also checked during `make_move` -- if the moving player has already timed out when they attempt to move, the game ends.

**Planned: Standard chess clocks** with separate time pools per player (e.g., 15|10 for rapid, 3|2 for blitz). This requires adding `player_one_time_remaining` and `player_two_time_remaining` fields (commented out in the current code).

| Mode | Time Control | Per-Move Increment | Typical Duration |
|------|-------------|-------------------|-----------------|
| Standard (Rapid) | 15 min | N/A (per-move timeout) | 20-40 min |
| Blitz (Speed Chess) | 3 min | N/A (per-move timeout) | 5-10 min |

---

## 3. Architecture

```
+-------------------+       +---------------------------+       +-----------------+
|  Browser / Mobile | <---> | MagicBlock Ephemeral      | <---> | Solana L1       |
|  (Next.js / RN)   |       | Rollup (future)           |       | (Settlement)    |
+-------------------+       +---------------------------+       +-----------------+
        |                           |                                   |
        v                           v                                   v
+-------------------+       +---------------------------+       +-----------------+
|  Auth: Privy /    |       |  SpeedChess Program       |       |  SPL Token      |
|  Web3Auth (TBD)   |       |  (Anchor 0.31.1)          |       |  Program        |
+-------------------+       +---------------------------+       +-----------------+
        |                           |
        v                           v
+-------------------+       +---------------------------+
|  Session Keys     |       |  Escrow PDAs              |
|  (Delegation)     |       |  (match_escrow)           |
+-------------------+       +---------------------------+
```

**Off-chain components (planned):**
- **Indexer:** Helius webhooks + PostgreSQL -- track game events, player stats, match history.
- **Backend API:** Fastify + Redis -- matchmaking, player profiles, leaderboards, crank for timeout detection.
- **Database:** PostgreSQL for relational data (matches, players, ELO ratings).

---

## 4. On-Chain Program (Anchor)

### 4.1 Instructions

| # | Instruction | Accounts | Purpose |
|---|------------|----------|---------|
| 1 | `initialize_match` | chess_match (PDA, init), player_signer, betting_token_mint_account, player_token_account, match_escrow_token_account (PDA, init), token_program, system_program | Player 1 creates a match, sets bet amount and timeout, transfers bet to escrow |
| 2 | `join_match` | chess_match (mut), player_two_signer, player_token_account, match_escrow_token_account (mut), token_program, system_program | Player 2 joins with matching bet, transfers to escrow, game becomes Active |
| 3 | `make_move` | chess_match (mut), player (signer) | Validates and applies a chess move, updates board state, checks for checkmate/stalemate/timeout |
| 4 | `resign_game` | chess_match (mut), player_signer | Current player resigns, opponent wins |
| 5 | `claim_timeout_win` | chess_match (mut), claimer_signer | Claims a win when opponent has exceeded move_timeout_duration |
| 6 | `process_match_settlement` | chess_match (mut), match_escrow_token_account (mut), player_one_ata, player_two_ata, platform_fee_ata, token_program | Distributes escrowed tokens to winner (minus platform fee) or refunds both in a draw |

**Instruction 1 detail: `initialize_match`**

```rust
pub fn initialize_match(
    ctx: Context<InitializeMatch>,
    match_id_arg: String,
    bet_amount_arg: u64,
    move_timeout_duration_arg: i64,
    platform_fee_basis_points_arg: u16,
) -> Result<()>
```

- Creates the `chess_match` PDA at seed `["chess_match", match_id]`.
- Creates the `match_escrow` PDA at seed `["match_escrow", match_id]`.
- Validates betting token mint (currently hardcoded to mock SEND and wSOL mints).
- Validates bet amount (currently hardcoded: 10 SEND or 0.1 wSOL).
- Transfers Player 1's bet to the escrow PDA.

**Instruction 3 detail: `make_move`**

```rust
pub fn make_move(ctx: Context<MakeMove>, args: MakeMoveArgs) -> Result<()>
```

Args: `from_row: u8`, `from_col: u8`, `to_row: u8`, `to_col: u8`, `promotion: Option<PieceType>`

- Verifies game is Active and it is the signer's turn.
- Checks per-move timeout. If the moving player has timed out, the game ends with the opponent winning.
- Calls `chess_logic::validate_and_apply_move()` which: validates piece movement rules, simulates the move, checks that own king is not left in check, applies the move permanently (including castling rook movement, en passant capture, promotion), updates halfmove clock and fullmove number, switches turns.
- After applying the move, checks if opponent has no legal moves (checkmate vs stalemate).
- Also checks 50-move rule (halfmove_clock >= 100).

### 4.2 Account Structure

**ChessMatch** (on-chain account):

| Field | Type | Description |
|-------|------|-------------|
| `match_id` | `String` (max 32) | Unique match identifier |
| `players` | `[Pubkey; 2]` | players[0] = White, players[1] = Black |
| `current_player_idx` | `u8` | Index of the player whose turn it is |
| `current_turn` | `PlayerColor` | White or Black |
| `last_move_timestamp` | `i64` | Unix timestamp of last move or game start |
| `move_timeout_duration` | `i64` | Seconds allowed per move |
| `game_status` | `GameStatus` | WaitingForOpponent, Active, WhiteWins, BlackWins, Draw |
| `game_end_reason` | `Option<GameEndReason>` | Checkmate, Stalemate, Resignation, Timeout, FiftyMoveRule |
| `board` | `[[Option<Piece>; 8]; 8]` | 8x8 board state |
| `castling_rights` | `CastlingRights` | White/Black kingside/queenside flags |
| `en_passant_target` | `Option<EnPassantSquare>` | En passant target square (row, col) |
| `halfmove_clock` | `u8` | Half-moves since last capture or pawn advance (for 50-move rule) |
| `fullmove_number` | `u16` | Full move number (increments after Black's move) |
| `betting_token_mint` | `Pubkey` | SPL mint address for wager token |
| `bet_amount_player_one` | `u64` | Player 1's bet amount |
| `bet_amount_player_two` | `u64` | Player 2's bet amount |
| `total_pot` | `u64` | Total escrowed amount |
| `platform_fee_basis_points` | `u16` | Platform fee in basis points (e.g., 200 = 2%) |
| `payout_processed` | `bool` | Prevents double-payout |
| `bump` | `u8` | PDA bump for chess_match |

### 4.3 Enums

- **PieceType:** Pawn, Knight, Bishop, Rook, Queen, King
- **PlayerColor:** White, Black (with `opponent()` method)
- **GameStatus:** WaitingForOpponent, Active, WhiteWins, BlackWins, Draw
- **GameEndReason:** Checkmate, Stalemate, Resignation, Timeout, FiftyMoveRule (ThreefoldRepetition, InsufficientMaterial commented out for future)
- **MoveResult:** Normal, Checkmate, Stalemate

### 4.4 Events

| Event | Emitted On | Fields |
|-------|-----------|--------|
| `MatchCreatedEvent` | `initialize_match` | match_id, creator, betting_token_mint, bet_amount, move_timeout_duration, platform_fee_basis_points |
| `PlayerJoinedEvent` | `join_match` | match_id, player_one, player_two, betting_token_mint, bet_amount_per_player |
| `MoveMadeEvent` | `make_move` | match_id, player, player_color, algebraic_move, from/to coordinates, promotion_piece, board_fen (placeholder), is_check, is_checkmate, is_stalemate |
| `GameEndedEvent` | make_move (checkmate/stalemate/timeout), resign_game, claim_timeout_win | match_id, status, winner, reason |
| `PayoutEvent` | process_match_settlement (win) | match_id, winner, amount, fee |
| `DrawPayoutEvent` | process_match_settlement (draw) | match_id, white_player, black_player, amount_each, fee |

### 4.5 Token Economics

- **Wager token:** Currently hardcoded to two mock mints (SEND and wSOL). The architecture supports any SPL token, but validation is restricted.
- **Bet matching:** Both players must bet the same amount in the same token.
- **Platform fee:** Configurable at match creation (in basis points, max 10000 = 100%). Deducted from the total pot during settlement.
- **Escrow:** PDA at `["match_escrow", match_id]`, funded by both players on `initialize_match` and `join_match`.
- **Known issue:** Platform fee ATA owner is not constrained in `process_match_settlement`, meaning the platform fee could potentially be routed to an incorrect account if provided maliciously. This needs a constraint check against a known platform wallet address.

### 4.6 Chess Logic

**Fully implemented:**
- Piece-specific movement for all 6 piece types (Pawn, Knight, Bishop, Rook, Queen, King)
- Pawn double-move from starting rank
- Pawn diagonal capture
- En passant capture (detection, validation, and board update)
- Castling (kingside and queenside) with all FIDE conditions: king/rook not moved, path clear, king not in check, king does not pass through check
- Promotion (defaults to Queen if not specified; validates promotion piece type and rank)
- Check detection via board scan for all attacker types
- Checkmate detection (no legal moves + king in check)
- Stalemate detection (no legal moves + king not in check)
- 50-move rule (automatic draw at halfmove_clock >= 100)
- "Move leaves king in check" prevention via board simulation

**Known gaps / not yet implemented:**
- Threefold repetition detection (commented out in `GameEndReason`)
- Insufficient material detection (commented out in `GameEndReason`)
- FEN string generation (placeholder empty string in `MoveMadeEvent`)
- Draw by agreement (no instruction for mutual draw offer)

---

## 5. Smart Contract Security

### 5.1 Current State

| Check | Status | Notes |
|-------|--------|-------|
| PDA seeds | Implemented | `chess_match` and `match_escrow` use `match_id` as seed. Bump stored and verified. |
| Signer checks | Implemented | All instructions verify the signer is the correct player for the action. |
| Account ownership | Implemented | Token account owner constraints on initialize/join/settlement. |
| Token mint validation | Implemented | Checks mint matches the match's configured token. |
| Double-payout prevention | Implemented | `payout_processed` flag set after settlement. |
| Re-initialization prevention | Implicit | Anchor `init` constraint prevents re-initialization of PDAs. |
| Integer overflow | Protected | Uses `checked_add`, `checked_mul`, `checked_div`, `checked_sub` throughout. |
| Escrow authority | Verified | `process_payout` derives the PDA and verifies it owns the escrow token account before signing CPIs. |

### 5.2 Known Issues

1. **Platform fee ATA owner not constrained** (`process_match_settlement.rs` line 52-54): The `platform_fee_ata` account's owner is not checked. A malicious actor could provide an arbitrary token account as the fee recipient. **Fix:** Add a constraint verifying the owner matches a known platform wallet address, or store the platform wallet in the ChessMatch account at initialization.

2. **Hardcoded token addresses with mismatch between files** (`initialize_match.rs` and `join_match.rs`): The mock mint addresses differ between the two instruction files:
   - `initialize_match.rs`: SEND = `4tCTxt8UneZDL4g8d8R9NLRkRNMbuAjCyHGefcvzZvjS`, wSOL = `So11111111111111111111111111111111111111112`
   - `join_match.rs`: SEND = `SENDYLjLBaTgjyfXtPP2aHUt91WhNzX7iUfpThyApht`, wSOL = `WSiBAnrREwNLdGkDpXuqdKL4fJvAHeJhDfehmFdMdvw`
   The program will work correctly only if the mint addresses match between the two files (both must refer to the same deployed mints). The test file uses the latter set. **Fix:** Unify to a single source of truth, or better yet, remove hardcoded mint checks entirely and allow any SPL mint.

3. **Hardcoded bet amounts** (`initialize_match.rs` lines 95-103, `join_match.rs` lines 76-80): Fixed bet amounts (10 SEND / 0.1 wSOL) are enforced. **Fix:** Remove hardcoded amounts and accept any valid `u64` bet amount.

4. **Cargo.toml artifact:** The program's `Cargo.toml` has `name = "counter"` (copy-paste from a scaffold template).

5. **No anchor idl-build command:** The root `package.json` defines `anchor-build` but not `anchor-test` via Anchor CLI (tests run through Jest directly).

---

## 6. Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Blockchain | Solana (devnet) | Active |
| Scaling | MagicBlock Ephemeral Rollup | Planned (Phase 2) |
| Smart Contract | Anchor 0.31.1 (Rust) | Active |
| Frontend Web | Next.js 15.3.1, React 19, Tailwind CSS 4 | Scaffolded (no chess UI yet) |
| Frontend Mobile | React Native (Expo) | Planned (Phase 3) |
| Wallet Adapter | @solana/wallet-adapter-react 0.15.38 | Installed (not yet wired for chess) |
| State Management | Jotai 2.12.3 | Installed |
| UI Components | Radix UI (dialog, dropdown-menu, label, slot) | Installed |
| Icons | Lucide React 0.503 | Installed |
| Auth | Privy / Web3Auth | Planned (TBD) |
| Session Keys | Delegation Program | Planned (Phase 2) |
| SDK | TypeScript (Anchor IDL-based) | In progress (integration-scripts/) |
| Indexing | Helius Webhooks + PostgreSQL | Planned |
| Backend | Fastify + Redis | Planned |
| Testing | Jest + ts-jest (integration), Anchor test | Active |
| Linting | ESLint + Prettier | Active |
| Deployment | Vercel (web), EAS (mobile) | Planned |

---

## 7. Testing Strategy

### 7.1 Current Test Coverage

The test suite at `anchor/tests/speed_chess.test.ts` uses `@coral-xyz/anchor` and `@solana/spl-token` with a local validator.

**Initialize Match (10 tests):**
1.1 - Initialize with SEND token (success)
1.2 - Initialize with wSOL token (success)
1.3 - Unsupported token mint (failure)
1.4 - Invalid bet amount for SEND (failure)
1.5 - Invalid bet amount for wSOL (failure)
1.6 - Platform fee > 10000 (failure)
1.7 - Empty matchId (failure)
1.8 - MatchId too long (failure)
1.9 - Player token account owner incorrect (failure)
1.10 - Token account mint mismatch (failure)

**Join Match (8 tests):**
2.1 - Join SEND match (success)
2.2 - Join wSOL match (success)
2.3 - Creator cannot join as Player 2 (failure)
2.4 - Bet amount mismatch (failure)
2.5 - Wrong token mint for join (failure)
2.6 - Match already full (failure)
2.7 - Match not in WaitingForOpponent status (failure)
2.8 - Player 2 token account owner incorrect (failure)

**Make Move (14+ tests):**
3.1 - Valid pawn move e2-e4 (success)
3.2 - Valid pawn move e7-e5 (success)
3.3 - Wrong player's turn (failure)
3.4 - Pawn tries to move sideways (failure)
3.5 - Not your piece (failure)
3.6 - Pawn double move with path blocked (failure)
3.7 - Pawn promotion (success)
3.8 - Pawn captures diagonally e4xd5 (success)
3.9 - Invalid pawn capture forward into occupied square (failure)
3.10 - Knight L-move g1-f3 (success)
3.11 - Knight jumps over pieces b8-c6 (success)
3.12 - Bishop valid move along open diagonal f1-b5
3.13 - Invalid bishop move blocked by piece c1-d2
3.14 - Rook valid vertical move a1-a3

### 7.2 Missing Test Coverage (TBD from agent research)
- Castling tests (kingside + queenside)
- En passant capture tests
- Checkmate scenarios
- Stalemate scenarios
- 50-move rule trigger
- Timeout claim tests
- Settlement/payout tests (win + draw)
- Resignation flow
- Full game end-to-end (play until checkmate, verify payout)
- CU profiling and optimization

### 7.3 Planned Testing Enhancements
- [ ] Mollusk/LiteSVM for fast Rust-level unit tests
- [ ] Fuzz testing for chess logic with malicious inputs
- [ ] Kani formal verification (future, for settlement logic)

---

## 8. Roadmap

### Phase 1: Hackathon MVP (Current)

- [x] Complete chess logic (all piece moves, castling, en passant, promotion, check/checkmate/stalemate)
- [x] Match lifecycle (create -> join -> play -> end -> settle)
- [x] Token escrow and payout logic
- [x] Initial test suite (30+ test cases)
- [ ] Fix critical bugs: mint address mismatch in instruction files, platform fee owner constraint
- [ ] Remove hardcoded token/bet amount restrictions -- support any SPL mint
- [ ] Fix `Cargo.toml` program name ("counter" -> "speed_chess")
- [ ] Implement FEN string generation for events
- [ ] Complete test coverage (castling, en passant, checkmate, settlement)
- [ ] TypeScript SDK v0.1 (generated from IDL, with helper methods)
- [ ] Chess board UI component (interactive board with move input)
- [ ] Wire up wallet adapter to chess game flow
- [ ] Create/join match UI
- [ ] Devnet deployment

### Phase 2: MagicBlock Integration

- [ ] Deploy program to MagicBlock ephemeral rollup
- [ ] Session keys via delegation program (Privy/Web3Auth -> session key -> gasless moves)
- [ ] Crank system for automatic timeout detection (eliminate need for `claim_timeout_win`)
- [ ] Gasless transactions for moves
- [ ] WebSocket-based real-time game state updates

### Phase 3: Launch

- [ ] React Native mobile app (Expo)
- [ ] Prediction market on match outcomes
- [ ] ELO rating system (off-chain, with on-chain settlement)
- [ ] Matchmaking and lobby system
- [ ] Spectator mode
- [ ] Tournament support
- [ ] Mainnet deployment
- [ ] External security audit

---

## 9. File Structure

```
magic-speed-chess/
|
|-- anchor/                              # Anchor workspace
|   |-- Anchor.toml                      # Anchor config (devnet cluster)
|   |-- Cargo.toml                       # Workspace Cargo.toml
|   |-- programs/
|   |   |-- speed-chess/                # Solana program (Rust)
|   |       |-- Cargo.toml              # Program dependencies (anchor-lang 0.31.1)
|   |       |-- src/
|   |           |-- lib.rs              # Entry point, 6 instructions declared
|   |           |-- errors/mod.rs       # ChessError enum (30+ error variants)
|   |           |-- events/mod.rs       # Event structs (6 event types)
|   |           |-- state/
|   |           |   |-- mod.rs          # State module exports
|   |           |   |-- chess_match.rs  # ChessMatch account struct
|   |           |   |-- piece.rs        # Piece struct (type + color)
|   |           |   |-- enums.rs        # PieceType, PlayerColor, GameStatus, etc.
|   |           |   |-- castling_rights.rs  # CastlingRights struct
|   |           |   |-- en_passant_square.rs # EnPassantSquare struct
|   |           |-- instructions/
|   |           |   |-- mod.rs          # Instruction module exports
|   |           |   |-- initialize_match.rs  # Match creation
|   |           |   |-- join_match.rs       # Player 2 joining
|   |           |   |-- make_move.rs        # Chess move validation + application
|   |           |   |-- resign_game.rs      # Resignation
|   |           |   |-- claim_timeout_win.rs # Timeout claim
|   |           |   |-- process_match_settlement.rs # Payout distribution
|   |           |-- utils/
|   |               |-- mod.rs              # Utils module exports
|   |               |-- chess_logic.rs      # Full chess engine (~500 lines)
|   |               |-- payout_logic.rs     # Token payout functions
|   |-- tests/
|   |   |-- speed_chess.test.ts         # Integration test suite (30+ test cases)
|   |   |-- test-keys/                  # Mock mint keypairs for local testing
|   |-- integration-scripts/
|   |   |-- IDL/                        # Generated IDL (JSON + TS)
|   |   |-- InitializeMatch.ts          # Devnet deployment script
|   |   |-- JoinMatch.ts                # Devnet join script
|   |   |-- MockTokenSetup.ts           # Token mint setup script
|   |   |-- test-keys/                  # Devnet test keypairs
|
|-- src/                                # Next.js frontend
|   |-- app/                            # App router pages
|   |   |-- page.tsx                    # Home page (dashboard scaffold)
|   |   |-- layout.tsx                  # Root layout
|   |   |-- globals.css                 # Global styles (Tailwind 4)
|   |-- components/                     # React components
|   |   |-- ui/                         # shadcn/ui primitives (button, card, etc.)
|   |   |-- account/                    # Account data access + display
|   |   |-- cluster/                    # Cluster (network) selector
|   |   |-- counter/                    # Example counter feature (scaffold artifact)
|   |   |-- dashboard/                  # Dashboard feature
|   |   |-- solana-provider.tsx         # Solana wallet adapter provider
|   |   |-- theme-provider.tsx          # Dark/light theme provider
|   |-- lib/
|       |-- utils.ts                    # shadcn utility (cn() helper)
|
|-- package.json                        # Root package.json (Next.js + Anchor)
|-- tsconfig.json                       # TypeScript config
|-- next.config.ts                      # Next.js configuration
|-- eslint.config.mjs                   # ESLint configuration
|-- postcss.config.mjs                  # PostCSS config (Tailwind 4)
|-- components.json                     # shadcn/ui config
|-- .prettierrc                         # Prettier configuration
|-- .claude/                            # Claude Code settings
|-- README.md                           # Project README
|-- SPEC.md                             # This file
```

---

## 10. Open Questions and TBD

The following items are pending research from parallel agent investigations. Findings should be merged into relevant sections above.

### 10.1 Chess Logic Audit [TBD]
- Are there any edge-case bugs in the chess engine (e.g., pinned piece movement, castling through attacked squares)?
- Is the halfmove clock reset logic fully correct for all capture types?
- Does the 50-move rule correctly account for the "no capture AND no pawn move" condition?
- Are there performance concerns with the brute-force legal move search in `are_no_legal_moves()`?

### 10.2 Security Audit [TBD]
- Full PDA security review (are all seeds correctly derived? Are bumps properly used?)
- CPI safety (re-entrancy, privilege escalation, signer seed leakage)
- Token account validation completeness
- Missing constraints (e.g., platform fee ATA owner)

### 10.3 FEN Notation [TBD]
- Current code emits an empty FEN string in `MoveMadeEvent`. Full FEN generation needs to be implemented.
- FEN format: `{piece placement} {active color} {castling availability} {en passant target} {halfmove clock} {fullmove number}`

### 10.4 TypeScript SDK Design [TBD]
- Should the SDK be a standalone npm package or part of the monorepo?
- IDL-based type generation vs. hand-written types
- Helper methods for: match creation, joining, move submission, settlement
- Integration with wallet adapters

### 10.5 Prediction Markets [TBD]
- How would prediction markets integrate with the chess program?
- Would predictions be placed before a match starts, or during gameplay?
- What oracle/price feed mechanism would be used?
- Separate program or integrated into ChessMatch?

### 10.6 MagicBlock Integration [TBD]
- What are the specific requirements for deploying to a MagicBlock ephemeral rollup?
- How do session keys integrate with the Anchor program's signer checks?
- Gasless transaction architecture: who pays for compute?
- Latency targets and how they compare to direct L1 transactions

### 10.7 Auth and Gas Research [TBD]
- Privy vs. Web3Auth: which provides better UX for gaming?
- Session key management: expiration, revocation, scoping
- Gasless relay architecture: paymaster pattern vs. fee payer delegation

### 10.8 Frontend and Deployment [TBD]
- Chess board rendering strategy: chessboardjsx vs. custom Canvas/SVG
- WebSocket vs. polling for game state updates
- Vercel deployment configuration (ISR for static pages?)
- Mobile app architecture (Expo + Solana Mobile Stack?)

### 10.9 Backend and Indexing [TBD]
- Helius webhook configuration for program events
- Database schema for match history, player stats, ELO ratings
- Crank system design for automated timeout detection
- Matchmaking algorithm design
