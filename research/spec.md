# Magic Chess — Project Specification

> **Repo**: https://github.com/amalnathsathyan/magic-chess
> **Program**: `magic_chess` (Anchor 1.1.2)
> **Program ID**: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
> **Network**: Devnet (deployed)
> **Last updated**: 2026-08-04

## 0. Architecture Decisions (Locked In)

| Decision | Choice | Status |
|----------|--------|--------|
| Program name | `magic_chess` | Deployed |
| Anchor version | 1.1.2 (Rust), Solana 2.x crates | Active |
| Token model | **Generic SPL** — any mint, flexible amounts (was hardcoded; now stores `betting_token_mint` in ChessMatch) | Deployed |
| PDA seeds | `b"chess_match"` / `b"match_escrow"` | Deployed |
| Auth provider | **Privy** (configured, app ID + secret in `.env.local`) | UI wiring needed |
| Session keys | **Custom on-chain** (`session_signer` + `session_expires_at` on ChessMatch) | Deployed, tested on ER |
| Gas model | **ER gasless** for delegated accounts | Working on ER (devnet) |
| Frontend | **Next.js 15** + Tailwind 4 + shadcn/ui | Scaffolded, `/play/[matchId]` exists (composes all 8 chess components), needs SDK wiring for real data |
| Backend | **Fastify + Postgres + Redis** (planned) | Not started |
| Indexing | **Helius Enhanced Webhooks** (planned) | Not started |
| MagicBlock ER | **Ephemeral Rollups** (delegation + gasless moves) | Deployed, working on devnet |
| Crank/Task Scheduler | **Disabled** (Magic111... not available on current ER) | Manual timeout enforcement works |
| FEN | **Off-chain only** (`chess.js` in frontend) | Active |
| SDK | **@magic-chess/sdk** — thin TypeScript wrapper over Anchor IDL with React hooks | Built |
| Testing | 205 tests (182 unit + 23 LiteSVM + 8 Mollusk CU + 12 Anchor TS) | Active |

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
|  (Next.js 15)     |       | Rollup (deployed, devnet) |       | (Settlement)    |
+-------------------+       +---------------------------+       +-----------------+
        |                           |                                   |
        v                           v                                   v
+-------------------+       +---------------------------+       +-----------------+
|  Auth: Privy      |       |  magic_chess Program      |       |  SPL Token      |
|  (configured)     |       |  (Anchor 1.1.2)           |       |  Program        |
+-------------------+       +---------------------------+       +-----------------+
        |                           |
        v                           v
