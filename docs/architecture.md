# Architecture

## System Overview

```
+-------------------+       +---------------------------+       +-----------------+
|  Browser / Mobile | <---> | MagicBlock Ephemeral      | <---> | Solana L1       |
|  (Next.js / RN)   |       | Rollup                    |       | (Settlement)    |
+-------------------+       +---------------------------+       +-----------------+
        |                           |                                   |
        v                           v                                   v
+-------------------+       +---------------------------+       +-----------------+
|  Auth: Privy /    |       |  magic_chess Program      |       |  SPL Token      |
|  Web3Auth (TBD)   |       |  (Anchor 1.1.2)           |       |  Program        |
+-------------------+       +---------------------------+       +-----------------+
        |                           |
        v                           v
+-------------------+       +---------------------------+
|  Session Keys     |       |  Escrow PDAs              |
|  (Delegation)     |       |  (match_escrow)           |
+-------------------+       +---------------------------+
```

**Flow:** A player interacts with the Next.js frontend. The frontend calls the TypeScript SDK, which builds and submits transactions. During Phase 2 (MagicBlock integration), transactions flow through the Ephemeral Rollup for instant confirmation and gasless execution. Settlement transactions (payouts) commit to Solana L1. The SPL Token Program handles all token transfers via CPI from the escrow PDA.

**Off-chain components (planned):**
- **Indexer:** Helius Enhanced Webhooks + PostgreSQL — decodes Anchor events, tracks game history, player stats, and ELO ratings.
- **Backend API:** Fastify + Redis — matchmaking, player profiles, leaderboards, and the crank for automated timeout detection.
- **SDK:** `@magic-chess/sdk` — TypeScript client with React hooks, PDA utilities, and FEN helpers.

---

## Program Structure

The `magic_chess` Anchor program is organized into five modules:

```
programs/magic_chess/src/
├── lib.rs                    # Instruction dispatch, program entry
├── constants.rs              # PDA seeds, validation limits, fee bounds
├── errors/mod.rs             # 40 error variants
├── events/mod.rs             # 6 event types
├── instructions/
│   ├── mod.rs
│   ├── initialize_match.rs   # Match creation + escrow init
│   ├── join_match.rs         # Player 2 joins, matches bet
│   ├── make_move.rs          # Core gameplay + FEN emission
│   ├── resign_game.rs        # Resignation
│   ├── claim_timeout_win.rs  # Timeout enforcement
│   └── process_match_settlement.rs  # Payout distribution
├── state/
│   ├── mod.rs
│   ├── chess_match.rs        # Main account (~31 fields)
│   ├── castling_rights.rs    # 4 bools: KQkq
│   ├── en_passant_square.rs  # Optional (row, col)
│   ├── enums.rs              # 6 enums, MoveResult, GameStatus
│   └── piece.rs              # Piece { piece_type, color }
└── utils/
    ├── mod.rs
    ├── chess_logic.rs        # ~680 lines — full chess engine
    └── payout_logic.rs       # PDA-signed token transfers
```

---

## Instructions

### Core Instructions (Implemented)

| # | Instruction | Description |
|---|-------------|-------------|
| 1 | `initialize_match` | Player 1 creates a match with a chosen SPL token mint, wager amount, per-move timeout, and platform fee (in basis points). Tokens are transferred from P1's ATA to the escrow PDA. Emits `MatchCreatedEvent`. |
| 2 | `join_match` | Player 2 joins the match, matching the wager amount in the same SPL token. Tokens transferred to escrow. Game status transitions from `WaitingForOpponent` to `Active`. White (P1) moves first. Emits `PlayerJoinedEvent`. |
| 3 | `make_move` | Submits a chess move with `(from_row, from_col, to_row, to_col, promotion?)`. Validates the move against full FIDE rules, simulates it to confirm the king is not left in check, applies it permanently, updates castling rights, en passant target, halfmove clock, fullmove number, and turn. Detects checkmate, stalemate, and 50-move rule after each move. Emits `MoveMadeEvent` and optionally `GameEndedEvent`. |
| 4 | `resign_game` | The current player resigns. Game status transitions to the opponent's win. Emits `GameEndedEvent` with reason `Resignation`. |
| 5 | `claim_timeout_win` | Called by a player when the opponent has exceeded the per-move timeout duration (`move_timeout_duration`). Verifies the timeout by comparing the current timestamp against `last_move_timestamp + move_timeout_duration`. Emits `GameEndedEvent` with reason `Timeout`. |
| 6 | `process_match_settlement` | Distributes escrowed tokens after game conclusion. On a win: winner receives the pot minus the platform fee; platform receives the fee. On a draw: both players are refunded equally (minus the platform fee). Sets `payout_processed = true` to prevent double-payout. Emits `PayoutEvent` or `DrawPayoutEvent`. |