+-------------------+       +---------------------------+
|  Session Keys     |       |  Escrow PDAs              |
|  (Custom on-chain)|       |  (match_escrow)           |
+-------------------+       +---------------------------+
```

**L1 holds tokens + settlement. ER handles gameplay (make_move, session keys, crank). Tokens never leave L1.**

**Off-chain components (planned):**
- **Indexer:** Helius webhooks + PostgreSQL -- track game events, player stats, match history.
- **Backend API:** Fastify + Redis -- matchmaking, player profiles, leaderboards, crank for timeout detection.
- **Database:** PostgreSQL for relational data (matches, players, ELO ratings).

---

## 4. On-Chain Program (Anchor)

### 4.1 Instructions

The program has 22 instructions dispatched in `lib.rs`. The full list:

| # | Instruction | Accounts | Purpose |
|---|------------|----------|---------|
| 1 | `initialize_match` | chess_match (PDA, init), player_signer, betting_token_mint_account, player_token_account, match_escrow_token_account (PDA, init), token_program, system_program | Player 1 creates a match, sets bet amount and timeout, transfers bet to escrow |
| 2 | `join_match` | chess_match (mut), player_two_signer, player_token_account, match_escrow_token_account (mut), token_program, system_program | Player 2 joins with matching bet, transfers to escrow, game becomes Active |
| 3 | `make_move` | chess_match (mut), player (signer) | Validates and applies a chess move, updates board state, checks for checkmate/stalemate/timeout |
| 4 | `resign_game` | chess_match (mut), player_signer | Current player resigns, opponent wins |
| 5 | `claim_timeout_win` | chess_match (mut), claimer_signer | Claims a win when opponent has exceeded move_timeout_duration |
| 6 | `process_match_settlement` | chess_match (mut), match_escrow_token_account (mut), player_one_ata, player_two_ata, platform_fee_ata, token_program | Distributes escrowed tokens to winner (minus platform fee) or refunds both in a draw |
| 7 | `abort_match` | chess_match (mut), player_signer | Creator cancels match while still WaitingForOpponent; refunds Player 1 |
| 8 | `close_match` | chess_match (mut) | Closes a completed/settled match account (rent recovery) |
| 9 | `delegate_match` | chess_match (mut), delegation_record (PDA, init), delegation_program | Delegates match account to MagicBlock ER for gasless gameplay |
| 10 | `undelegate_match` | chess_match (mut), delegation_record (mut), delegation_program | Undelegates match account back to L1 |
| 11 | `commit_state` | chess_match (mut) | Commits ER state back to L1 |
| 12 | `set_session_key` | chess_match (mut), player_signer | Authorizes a session key for gasless move submission |
| 13 | `revoke_session_key` | chess_match (mut), player_signer | Revokes an active session key |
| 14 | `schedule_timeout` | chess_match (mut) | Schedules a timeout check via Task Scheduler (stub — disabled on current ER) |
| 15 | `cancel_timeout_task` | chess_match (mut) | Cancels a scheduled timeout task (stub) |
| 16 | `initialize_prediction_pool` | prediction_pool (PDA, init), match | Creates prediction pool PDA (deferred, gated by `prediction_enabled`) |
| 17 | `place_prediction_bet` | prediction_pool (mut), bettor | Places a bet on game outcome (deferred) |
| 18 | `settle_prediction_pool` | prediction_pool (mut), match | Triggers pool settlement after game ends (deferred) |
| 19 | `claim_prediction_winnings` | prediction_pool (mut), claimer | Winners claim proportional payout (deferred) |
| 20 | `cancel_prediction_bet` | prediction_pool (mut), bettor | Refund if match never starts (deferred) |
| 21-22 | (Reserved / internal helpers) | | Additional dispatch targets in `lib.rs` |

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
- Stores `betting_token_mint` in ChessMatch for flexible SPL token support (any mint accepted).
- Transfers Player 1's bet to the escrow PDA.

**Instruction 3 detail: `make_move`**

```rust
pub fn make_move(ctx: Context<MakeMove>, args: MakeMoveArgs) -> Result<()>
```

Args: `from_row: u8`, `from_col: u8`, `to_row: u8`, `to_col: u8`, `promotion: Option<PieceType>`

- Verifies game is Active and it is the signer's turn (or valid session key signer).
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
| `session_signer` | `Option<Pubkey>` | Authorized session key for gasless moves |
| `session_expires_at` | `Option<i64>` | Session key expiry timestamp |
| `prediction_enabled` | `bool` | Whether prediction pool is enabled for this match |
| `is_delegated` | `bool` | Whether match account is delegated to ER |
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

- **Wager token:** Previously hardcoded to two mock mints with mismatched addresses. Now the program stores `betting_token_mint` in ChessMatch at init time and validates against the stored value at join time. Any SPL token is accepted.
- **Bet matching:** Both players must bet the same amount in the same token.
- **Platform fee:** Configurable at match creation (in basis points, max 10000 = 100%). Deducted from the total pot during settlement.
- **Escrow:** PDA at `["match_escrow", match_id]`, funded by both players on `initialize_match` and `join_match`.
- **Known issues (still open):**
  1. **Platform fee ATA owner not constrained** (`process_match_settlement.rs`): The `platform_fee_ata` account's owner is not checked against a known platform wallet address. A malicious actor could provide an arbitrary token account as the fee recipient. Low priority — dev wallet is known.
  2. **Hardcoded bet amount validation** (`initialize_match.rs`, `join_match.rs`): Specific bet amounts (10 SEND / 0.1 wSOL) are still enforced in validation logic despite the token mint now being flexible. The `bet_amount_arg` parameter is accepted but validated against a hardcoded list.

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

**Known gaps (not yet implemented):**
- Threefold repetition detection (commented out in `GameEndReason`)
- Insufficient material detection (commented out in `GameEndReason`)
- FEN string generation on-chain (placeholder empty string in `MoveMadeEvent`; FEN is generated off-chain by `chess.js`)
- Draw by agreement (no instruction for mutual draw offer)

---

## 5. Smart Contract Security

### 5.1 Current State

| Check | Status | Notes |
|-------|--------|-------|
| PDA seeds | Implemented | `chess_match` and `match_escrow` use `match_id` as seed. Bump stored and verified. |
| Signer checks | Implemented | All instructions verify the signer is the correct player for the action. Session key auth also verified. |
| Account ownership | Implemented | Token account owner constraints on initialize/join/settlement. |
| Token mint validation | Implemented | Checks mint matches the match's stored `betting_token_mint`. |
| Double-payout prevention | Implemented | `payout_processed` flag set after settlement. |
| Re-initialization prevention | Implicit | Anchor `init` constraint prevents re-initialization of PDAs. |
| Integer overflow | Protected | Uses `checked_add`, `checked_mul`, `checked_div`, `checked_sub` throughout. |
| Escrow authority | Verified | `process_payout` derives the PDA and verifies it owns the escrow token account before signing CPIs. |

### 5.2 Known Issues

1. **Platform fee ATA owner not constrained** (`process_match_settlement.rs` line 52-54): The `platform_fee_ata` account's owner is not checked. A malicious actor could provide an arbitrary token account as the fee recipient. **Status: OPEN.** Fix: Add a constraint verifying the owner matches a known platform wallet address, or store the platform wallet in the ChessMatch account at initialization.

2. **Hardcoded token addresses in validation — FIXED.** The program previously had mismatched mock mint addresses between `initialize_match.rs` and `join_match.rs`. The fix stores `betting_token_mint` in ChessMatch at init time and validates against the stored value at join time. Any SPL token is now accepted.

3. **Hardcoded bet amounts** (`initialize_match.rs` lines 95-103, `join_match.rs` lines 76-80): Fixed bet amounts (10 SEND / 0.1 wSOL) are still enforced despite generic SPL token support. **Status: OPEN.** Fix: Remove hardcoded amount validation and accept any valid `u64` bet amount.

4. **Cargo.toml artifact — FIXED.** The program's `Cargo.toml` previously had `name = "counter"`. Lib name is now `magic_chess`.

5. **No anchor idl-build command in root package.json:** The root `package.json` defines `anchor-build` but not `anchor-test` via Anchor CLI. Tests run through Jest directly. **Status: MINOR (accepted).**

---

## 6. Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Blockchain | Solana (devnet) | Active |
| Scaling | MagicBlock Ephemeral Rollup | Deployed on devnet, ER delegation working, gasless moves tested |
| Smart Contract | Anchor 1.1.2 (Rust), Solana 2.x crates | Active |
| Frontend Web | Next.js 15.3.1, React 19, Tailwind CSS 4, shadcn/ui | Scaffolded, all 8 chess components built, `/play/[matchId]` page exists (composes components), arena page with lobby UI, needs SDK wiring for real data |
| Frontend Mobile | React Native (Expo) | Planned (Phase 3) |
| Wallet Adapter | @solana/wallet-adapter-react 0.15.38 | Installed (wired via Privy, not yet integrated with chess flow) |
| Chess Board | react-chessboard v5 (Clariity fork), chess.js | Installed and integrated in `/play/[matchId]` |
| State Management | Jotai 2.12.3 | Installed, atoms defined for wallet, match, lobby |
| UI Components | Radix UI (dialog, dropdown-menu, label, slot) | Installed |
| Icons | Lucide React 0.503 | Installed |
| Animations | Framer Motion | Installed, used in play page and landing |
| Auth | Privy (app ID + secret configured) | Configured, needs UI wiring for chess flow |
| Session Keys | Custom on-chain (session_signer + session_expires_at) | Deployed, tested on ER — set_session_key / revoke_session_key work end-to-end |
| SDK | @magic-chess/sdk (TypeScript, thin Anchor IDL wrapper) | Built at `sdk/`, includes client, React hooks (useMatch, useMatches, usePlayerMatches, useMatchEvents), PDA helpers, MagicBlock helpers |
| Indexing | Helius Webhooks + PostgreSQL | Planned (not started) |
| Backend | Fastify + Redis | Planned (not started) |
| Testing | 4 harnesses: Rust unit + LiteSVM + Mollusk CU + Anchor TS | Active (205 tests total) |
| Linting | ESLint + Prettier | Active |
| Deployment | Vercel (web), EAS (mobile) | Planned |

---

## 7. Testing Strategy

### 7.1 Current Test Coverage

205 tests across 4 harnesses:

| Harness | Count | Description |
|---------|-------|-------------|
| Unit (pure Rust) | 182 | Chess logic, state transitions, validation, error paths |
| LiteSVM (integration) | 23 | In-process SPL token flows, full match lifecycle |
| Mollusk CU | 8 | Compute unit profiling and optimization benchmarks |
| Anchor TypeScript | 12 | End-to-end with local validator, Anchor TS client |

**Initialize Match (covered):**
- Initialize with valid SPL tokens (success)
- Unsupported/invalid token mint (failure)
- Invalid bet amount (failure)
- Platform fee > 10000 (failure)
- Empty/invalid matchId (failure)
- Token account owner/ATA mismatch (failure)

**Join Match (covered):**
- Join as Player 2 (success)
- Creator cannot self-join (failure)
- Bet amount mismatch (failure)
- Wrong token mint (failure)
- Match already full / not in WaitingForOpponent (failure)

**Make Move (covered):**
- Valid pawn, knight, bishop, rook, queen, king moves (success)
- Wrong player's turn (failure)
- Invalid piece movement (failure)
- Pawn promotion, en passant capture
- Castling (kingside + queenside)
- Check/checkmate/stalemate detection
- 50-move rule trigger

**Session Keys (covered):**
- set_session_key → make_move with session signer → revoke_session_key (end-to-end)

**MagicBlock ER (covered):**
- delegate_match CPI → ER fqdn resolution → operational (devnet)
- commit_state lifecycle
- Router API getDelegationStatus

### 7.2 Remaining Test Gaps

The following areas have partial or no dedicated test coverage:

- **Timeout claim full flow** — `claim_timeout_win` with realistic timestamp manipulation
- **Settlement/payout edge cases** — draw payout with fee, zero-amount scenarios
- **Abort match flow** — creator cancels, refund to Player 1
- **Close match** — rent recovery for completed matches
- **Session key expiry** — make_move after session_expires_at
- **Fuzz testing** for chess logic with adversarial inputs
- **Kani formal verification** for settlement/payout logic (future)

### 7.3 Planned Testing Enhancements

- [ ] Mollusk/LiteSVM coverage for MagicBlock-specific flows (delegation lifecycle)
- [ ] Fuzz testing for chess logic with malicious inputs
- [ ] Kani formal verification (future, for settlement logic)
- [ ] Performance benchmarks under load (multiple concurrent matches on ER)

---

## 8. Roadmap

### Phase 1: Core Program + MagicBlock — COMPLETE

- [x] Complete chess logic (all piece moves, castling, en passant, promotion, check/checkmate/stalemate)
- [x] Match lifecycle (create -> join -> play -> end -> settle)
- [x] Token escrow and payout logic
- [x] 205 tests (182 unit + 23 LiteSVM + 8 CU + 12 Anchor TS)
- [x] Generic SPL token support (any mint stored in ChessMatch; bet amount validation still hardcoded)
- [x] 22 instructions including MagicBlock ER (delegate, commit, undelegate, crank stubs)
- [x] Session keys (set_session_key, revoke_session_key, make_move with session key auth)
- [x] Prediction market infrastructure (prediction_enabled flag, 5 instructions stubbed)
- [x] Devnet deployment with MagicBlock Ephemeral Rollups
- [x] Router API integration (JSON-RPC POST to getDelegationStatus)
- [x] ER delegation flow working (delegate -> resolve ER fqdn -> connect -> operate)
- [x] Session key flow working on ER (set -> makeMove with session key -> revoke)
- [x] TypeScript SDK (@magic-chess/sdk) with client, React hooks, PDA helpers

### Phase 2: Frontend — IN PROGRESS

- [x] Next.js 15 scaffold with Tailwind 4, shadcn/ui, Jotai
- [x] Landing page (Hero, HowItWorks, GameModes, WhyMagicBlock, Security)
- [x] Arena/lobby page with filtering, match cards, create match form (uses MOCK_MATCHES)
- [x] All 8 chess components built: ChessBoard, ChessClock, MoveList, GameStatus, CapturedPieces, BoardControls, PromotionDialog, PlayerCard
- [x] `/play/[matchId]` page — composes all 8 chess components, local chess.js engine, promotion dialog, optimistic move updates, sound effects
- [x] MagicBlock integration layer (`lib/magicblock.ts`): session creation stub, ER-aware move submission (delegates to ER if available, else base RPC)
- [x] `useMagicBlock` hook: SDK-backed with mock fallback for demo mode
- [x] Privy configured (app ID + secret in `.env.local`)
- [x] Sound effects system (`lib/sounds.ts`)
- [ ] Wire real SDK data — replace MOCK_MATCHES in arena, connect useMagicBlock to real transactions
- [ ] Wallet connect flow — Privy login integrated into chess game flow
- [ ] Session key setup UI + IndexedDB persistence for session keys
- [ ] Real-time board sync via ER account polling/subscription
- [ ] Mobile responsiveness + touch optimization for chessboard
- [ ] `/play/[matchId]/spectate` page (link exists in header but page not built)
- [ ] PWA manifest + service worker registration

### Phase 3: Launch (Future)

- [ ] Backend (Fastify + Postgres + Redis)
- [ ] Helius webhooks for indexing
- [ ] ELO rating system (off-chain)
- [ ] Spectator mode + prediction market UI
- [ ] React Native mobile app (Expo)
- [ ] Mainnet deployment
- [ ] External security audit

---

## 9. File Structure (Current)

```
magic-chess/
├── magic-chess-program/            # Anchor workspace
│   ├── Anchor.toml                 # Devnet cluster config
│   ├── programs/magic_chess/       # On-chain program (Rust, Anchor 1.1.2)
│   │   └── src/
│   │       ├── lib.rs              # 22 instructions dispatched
│   │       ├── constants.rs        # PDA seeds, limits, program addresses
│   │       ├── errors/             # 40 error variants (ChessError)
│   │       ├── events/             # 6 event types
│   │       ├── instructions/       # 20 instruction handler files (22 dispatch targets)
│   │       ├── state/              # ChessMatch, CastlingRights, Piece, Enums, PredictionPool
│   │       └── utils/              # chess_logic.rs (full engine), payout_logic.rs
│   └── tests/
│       ├── magicblock_session_test.ts  # Session key E2E test
│       ├── magicblock_integration.ts   # ER lifecycle test
│       ├── magicblock_crank_test.ts    # Crank chain test
│       └── unit_tests.rs, litesvm.rs   # Rust-level tests
│
├── sdk/                            # @magic-chess/sdk (TypeScript)
│   └── src/
│       ├── client.ts               # MagicChessClient
│       ├── types.ts                # TypeScript types
│       ├── pda.ts                  # PDA derivation
│       ├── react/index.ts          # React hooks (useMatch, useMatches, usePlayerMatches, useMatchEvents)
│       ├── utils/fen.ts            # FEN helpers (boardToFen, fenToBoard)
│       └── magicblock.ts           # ER endpoints, delegation helpers, Router API
│
├── frontend/                       # Next.js 15 (App Router)
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── arena/page.tsx          # Lobby (MOCK_MATCHES, filtering, create match)
│   │   ├── play/[matchId]/page.tsx  # Game view (362 lines, composes all 8 chess components)
│   │   ├── play/[matchId]/spectate  # Spectate link (page not yet built)
│   │   └── profile/page.tsx        # Player profile
│   ├── components/
│   │   ├── landing/                # Hero, HowItWorks, GameModes, WhyMagicBlock, Security
│   │   ├── chess/                  # 8 components: ChessBoard, ChessClock, MoveList, GameStatus, CapturedPieces, BoardControls, PromotionDialog, PlayerCard
│   │   ├── lobby/                  # MatchCard, CreateMatchForm
│   │   └── shared/                 # WalletButton, TransactionStatus
│   ├── hooks/                      # useChessMatch (local chess.js), useMagicBlock (SDK + mock fallback)
│   ├── lib/                        # magicblock.ts (real ER integration, 123 lines), chess.ts, sounds.ts
│   └── store/                      # Jotai atoms (wallet, match, lobby)
│
├── docs/                           # Project documentation
│   ├── spec.md                     # This file
│   ├── current-state.md            # Handoff doc for next agent
│   ├── frontend-research.md        # Devnet status + UI/UX audit
│   ├── architecture.md             # System design
│   ├── chess-engine.md             # Chess logic deep dive
│   ├── sdk.md                      # SDK reference
│   ├── deployment.md               # Deploy instructions
│   └── index.md                    # Docs index
│
└── README.md                       # Architecture overview with mermaid diagram
```

---

## 10. Resolved Questions

### 10.1 Chess Logic
- **Covered**: 205 tests across 4 harnesses. FIDE rules complete (castling with rook presence, en passant with simulation, promotion, check/checkmate/stalemate, 50-move rule).
- **Not yet**: Threefold repetition, insufficient material detection (commented out in source, low priority).
- **Performance**: Brute-force legal-move search is acceptable; game state is small (64 squares).

### 10.2 Security
- **PDA seeds**: Verified — `chess_match` and `match_escrow` use `match_id`. Bumps stored.
- **Signer checks**: Verified on all instructions, including session key auth path.
- **Known issues open**: Platform fee ATA owner not constrained (#1 in section 5.2). Low priority — dev wallet is known. Hardcoded bet amounts (#3 in section 5.2).

### 10.3 FEN
- **Decision**: Off-chain only. Frontend uses `chess.js` for FEN generation and board rendering. On-chain events emit coordinates (from/to row/col) for reconstruction.
- **Status**: Implemented and working. `/play/[matchId]` page uses chess.js for local FEN computation with optimistic updates.

### 10.4 TypeScript SDK
- **Implementation**: `@magic-chess/sdk` at `sdk/`. Manual TypeScript (not Codama-generated).
- **Pattern**: Thin wrapper over Anchor IDL with React hooks (useMatch, useMatches, usePlayerMatches, useMatchEvents), PDA helpers, and MagicBlock integration helpers.
- **Status**: Built and published. Used by frontend via workspace dependency.

### 10.5 Prediction Markets
- **Architecture**: Opt-in per-match. `prediction_enabled: bool` on ChessMatch (defaults false).
- **Model**: Parimutuel (proportional payout). 5 instructions stubbed, not yet deployed.
- **Status**: Infrastructure in place; fully deferred for post-MVP.

### 10.6 MagicBlock Integration (DEPLOYED)
- **Delegation**: Working on devnet. `delegate_match` CPI succeeds, ER fqdn resolved via Router API.
- **Session keys**: Custom on-chain implementation. `set_session_key` -> `make_move` with session signer -> `revoke_session_key`. All working on ER.
- **Gasless**: ER processes transactions without debiting signer lamports.
- **Task Scheduler**: Disabled (Magic111... not available on current ER deployment). Manual timeout enforcement works via `claim_timeout_win`.
- **Router API**: JSON-RPC POST to `https://devnet-router.magicblock.app/`. Method: `getDelegationStatus`.
- **Frontend integration**: `lib/magicblock.ts` wraps SDK for ER-aware move submission. Checks delegation status; sends to ER if delegated, else falls back to base RPC.

### 10.7 Auth
- **Choice**: Privy (configured, app ID + secret set in `.env.local`). Supports email, Google, wallet login. TEE session keys supported.
- **Session keys**: Custom program-level implementation (not MagicBlock Session Keys SDK). Simpler, self-contained, and proven working on ER.
- **Gas model**: ER gasless for delegated accounts. L1 delegation/close costs approximately $0.06-0.16 per match.
- **Status**: Configured but not yet wired into the chess game flow UI.

### 10.8 Frontend (BUILT, needs SDK wiring)
- **Board**: `react-chessboard` v5 (Clariity fork). MIT license. Integrated in `/play/[matchId]` with drag-and-drop move handling, last-move highlighting, and promotion dialog.
- **Game page**: `/play/[matchId]` page exists (362 lines). Composes all 8 chess components: PlayerCard (both sides), ChessClock, CapturedPieces, ChessBoard, BoardControls, MoveList, GameStatus, PromotionDialog, TransactionStatus.
- **State management**: `useChessMatch` hook uses local `chess.js` for game logic. Jotai atoms for FEN, moves, status. No on-chain sync yet.
- **Move submission**: `useMagicBlock` hook provides SDK-backed submission with mock fallback for demo mode.
- **Sound effects**: `lib/sounds.ts` plays move sounds and game-end sounds.
- **Not yet wired**: Real SDK data (arena still uses MOCK_MATCHES), on-chain move submission, Privy wallet connect in game flow, session key UI, ER board state sync.