### Supporting Instructions (Planned / In Progress)

| # | Instruction | Description |
|---|-------------|-------------|
| 7 | `abort_match` | Allows Player 1 to cancel a match stuck in `WaitingForOpponent` status and reclaim their escrowed tokens. Prevents funds from being locked forever if no opponent joins. |
| 8 | `close_match` | Cleans up a settled match account, reclaiming rent. Can only be called after `payout_processed` is true and the escrow is empty. |
| 9 | `set_session_key` | Sets a delegated session key for a player, enabling gasless move submission via MagicBlock's delegation program. The session key has a configurable expiry. |
| 10 | `make_move` (session auth) | Variant of `make_move` that accepts a session key signature instead of the player's wallet signature. Used for gasless gameplay within the ephemeral rollup. |
| 11 | `revoke` | Revokes an active session key before its natural expiry. |
| 12 | `schedule_timeout` | Registers a timeout check with the on-chain crank, scheduling automatic timeout detection without requiring the opponent to call `claim_timeout_win`. |
| 13 | `undelegate` | Removes the delegation from a session key, reclaiming the delegated authority after gameplay ends or on session expiry. |

---

## State Accounts

### ChessMatch

The primary on-chain account. Stores the complete state of a single chess match.

| Field | Type | Description |
|-------|------|-------------|
| `match_id` | `String` (max 32) | Unique match identifier |
| `players` | `[Pubkey; 2]` | `players[0]` = White (P1), `players[1]` = Black (P2) |
| `current_player_idx` | `u8` | Index (0 or 1) of the player whose turn it is |
| `current_turn` | `PlayerColor` | `White` or `Black` |
| `last_move_timestamp` | `i64` | Unix timestamp of the last move (or match start) |
| `move_timeout_duration` | `i64` | Seconds allowed per move before timeout |
| `game_status` | `GameStatus` | `WaitingForOpponent`, `Active`, `WhiteWins`, `BlackWins`, or `Draw` |
| `game_end_reason` | `Option<GameEndReason>` | `Checkmate`, `Stalemate`, `Resignation`, `Timeout`, `FiftyMoveRule`, `ThreefoldRepetition`, or `InsufficientMaterial` |
| `board` | `[[Option<Piece>; 8]; 8]` | 8x8 board. `board[row][col]` = `Some(Piece { piece_type, color })` or `None` |
| `castling_rights` | `CastlingRights` | Four boolean flags: `white_kingside`, `white_queenside`, `black_kingside`, `black_queenside` |
| `en_passant_target` | `Option<EnPassantSquare>` | The square `(row, col)` where an en passant capture is possible, if any |
| `halfmove_clock` | `u8` | Number of half-moves since the last capture or pawn advance. Resets to 0 on capture or pawn move. At 100 (50 full moves), the game is a draw. |
| `fullmove_number` | `u16` | Full move counter. Increments after Black's move. Starts at 1. |
| `betting_token_mint` | `Pubkey` | SPL token mint address for the wager token |
| `bet_amount_player_one` | `u64` | Player 1's wagered amount (in token's base units) |
| `bet_amount_player_two` | `u64` | Player 2's wagered amount (must equal P1's amount) |
| `total_pot` | `u64` | Total tokens held in escrow: `bet_amount_player_one + bet_amount_player_two` |
| `platform_fee_basis_points` | `u16` | Platform fee in basis points (e.g., 200 = 2%). Validated: must be `<= 10000` (100%). |
| `platform_fee_wallet` | `Pubkey` | The wallet address that receives the platform fee on settlement |
| `payout_processed` | `bool` | Set to `true` after settlement completes. Prevents double-payout attacks. |
| `prediction_enabled` | `bool` | Opt-in flag for prediction markets (1 byte, defaults to `false`) |
| `bump` | `u8` | PDA bump seed for the `chess_match` account |
| `match_escrow_bump` | `u8` | PDA bump seed for the `match_escrow` token account |
| `position_history` | Ring buffer | Zobrist hash history for threefold repetition detection (FNV-1a, 200 positions) |

### CastlingRights

```rust
pub struct CastlingRights {
    pub white_kingside: bool,   // Default: true
    pub white_queenside: bool,  // Default: true
    pub black_kingside: bool,   // Default: true
    pub black_queenside: bool,  // Default: true
}
```