### 10.9 Backend
- **Status**: Not started. Fastify + Postgres + Redis planned. Helius webhooks for event indexing. Needed for matchmaking, player profiles, leaderboards, and ELO ratings in Phase 3.

---

## 11. Prediction Markets (Post-MVP)

Opt-in per-match prediction pools. Gated by `prediction_enabled` bool on `ChessMatch`.

### Design
- **PredictionPool PDA** per match: tracks total bets on White/Black/Draw
- **Parimutuel** payout model (proportional to winning pool)
- **Pull-model** claims: winners claim individually (avoids CU limits)
- **Players blocked** from betting (anti-match-fixing)
- **Bets locked** once game status = Active

### New Instructions (5, deferred)
1. `initialize_prediction_pool` — create pool PDA
2. `place_prediction_bet` — spectator bets
3. `settle_prediction_pool` — trigger after game ends
4. `claim_prediction_winnings` — winners claim
5. `cancel_prediction_bet` — refund if match never starts

### Added Now
- `prediction_enabled: bool` on ChessMatch (1 byte, defaults false)
- No changes to chess logic, match lifecycle, or settlement

See `agent-findings/05-prediction-markets.md` for full architecture and attack vector analysis.

## TypeScript SDK

Package: `@magic-chess/sdk` at `sdk/`

- Thin wrapper over Anchor IDL (manual TypeScript, not Codama-generated)
- React hooks via `/react` subpath export: `useMatch`, `useMatches`, `usePlayerMatches`, `useMatchEvents`
- PDA utilities, typed instruction builders, event listeners
- MagicBlock helpers: `getDelegationStatus`, `getERConnection`, `findChessMatchPda`
- See `agent-findings/04-ts-sdk-design.md` for full architecture

### API Surface
| Method | Description |
|--------|-------------|
| `createMatch(params)` | Initialize a new chess match with bet |
| `joinMatch(params)` | Join as player 2, match bet amount |
| `abortMatch(matchId)` | Cancel while WaitingForOpponent |
| `makeMove(matchId, move)` | Execute a chess move |
| `resign(matchId)` | Resign the game |
| `claimTimeout(matchId)` | Claim win on opponent timeout |
| `settleMatch(matchId)` | Process payouts after game ends |
| `getMatch(matchId)` | Fetch full match state |
| `listJoinableMatches(filters?)` | Find open matches |
| `getPlayerMatches(player)` | List player's matches |