Rights are revoked when:
- A king moves (both sides for that color)
- A rook moves (that side only for that color)
- A rook is captured on its starting square (e.g., White's queenside rights are revoked if the a8 rook is captured)

### EnPassantSquare

```rust
pub struct EnPassantSquare {
    pub row: u8,
    pub col: u8,
}
```

Set when a pawn advances two squares from its starting rank. Valid only for the immediately following move by the opponent.

### Enums

| Enum | Variants |
|------|----------|
| `PieceType` | `Pawn`, `Knight`, `Bishop`, `Rook`, `Queen`, `King` |
| `PlayerColor` | `White`, `Black` (has `opponent()` method) |
| `GameStatus` | `WaitingForOpponent`, `Active`, `WhiteWins`, `BlackWins`, `Draw` |
| `GameEndReason` | `Checkmate`, `Stalemate`, `Resignation`, `Timeout`, `FiftyMoveRule`, `ThreefoldRepetition`, `InsufficientMaterial` |
| `MoveResult` | `Normal`, `Checkmate`, `Stalemate` |

---

## PDA Derivation

Two PDAs are created per match, both keyed by the `match_id` string.

### chess_match PDA

```
seeds: [b"chess_match", match_id.as_bytes()]
```

Stores the full game state (the `ChessMatch` account). The bump is stored in the `bump` field and verified on every instruction.

### match_escrow PDA

```
seeds: [b"match_escrow", match_id.as_bytes()]
```

An associated token account owned by the `chess_match` PDA. Holds the combined wager (`total_pot`). The escrow PDA is the authority for its token account — only the program can sign for transfers from escrow, and only via the derived PDA signer seeds. The bump is stored in the `match_escrow_bump` field.

Both seed prefixes are defined as constants in `constants.rs` to ensure a single source of truth.

---

## Crank Chain Flow

The crank system automates game lifecycle management so that neither player needs to manually trigger timeout claims or settlement. The flow after each move:

```
make_move  -->  schedule_timeout  -->  claim_timeout_win  -->  process_match_settlement  -->  undelegate
```

| Step | Trigger | Action |
|------|---------|--------|
| 1. `make_move` | Player submits a move | Move validated and applied on-chain. The crank is notified to schedule a timeout check. |
| 2. `schedule_timeout` | Automatic (crank) | The crank registers a future timeout at `last_move_timestamp + move_timeout_duration`. If the opponent does not move before the deadline, the crank will call `claim_timeout_win`. |
| 3. `claim_timeout_win` | Automatic (crank) or manual | If the timeout fires, the opponent is declared the winner. If the moving player moves before the timeout, this step is skipped. |
| 4. `process_match_settlement` | Anyone can call | Tokens distributed from escrow: winner receives pot minus platform fee, or both refunded on draw. Sets `payout_processed = true`. |
| 5. `undelegate` | Automatic (crank) | Session key delegation is removed, reclaiming authority from the ephemeral rollup back to L1. |

---

## Session Key Flow

Session keys enable gasless, zero-confirmation moves by delegating signing authority from the player's wallet to a temporary session key within the MagicBlock ephemeral rollup.

```
set_session_key  -->  make_move (session auth)  -->  make_move (session auth)  -->  ...  -->  revoke
```

| Step | Instruction | Description |
|------|-------------|-------------|
| 1. Set session key | `set_session_key` | Player delegates move-signing authority to a session keypair via MagicBlock's Delegation Program. The key has a configurable expiry (e.g., 1 hour). The program stores the session key mapping for the player's match. |
| 2. Gasless moves | `make_move` (session auth) | For each turn, the session key signs the `make_move` transaction. The platform sponsors the gas. Confirmation is instant within the ephemeral rollup. |
| 3. Revoke | `revoke` | The player (or the crank, on game end) revokes the session key. Authority returns to the player's main wallet. |

During Phase 2, the session key flow eliminates the need for wallet popups on every move, creating a seamless chess experience comparable to web2 chess platforms.

---

## Token Model

Magic Chess uses a **generic SPL token model** — any SPL token mint can be used for wagering.

### Wager Flow

1. **Match creation:** Player 1 chooses a token mint, a wager amount, and a platform fee (in basis points, max 10000). The mint is stored on `ChessMatch`. P1's tokens are transferred from their ATA to the `match_escrow` PDA.

2. **Joining:** Player 2 must match the exact wager amount in the same token mint. The program verifies the mint matches `chess_match.betting_token_mint` and the amount matches `chess_match.bet_amount_player_one`. P2's tokens are transferred to escrow.

3. **Settlement:** All arithmetic uses `checked_add`, `checked_mul`, `checked_div`, and `checked_sub` to prevent overflow. The platform fee is calculated as:
   ```
   fee = total_pot * platform_fee_basis_points / 10000
   winner_amount = total_pot - fee
   ```
   On a draw, each player receives `(total_pot - fee) / 2`.

### Platform Fee

- Configurable per match at creation time.
- Stored as basis points (1 bp = 0.01%). Maximum 10000 (100%).
- The fee wallet is configurable per match and validated at initialization.
- **Known issue:** The `platform_fee_ata` owner is not currently constrained in `process_match_settlement`. A fix adding `constraint = platform_fee_ata.owner == chess_match.platform_fee_wallet` is pending.

### Escrow Security

- The escrow PDA is the authority of the escrow token account — only the program can move funds.
- All CPIs use `Program<'info, Token>` — no raw invocations, no arbitrary CPI vulnerability.
- `payout_processed` flag prevents double-settlement.
- Anchor's `init` constraint prevents PDA re-initialization.

---

## Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Blockchain | Solana (devnet) | Active |
| Smart Contract | Anchor 1.1.2 (Rust), Solana 3.x crates | Active |
| Scaling | MagicBlock Ephemeral Rollups | Planned (Phase 2) |
| Frontend (Web) | Next.js 15, React 19, Tailwind CSS 4 | Scaffolded |
| Frontend (Mobile) | React Native (Expo) | Planned (Phase 3) |
| Wallet Adapter | @solana/wallet-adapter-react | Installed |
| State Management | Jotai | Installed |
| UI Components | Radix UI + shadcn/ui | Installed |
| Icons | Lucide React | Installed |
| Auth | Privy / Web3Auth | Planned |
| Session Keys | MagicBlock Delegation Program | Planned (Phase 2) |
| SDK | `@magic-chess/sdk` (TypeScript) | In progress |
| Indexing | Helius Enhanced Webhooks + PostgreSQL | Planned |
| Backend API | Fastify + Redis | Planned |
| Testing | `#[test]` (Rust), Mollusk (CU benchmarks), LiteSVM (integration) | Active |
| Linting | ESLint + Prettier | Active |
| Deployment | Vercel (web), EAS (mobile) | Planned |

---

## Events

All significant state transitions emit Anchor events for off-chain indexing.

| Event | Emitted On | Key Fields |
|-------|-----------|------------|
| `MatchCreatedEvent` | `initialize_match` | `match_id`, creator, mint, bet amount, timeout, fee |
| `PlayerJoinedEvent` | `join_match` | `match_id`, P1, P2, mint, bet per player |
| `MoveMadeEvent` | `make_move` | `match_id`, player, color, algebraic notation, from/to coordinates, promotion, FEN, check/checkmate/stalemate flags |
| `GameEndedEvent` | `make_move` (terminal), `resign_game`, `claim_timeout_win` | `match_id`, final status, winner, end reason |
| `PayoutEvent` | `process_match_settlement` (win) | `match_id`, winner, amount, platform fee |
| `DrawPayoutEvent` | `process_match_settlement` (draw) | `match_id`, white player, black player, amount each, fee |

---

## Security

| Check | Status |
|-------|--------|
| PDA seed derivation | Implemented — single source in `constants.rs`, bumps stored and verified |
| Signer checks | Implemented — all instructions verify signer identity against registered players |
| Account ownership | Implemented — token account owner constraints on init/join/settlement |
| Token mint validation | Implemented — mint checked against `chess_match.betting_token_mint` |
| Double-payout prevention | Implemented — `payout_processed` flag |
| Re-initialization prevention | Implemented — Anchor `init` constraint |
| Integer overflow | Protected — `checked_add`, `checked_mul`, `checked_div`, `checked_sub` throughout |
| Escrow authority | Verified — PDA signs for escrow token account CPIs |
| Arbitrary CPI | Safe — all CPIs use `Program<'info, Token>` |
| State machine | Clean — one-way: `WaitingForOpponent -> Active -> Terminal` |
| Platform fee ATA owner | **Pending fix** — owner constraint missing in settlement |
| Duplicate mutable accounts | **Pending fix** — no duplicate check in settlement |

For the full security analysis including all 13 audit findings, see [SELF_AUDIT.md](https://github.com/amalnathsathyan/magic-chess/blob/main/magic-chess-program/SELF_AUDIT.md).
