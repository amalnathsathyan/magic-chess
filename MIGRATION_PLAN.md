# Magic Speed Chess -- Migration Plan

## Objective

Migrate the Solana Anchor chess project from its current repo (accumulated technical debt: old template artifacts, hardcoded paths, mismatched mint addresses, wrong crate names) to a clean, fresh repository with latest dependencies.

Target: **MagicBlock hackathon submission** with ephemeral rollups support.

---

## 1. Latest Dependency Versions

| Dependency | Current Version | Latest Stable | Notes |
|------------|----------------|---------------|-------|
| `anchor-lang` (Rust) | 0.31.1 | **0.32.1** | Published Oct 10, 2025. Replaces `solana-program` monolith with smaller crates. IDL builds on stable Rust. |
| `anchor-spl` (Rust) | 0.31.1 | **0.32.1** | Matches anchor-lang. v1.0.0-rc.5 is available but use stable 0.32.1 for safety. |
| `@coral-xyz/anchor` (npm) | 0.31.1 | **0.32.1** | Must match on-chain anchor-lang version exactly. |
| `@solana/web3.js` (npm) | 1.98.1 | **1.98.4** | Last stable v1.x. v2 (`@solana/kit 7.0.0`) exists but is a major API rewrite -- stick with v1.x for now. |
| `solana-program` (Rust) | not used directly | **3.0.0** | In Anchor 0.32+, this is broken into smaller crates (`solana-pubkey`, `solana-instruction`, etc.). Anchor manages these internally. |
| `ephemeral-rollups-sdk` (Rust) | not used | **0.2.5** | MagicBlock SDK for ephemeral rollups. Required for the hackathon. |
| `@magicblock-labs/ephemeral-rollups-sdk` (npm) | not used | **0.6.5** | TypeScript client for ephemeral rollups. |
| `@solana/kit` (npm) | not used | **7.0.0** | Renamed successor to @solana/web3.js v2. Not recommended for now -- stick with web3.js v1.x stable. |
| Next.js | 15.3.1 | **16.0.3** | Active LTS. Turbopack stable, React Compiler stable. |
| React | 19.1.0 | **19.2.3** | Latest stable. React Compiler now stable in 19.2+. |
| TypeScript | 5.8.3 | **5.8.3** | No change needed -- current is latest. |
| Tailwind CSS | 4.1.4 | **4.1.4** | No change needed. |

**Important version constraint**: Anchor Rust `0.32.x` requires `@coral-xyz/anchor` npm `0.32.x`. These MUST match.

---

## 2. Current Repo Assessment

### 2.1 Known Bugs (to fix during migration)

| # | Bug | Severity | File | Fix |
|---|-----|----------|------|---- |
| 1 | **Cargo.toml lib name is "counter"** | High | `anchor/programs/speed-chess/Cargo.toml` line 10 | Change `name = "counter"` to `name = "speed_chess"` |
| 2 | **Token mint mismatch** | Critical | `initialize_match.rs` vs `join_match.rs` | initialize_match uses `"4tCTxt8..."` / `"So111..."`; join_match uses `"SENDYLj..."` / `"WSiBAnr..."`. Tests use join_match's addresses. Fix: extract both to `constants.rs`, use same addresses from tests. |
| 3 | **Hardcoded absolute paths** | Medium | `tests/speed_chess.test.ts`, `integration-scripts/*.ts` | Replace `/Users/amalnathsathyan/Documents/trycatchblock/...` with relative `path.resolve(__dirname, ...)` or env vars. |
| 4 | **Dead code: transfer_tokens_with_signer** | Low | `utils/payout_logic.rs` lines 11-31 | Function is defined but never called (inlined CPI used instead). Remove it. |
| 5 | **Dead error variant: InvalidMovePathBlocked** | Low | `errors/mod.rs` | The `InvalidMovePathBlocked` error is defined but never returned anywhere; all path-blocking logic already returns `InvalidMoveIllegalPieceMovement`. Remove or repurpose the variant. |
| 6 | **Platform fee ATA missing owner constraint** | Medium | `process_match_settlement.rs` | The `platform_fee_ata` account lacks a `constraint = platform_fee_ata.owner == platform_pubkey` check. Add it. |
| 7 | **Missing escrow bump storage** | Medium | `state/chess_match.rs` | The escrow PDA bump is not stored in ChessMatch, forcing `find_program_address` lookup in every settlement instruction. Add `escrow_bump: u8` field. |
| 8 | **No duplicate mutable account check** | Low | `process_match_settlement.rs` | Settlement could reference the same token account twice for a draw. Rust's borrow checker prevents this in the accounts struct, but no explicit check exists. |
| 9 | **Root package.json wrong name** | Low | `package.json` | Name is `"legacy-next-tailwind-counter"` -- leftover from anchor template. Change to `"magic-speed-chess"`. |
| 10 | **Test 3.7 (Pawn Promotion) has wrong move coordinates** | High | `tests/speed_chess.test.ts` lines 1954-1967 | Step 7 sends a6-to-b7 (a capture) instead of a6-to-a7. Step 9 then tries b7-to-a8 promotion, but a8 is empty, making it an invalid diagonal pawn move. Fix: step 7 should be `(5,0)->(6,0)`, step 9 should be `(6,0)->(7,0)` with promotion. |
| 11 | **Missing abort_match instruction** | High | New file needed | No way for a match creator to cancel an unwanted match and reclaim escrowed tokens before anyone joins. |
| 12 | **Missing MagicBlock ephemeral instructions** | Critical | New files needed | No `delegate_match`, `commit_state`, `undelegate_match` instructions for ephemeral rollups integration. |
| 13 | **Missing crank/timeout scheduling** | Critical | New files needed | No `schedule_timeout` or `cancel_timeout_task` instructions for automated timeout enforcement (required for MagicBlock ephemeral validator). |

### 2.1.1 Code Quality Notes (not bugs, but worth addressing)

| Note | File | Description |
|------|------|-------------|
| Redundant halfmove clock check | `chess_logic.rs` line 163 | `actual_captured_piece.is_some()` is redundant with `is_capture` flag (set for all captures including en passant). |
| Unvalidated u8 arithmetic | `chess_logic.rs` lines 95, 122 | En passant pawn-row calculation uses raw `u8` subtraction. Safe in practice per chess rules, but should use `checked_sub`/`checked_add` for on-chain defense-in-depth. |
| Castling simulation vs actual deviation | `chess_logic.rs` lines 102, 137-139 | Simulation silently ignores missing rook (`if let`), actual code errors (`else { return err!(...) }`). Safe because castling validity is checked beforehand, but inconsistent. |
| Redundant `dr_total == 0` check | `chess_logic.rs` line 398 | Same-square case caught upstream, making the `== 0` check in `is_path_clear_diagonal` dead code. |
| Dead `new()` method | `castling_rights.rs` | `new()` simply delegates to `default()`. Redundant. |

### 2.2 Template Artifacts to Delete

| Location | Reason |
|----------|--------|
| `src/app/counter/` | Anchor counter template |
| `src/app/account/` | Anchor account template |
| `src/components/counter/` | Counter UI template |
| `src/components/account/` | Account UI template |
| `src/components/cluster/` | Cluster data access template |
| `src/components/dashboard/` | Dashboard template |
| `src/components/app-hero.tsx` | Template hero section |
| `src/components/app-alert.tsx` | Template alert |
| `src/components/app-modal.tsx` | Template modal |
| `src/components/app-footer.tsx` | Template footer |
| `src/components/app-layout.tsx` | Template layout (rewrite for chess) |
| `src/app/favicon.ico` | Replace with chess-themed favicon |

---

## 3. Final Repository Structure

```
magic-speed-chess/
├── README.md
├── SPEC.md
├── MIGRATION_PLAN.md                  # This file
├── .gitignore
├── package.json                       # Root workspace: scripts only
├── tsconfig.json                      # Root TS config
│
├── program/                           # Anchor program (clean scaffold)
│   ├── Anchor.toml
│   ├── Cargo.toml                     # Workspace root
│   ├── programs/
│   │   └── speed_chess/
│   │       ├── Cargo.toml             # Program crate
│   │       └── src/
│   │           ├── lib.rs             # Entry point with #[ephemeral] macro
│   │           ├── constants.rs       # NEW - shared config (mints, seeds, fees)
│   │           ├── errors/
│   │           │   └── mod.rs
│   │           ├── events/
│   │           │   └── mod.rs
│   │           ├── instructions/
│   │           │   ├── mod.rs
│   │           │   ├── initialize_match.rs
│   │           │   ├── join_match.rs
│   │           │   ├── make_move.rs
│   │           │   ├── resign_game.rs
│   │           │   ├── claim_timeout_win.rs
│   │           │   ├── process_match_settlement.rs
│   │           │   ├── abort_match.rs          # NEW
│   │           │   ├── delegate_match.rs        # NEW
│   │           │   ├── commit_state.rs          # NEW
│   │           │   ├── undelegate_match.rs      # NEW
│   │           │   ├── schedule_timeout.rs      # NEW
│   │           │   └── cancel_timeout_task.rs   # NEW
│   │           ├── state/
│   │           │   ├── mod.rs
│   │           │   ├── chess_match.rs
│   │           │   ├── piece.rs
│   │           │   ├── enums.rs
│   │           │   ├── castling_rights.rs
│   │           │   └── en_passant_square.rs
│   │           └── utils/
│   │               ├── mod.rs
│   │               ├── chess_logic.rs
│   │               └── payout_logic.rs
│   └── tests/
│       ├── speed_chess.test.ts        # Integration tests
│       ├── chess_logic_tests.rs       # NEW - Rust unit tests for chess logic
│       ├── payout_tests.rs            # NEW - Payout logic unit tests
│       └── cu_benchmarks.rs           # NEW - Compute unit benchmarks
│
├── sdk/                               # TypeScript SDK (generated + manual wrappers)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── idl/
│       │   └── speed_chess.ts         # Generated IDL type
│       ├── types/
│       │   └── index.ts               # Re-exported program types
│       ├── client/
│       │   └── speed-chess-client.ts  # Typed RPC client wrapper
│       └── utils/
│           └── pda.ts                 # PDA derivation helpers
│
├── frontend/                          # Next.js app
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx              # Landing / lobby
│       │   ├── globals.css
│       │   ├── game/
│       │   │   └── [matchId]/
│       │   │       └── page.tsx      # Game board page
│       │   └── create/
│       │       └── page.tsx          # Create match form
│       ├── components/
│       │   ├── ui/                   # shadcn components (unchanged)
│       │   ├── solana/
│       │   │   └── solana-provider.tsx
│       │   ├── theme-provider.tsx
│       │   ├── chess-board.tsx       # NEW - interactive chessboard
│       │   ├── match-lobby.tsx       # NEW - match listing
│       │   └── wallet-adapter.tsx    # NEW - wallet connection
│       └── lib/
│           └── utils.ts
│
├── backend/                           # Fastify API (optional - for matchmaking)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       └── routes/
│           └── matches.ts
│
└── scripts/                           # Integration / deployment scripts
    ├── deploy-program.ts
    ├── mint-test-tokens.ts
    └── test-keys/
        ├── white-player.json
        ├── black-player.json
        └── test-usdc.json
```

---

## 4. Phase-by-Phase Migration Steps

### Phase 1: Scaffold the New Repo

```bash
# 1. Create the new repo on GitHub (do NOT initialize with README)
#    git@github.com:<your-org>/magic-speed-chess.git

# 2. Clone into a clean directory
git clone git@github.com:<your-org>/magic-speed-chess.git
cd magic-speed-chess

# 3. Initialize Anchor with exact version
#    Note: Install the correct Anchor CLI version first
avm install 0.32.1
avm use 0.32.1
anchor init program --no-git --typescript
# This creates program/ with Anchor.toml, Cargo.toml, programs/<name>/, tests/

# 4. Rename the default program to speed_chess
mv program/programs/<default-name> program/programs/speed_chess

# 5. Create Next.js frontend
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --no-import-alias \
  --turbopack

# 6. Create SDK package directory
mkdir -p sdk/src/{idl,types,client,utils}

# 7. Create scripts directory
mkdir -p scripts/test-keys

# 8. Initialize root package.json for workspace management
npm init -y
```

### Phase 2: Copy Pure Logic Files (no changes needed)

These files contain game logic that does not depend on Anchor version or token config. Copy them verbatim:

```bash
SRC_OLD="/Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor/programs/speed-chess/src"
SRC_NEW="program/programs/speed_chess/src"

# State files (pure data structures)
cp "$SRC_OLD/state/piece.rs"           "$SRC_NEW/state/piece.rs"
cp "$SRC_OLD/state/enums.rs"           "$SRC_NEW/state/enums.rs"
cp "$SRC_OLD/state/castling_rights.rs" "$SRC_NEW/state/castling_rights.rs"
cp "$SRC_OLD/state/en_passant_square.rs" "$SRC_NEW/state/en_passant_square.rs"

# Chess logic (pure game rules)
cp "$SRC_OLD/utils/chess_logic.rs"     "$SRC_NEW/utils/chess_logic.rs"
```

### Phase 3: Rewrite Files with Fixes Applied

#### 3.1 `constants.rs` (NEW FILE)

Create `program/programs/speed_chess/src/constants.rs`:

```rust
use solana_program::pubkey::Pubkey;
// or in anchor 0.32: use solana_pubkey::Pubkey;

/// Seed prefixes for PDA derivation
pub const CHESS_MATCH_SEED: &[u8] = b"chess_match";
pub const MATCH_ESCROW_SEED: &[u8] = b"match_escrow";
pub const DELEGATION_RECORD_SEED: &[u8] = b"delegation_record";
pub const TIMEOUT_TASK_SEED: &[u8] = b"timeout_task";
pub const COMMITMENT_SEED: &[u8] = b"commitment";

/// Allowed betting token mint addresses (MUST be the same in all instructions)
/// These match the mock tokens created by the test setup
pub const SEND_TOKEN_MINT: Pubkey = pubkey!("SENDYLjLBaTgjyfXtPP2aHUt91WhNzX7iUfpThyApht");
pub const WSOL_MINT: Pubkey = pubkey!("WSiBAnrREwNLdGkDpXuqdKL4fJvAHeJhDfehmFdMdvw");

/// Bet amounts (in token native units)
pub const SEND_BET_AMOUNT: u64 = 10_000_000;   // 10 SEND (6 decimals)
pub const WSOL_BET_AMOUNT: u64 = 100_000_000;  // 0.1 wSOL (9 decimals)

/// Platform fee receiver wallet
pub const PLATFORM_FEE_WALLET: Pubkey = pubkey!("un72dZJgdTp7x6Ckgxhk8p5bpVu3Mt23wSm1f6FNVeG");

/// Maximum fee in basis points (10000 = 100%)
pub const MAX_PLATFORM_FEE_BPS: u16 = 10000;

/// Maximum match ID length
pub const MAX_MATCH_ID_LEN: usize = 32;
pub const MAX_PLAYERS: usize = 2;
```

#### 3.2 `state/chess_match.rs` (REWRITE -- add MagicBlock fields)

Key changes from current:
- Add `escrow_bump: u8` (store escrow PDA bump -- fix for bug #6)
- Add `prediction_enabled: bool` (for rollup-accelerated prediction)
- Add `committed_at_slot: Option<u64>` (for state commitment tracking)
- Add `is_delegated: bool` (for ephemeral delegation tracking)

```rust
// src/state/chess_match.rs
use crate::state::*;
use anchor_lang::prelude::*;

pub const MAX_PLAYERS: usize = 2;
pub const MAX_MATCH_ID_LEN: usize = 32;

#[account]
#[derive(InitSpace, Debug)]
pub struct ChessMatch {
    #[max_len(MAX_MATCH_ID_LEN)]
    pub match_id: String,
    pub players: [Pubkey; MAX_PLAYERS],
    pub current_player_idx: u8,
    pub current_turn: PlayerColor,

    pub last_move_timestamp: i64,
    pub move_timeout_duration: i64,

    pub game_status: GameStatus,
    pub game_end_reason: Option<GameEndReason>,

    pub board: [[Option<Piece>; 8]; 8],
    pub castling_rights: CastlingRights,
    pub en_passant_target: Option<EnPassantSquare>,
    pub halfmove_clock: u8,
    pub fullmove_number: u16,

    pub betting_token_mint: Pubkey,
    pub bet_amount_player_one: u64,
    pub bet_amount_player_two: u64,
    pub total_pot: u64,
    pub platform_fee_basis_points: u16,
    pub payout_processed: bool,

    pub bump: u8,                       // chess_match PDA bump
    pub escrow_bump: u8,               // NEW - match_escrow PDA bump (fix for bug #6)

    // MagicBlock ephemeral rollup fields
    pub prediction_enabled: bool,       // NEW - whether predictions are enabled
    pub committed_at_slot: Option<u64>, // NEW - slot when state was last committed
    pub is_delegated: bool,             // NEW - whether match is delegated to ephemeral validator
}
```

#### 3.3 `instructions/initialize_match.rs` (REWRITE)

Changes:
- Use `constants.rs` instead of inline consts (fix for bug #2)
- Accept `betting_token_mint` generically instead of checking against hardcoded list
- Add `prediction_enabled_arg: bool` parameter
- Store `escrow_bump` (fix for bug #6)

```rust
// src/instructions/initialize_match.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::ChessError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(
    match_id_arg: String,
    bet_amount_arg: u64,
    move_timeout_duration_arg: i64,
    platform_fee_basis_points_arg: u16,
    prediction_enabled_arg: bool,      // NEW
)]
pub struct InitializeMatch<'info> {
    #[account(
        init,
        payer = player_signer,
        space = 8 + ChessMatch::INIT_SPACE,
        seeds = [CHESS_MATCH_SEED, match_id_arg.as_bytes()],
        bump
    )]
    pub chess_match: Account<'info, ChessMatch>,

    #[account(mut)]
    pub player_signer: Signer<'info>,

    pub betting_token_mint_account: Account<'info, Mint>,

    #[account(
        mut,
        constraint = player_token_account.owner == player_signer.key() @ ChessError::InvalidOwner,
        constraint = player_token_account.mint == betting_token_mint_account.key() @ ChessError::InvalidMint
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = player_signer,
        seeds = [MATCH_ESCROW_SEED, match_id_arg.as_bytes()],
        bump,
        token::mint = betting_token_mint_account,
        token::authority = chess_match
    )]
    pub match_escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeMatch>,
    match_id_arg: String,
    bet_amount_arg: u64,
    move_timeout_duration_arg: i64,
    platform_fee_basis_points_arg: u16,
    prediction_enabled_arg: bool,
) -> Result<()> {
    let chess_match = &mut ctx.accounts.chess_match;
    let player_signer = &ctx.accounts.player_signer;
    let clock = Clock::get()?;

    // 1. Validate match_id length
    require!(
        !match_id_arg.is_empty() && match_id_arg.len() <= MAX_MATCH_ID_LEN,
        ChessError::InvalidMatchIdLength
    );

    // 2. Validate bet amount > 0
    require!(bet_amount_arg > 0, ChessError::InvalidBetAmount);

    // 3. Validate platform fee
    require!(
        platform_fee_basis_points_arg <= MAX_PLATFORM_FEE_BPS,
        ChessError::InvalidPlatformFee
    );

    // 4. Initialize ChessMatch account
    chess_match.match_id = match_id_arg.clone();
    chess_match.players[0] = player_signer.key();
    chess_match.players[1] = Pubkey::default();
    chess_match.current_player_idx = 0;
    chess_match.current_turn = PlayerColor::White;
    chess_match.last_move_timestamp = clock.unix_timestamp;
    chess_match.move_timeout_duration = move_timeout_duration_arg;
    chess_match.game_status = GameStatus::WaitingForOpponent;
    chess_match.game_end_reason = None;
    chess_match.board = chess_logic::initialize_chess_board();
    chess_match.castling_rights = CastlingRights::default();
    chess_match.en_passant_target = None;
    chess_match.halfmove_clock = 0;
    chess_match.fullmove_number = 1;
    chess_match.betting_token_mint = ctx.accounts.betting_token_mint_account.key();
    chess_match.bet_amount_player_one = bet_amount_arg;
    chess_match.bet_amount_player_two = 0;
    chess_match.total_pot = bet_amount_arg;
    chess_match.platform_fee_basis_points = platform_fee_basis_points_arg;
    chess_match.payout_processed = false;
    chess_match.bump = ctx.bumps.chess_match;
    chess_match.escrow_bump = ctx.bumps.match_escrow_token_account;  // NEW
    chess_match.prediction_enabled = prediction_enabled_arg;          // NEW
    chess_match.committed_at_slot = None;                             // NEW
    chess_match.is_delegated = false;                                 // NEW

    // 5. Transfer the bet to escrow
    let cpi_accounts = Transfer {
        from: ctx.accounts.player_token_account.to_account_info(),
        to: ctx.accounts.match_escrow_token_account.to_account_info(),
        authority: player_signer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, bet_amount_arg)?;

    // 6. Emit event
    emit!(MatchCreatedEvent {
        match_id: chess_match.match_id.clone(),
        creator: player_signer.key(),
        betting_token_mint: chess_match.betting_token_mint,
        bet_amount: bet_amount_arg,
        move_timeout_duration: move_timeout_duration_arg,
        platform_fee_basis_points: platform_fee_basis_points_arg,
    });

    msg!("Match created: {}", chess_match.match_id);
    Ok(())
}
```

#### 3.4 `instructions/join_match.rs` (REWRITE)

Changes:
- Use `constants.rs` instead of inline consts (fix for bug #2)
- Remove redundant mint validation (already constrained by account)
- Use stored `escrow_bump`

```rust
// Key change: Remove the SEND_TOKEN_MINT_STR / WSOL_MINT_STR constants
// and the associated hardcoded bet amount checks.
// Instead, validate that bet_amount_arg == chess_match.bet_amount_player_one.
// The mint is already constrained by the account constraint.
// Use chess_match.escrow_bump for the escrow PDA seed validation.

// The struct changes:
#[account(
    mut,
    seeds = [MATCH_ESCROW_SEED, chess_match.match_id.as_bytes()],
    bump = chess_match.escrow_bump,  // Use stored escrow bump
)]
pub match_escrow_token_account: Account<'info, TokenAccount>,
```

#### 3.5 `Cargo.toml` (REWRITE)

```toml
[package]
name = "speed_chess"
version = "0.1.0"
description = "Magic Speed Chess - Betting chess game on Solana with ephemeral rollups"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "speed_chess"     # FIX: was "counter" (bug #1)

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = "0.32.1"
anchor-spl = "0.32.1"
ephemeral-rollups-sdk = "0.2.5"   # NEW - MagicBlock SDK
bincode = "1.3.3"                  # NEW - state serialization for commitments
```

#### 3.6 `Anchor.toml` (REWRITE)

```toml
[toolchain]
anchor_version = "0.32.1"          # Add this -- required in newer Anchor
package_manager = "yarn"

[features]
resolution = true
skip-lint = false

[programs.localnet]
speed_chess = "9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9"

[programs.devnet]
speed_chess = "9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json tests/**/*.test.ts"
```

#### 3.7 `lib.rs` (REWRITE -- add #[ephemeral] and new instructions)

```rust
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::ephemeral;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9");

#[ephemeral]      // <-- MagicBlock: registers program for ephemeral rollups
#[program]
pub mod speed_chess {
    use super::*;

    // --- Existing instructions (unchanged signatures) ---

    pub fn initialize_match(
        ctx: Context<InitializeMatch>,
        match_id_arg: String,
        bet_amount_arg: u64,
        move_timeout_duration_arg: i64,
        platform_fee_basis_points_arg: u16,
        prediction_enabled_arg: bool,        // NEW parameter
    ) -> Result<()> {
        instructions::initialize_match::handler(
            ctx, match_id_arg, bet_amount_arg,
            move_timeout_duration_arg, platform_fee_basis_points_arg,
            prediction_enabled_arg,
        )
    }

    pub fn join_match(ctx: Context<JoinMatch>, bet_amount_arg: u64) -> Result<()> {
        instructions::join_match::handler(ctx, bet_amount_arg)
    }

    pub fn make_move(ctx: Context<MakeMove>, args: MakeMoveArgs) -> Result<()> {
        instructions::make_move::handler(ctx, args)
    }

    pub fn resign_game(ctx: Context<ResignGame>) -> Result<()> {
        instructions::resign_game::handler(ctx)
    }

    pub fn claim_timeout_win(ctx: Context<ClaimTimeoutWin>) -> Result<()> {
        instructions::claim_timeout_win::handler(ctx)
    }

    pub fn process_match_settlement(ctx: Context<ProcessMatchSettlement>) -> Result<()> {
        instructions::process_match_settlement::handler(ctx)
    }

    // --- NEW Ephemeral Rollup instructions ---

    /// Cancel an unwanted match before anyone joins (creator reclaims escrow)
    pub fn abort_match(ctx: Context<AbortMatch>) -> Result<()> {
        instructions::abort_match::handler(ctx)
    }

    /// Delegate match state to MagicBlock ephemeral validator for low-latency
    pub fn delegate_match(ctx: Context<DelegateMatch>) -> Result<()> {
        instructions::delegate_match::handler(ctx)
    }

    /// Commit game state from ephemeral rollup back to base layer
    pub fn commit_state(ctx: Context<CommitState>, state_data: Vec<u8>) -> Result<()> {
        instructions::commit_state::handler(ctx, state_data)
    }

    /// Undelegate match from ephemeral validator, settling final state
    pub fn undelegate_match(ctx: Context<UndelegateMatch>) -> Result<()> {
        instructions::undelegate_match::handler(ctx)
    }

    /// Schedule an automated timeout check via the ephemeral validator crank
    pub fn schedule_timeout(ctx: Context<ScheduleTimeout>, delay_seconds: i64) -> Result<()> {
        instructions::schedule_timeout::handler(ctx, delay_seconds)
    }

    /// Cancel a previously scheduled timeout check
    pub fn cancel_timeout_task(ctx: Context<CancelTimeoutTask>) -> Result<()> {
        instructions::cancel_timeout_task::handler(ctx)
    }
}
```

#### 3.8 `instructions/mod.rs` (REWRITE)

```rust
pub mod initialize_match;
pub mod join_match;
pub mod make_move;
pub mod resign_game;
pub mod claim_timeout_win;
pub mod process_match_settlement;
pub mod abort_match;           // NEW
pub mod delegate_match;        // NEW
pub mod commit_state;          // NEW
pub mod undelegate_match;      // NEW
pub mod schedule_timeout;      // NEW
pub mod cancel_timeout_task;   // NEW

pub use initialize_match::*;
pub use join_match::*;
pub use make_move::*;
pub use resign_game::*;
pub use claim_timeout_win::*;
pub use process_match_settlement::*;
pub use abort_match::*;
pub use delegate_match::*;
pub use commit_state::*;
pub use undelegate_match::*;
pub use schedule_timeout::*;
pub use cancel_timeout_task::*;
```

#### 3.9 `utils/payout_logic.rs` (FIX -- remove dead code)

Remove the unused `transfer_tokens_with_signer` helper function (lines 11-31).
Use the stored `escrow_bump` from `ChessMatch` instead of re-deriving the PDA.

```rust
// Remove lines 11-31 (the dead transfer_tokens_with_signer function)

// In process_payout and process_draw_payout, use:
let match_id_bytes = chess_match.match_id.as_bytes();
let seeds: &[&[u8]] = &[
    MATCH_ESCROW_SEED,
    match_id_bytes,
    &[chess_match.escrow_bump],  // Use stored escrow_bump instead of re-deriving
];
```

#### 3.10 `errors/mod.rs` (ADD new error variants)

Add these error variants at the end of the `ChessError` enum:

```rust
// --- New MagicBlock-related errors ---
#[msg("Match must be in WaitingForOpponent status to abort.")]
MatchNotAbortable,
#[msg("Only the match creator can abort the match.")]
NotMatchCreator,
#[msg("Match is already delegated to an ephemeral validator.")]
AlreadyDelegated,
#[msg("Match is not currently delegated.")]
NotDelegated,
#[msg("Invalid state commitment data.")]
InvalidCommitmentData,
#[msg("State commitment slot is too old.")]
StaleCommitment,
#[msg("Timeout task already scheduled.")]
TimeoutTaskAlreadyScheduled,
#[msg("No timeout task is currently scheduled.")]
NoTimeoutTaskScheduled,
#[msg("Unauthorized: only the delegated validator can perform this action.")]
UnauthorizedDelegatedAction,
```

#### 3.11 `events/mod.rs` (ADD new events)

```rust
#[event]
pub struct MatchAbortedEvent {
    pub match_id: String,
    pub creator: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct MatchDelegatedEvent {
    pub match_id: String,
    pub delegation_slot: u64,
}

#[event]
pub struct StateCommittedEvent {
    pub match_id: String,
    pub committed_at_slot: u64,
    pub state_hash: [u8; 32],
}

#[event]
pub struct MatchUndelegatedEvent {
    pub match_id: String,
    pub final_slot: u64,
}

#[event]
pub struct TimeoutScheduledEvent {
    pub match_id: String,
    pub scheduled_at: i64,
    pub trigger_at: i64,
}

#[event]
pub struct TimeoutCancelledEvent {
    pub match_id: String,
}
```

### Phase 4: New Instruction Stubs

#### 4.1 `abort_match.rs` (NEW)

Allows the match creator to cancel a match that has no opponent yet, reclaiming escrowed tokens.

```rust
// Stub structure:
// - Accounts: chess_match (mut, seeds, WaitingForOpponent), creator_signer, match_escrow (mut, seeds), creator_ata (mut), token_program
// - Logic: verify signer == players[0], verify status == WaitingForOpponent, transfer escrow back to creator, close escrow account, close chess_match account
// - Emit: MatchAbortedEvent
```

#### 4.2 `delegate_match.rs` (NEW)

Delegates match computation to MagicBlock ephemeral validator.

```rust
// Stub structure:
// - Accounts: chess_match (mut, seeds), delegator_signer, delegation_record (init, PDA), system_program
// - Uses ephemeral_rollups_sdk::delegate macro or cpi
// - Sets chess_match.is_delegated = true
// - Emit: MatchDelegatedEvent
```

#### 4.3 `commit_state.rs` (NEW)

Called by the ephemeral validator to checkpoint game state to the base layer.

```rust
// Stub structure:
// - Accounts: chess_match (mut, seeds), validator_signer (must be ephemeral validator)
// - Args: state_data (serialized ChessMatch state as Vec<u8>)
// - Deserialize and verify state_data matches chess_match
// - Store committed_at_slot = Clock::get()?.slot
// - Emit: StateCommittedEvent
```

#### 4.4 `undelegate_match.rs` (NEW)

Settles the final state from ephemeral rollup back to base layer and undelegates.

```rust
// Stub structure:
// - Accounts: chess_match (mut, seeds), validator_signer
// - Verify is_delegated == true
// - Set is_delegated = false
// - Emit: MatchUndelegatedEvent
```

#### 4.5 `schedule_timeout.rs` (NEW)

Schedules an automated timeout check after N seconds.

```rust
// Stub structure:
// - Accounts: chess_match (seeds), scheduler_signer, timeout_task (init, PDA)
// - Args: delay_seconds
// - Uses ephemeral_rollups_sdk::crank::schedule or equivalent
// - Emit: TimeoutScheduledEvent
```

#### 4.6 `cancel_timeout_task.rs` (NEW)

Cancels a previously scheduled timeout (e.g., after a move is made).

```rust
// Stub structure:
// - Accounts: chess_match (seeds), timeout_task (mut, seeds, close), canceller_signer
// - Close timeout_task PDA, refund rent
// - Emit: TimeoutCancelledEvent
```

### Phase 5: Test Files

#### 5.1 Copy and Fix `speed_chess.test.ts`

```bash
cp "$OLD_REPO/anchor/tests/speed_chess.test.ts" program/tests/speed_chess.test.ts
cp -r "$OLD_REPO/anchor/tests/test-keys" program/tests/test-keys
```

Then fix all hardcoded paths (bug #3):

```typescript
// BEFORE (broken):
const keypair = await getKeypairFromFile(
  '/Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor/tests/test-keys/SENDYLj...json'
);

// AFTER (portable):
import path from 'path';
const keypair = await getKeypairFromFile(
  path.resolve(__dirname, 'test-keys', 'SENDYLjLBaTgjyfXtPP2aHUt91WhNzX7iUfpThyApht.json')
);
```

Also replace all hardcoded mint addresses with imports from a shared test constants file:

```typescript
// tests/test-constants.ts (NEW)
export const SEND_MINT = new PublicKey("SENDYLjLBaTgjyfXtPP2aHUt91WhNzX7iUfpThyApht");
export const WSOL_MINT = new PublicKey("WSiBAnrREwNLdGkDpXuqdKL4fJvAHeJhDfehmFdMdvw");
export const PLATFORM_WALLET = new PublicKey("un72dZJgdTp7x6Ckgxhk8p5bpVu3Mt23wSm1f6FNVeG");
```

Also fix **Test 3.7 Pawn Promotion** (bug #10). The test has wrong move coordinates that cause an invalid move. Correct sequence:

```typescript
// BEFORE (broken -- lines ~1954-1967):
// Step 7: a6-to-b7 (diagonal capture, wrong column)
fromRow: 5, fromCol: 0, toRow: 6, toCol: 1
// Step 9: b7-to-a8 with promotion (invalid -- a8 is empty, pawn cannot move diagonal without capture)
fromRow: 6, fromCol: 1, toRow: 7, toCol: 0, promotion: { queen: {} }

// AFTER (corrected):
// Step 7: a6-to-a7 (straight push)
fromRow: 5, fromCol: 0, toRow: 6, toCol: 0
// Step 9: a7-to-a8=Q (straight push with promotion)
fromRow: 6, fromCol: 0, toRow: 7, toCol: 0, promotion: { queen: {} }
```

**Note on castling direction check**: The code at `chess_logic.rs` lines 101, 135, and 228 correctly uses `> 0` (without `.abs()`) to determine kingside vs queenside castling direction. This was flagged as a potential `.abs() > 0` bug in earlier analysis, but investigation confirmed the code is correct -- it needs the signed comparison to distinguish positive (kingside) from negative (queenside) column differences.

#### 5.2 Create `chess_logic_tests.rs` (NEW)

Rust unit tests for chess rules, independent of Anchor/blockchain.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_board_setup() { /* ... */ }
    #[test]
    fn test_pawn_moves() { /* ... */ }
    #[test]
    fn test_en_passant() { /* ... */ }
    #[test]
    fn test_castling_kingside() { /* ... */ }
    #[test]
    fn test_castling_queenside() { /* ... */ }
    #[test]
    fn test_check_detection() { /* ... */ }
    #[test]
    fn test_checkmate_scholars_mate() { /* ... */ }
    #[test]
    fn test_stalemate_detection() { /* ... */ }
    #[test]
    fn test_insufficient_material() { /* ... */ }
    #[test]
    fn test_fifty_move_rule() { /* ... */ }
}
```

#### 5.3 Create `payout_tests.rs` (NEW)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_winner_payout_calculation() { /* ... */ }
    #[test]
    fn test_draw_payout_calculation() { /* ... */ }
    #[test]
    fn test_platform_fee_calculation() { /* ... */ }
    #[test]
    fn test_zero_fee_payout() { /* ... */ }
}
```

#### 5.4 Create `cu_benchmarks.rs` (NEW)

```rust
#[cfg(test)]
mod tests {
    /// Measure compute units for each instruction
    #[test]
    fn bench_initialize_match() { /* ... */ }
    #[test]
    fn bench_make_move() { /* ... */ }
    #[test]
    fn bench_process_settlement() { /* ... */ }
}
```

### Phase 6: Frontend Migration

#### 6.1 Setup

```bash
cd frontend
npm install \
  @coral-xyz/anchor@^0.32.1 \
  @solana/web3.js@^1.98.4 \
  @solana/wallet-adapter-base@^0.9.26 \
  @solana/wallet-adapter-react@^0.15.38 \
  @solana/wallet-adapter-react-ui@^0.9.38 \
  @solana/spl-token@^0.4.13 \
  @magicblock-labs/ephemeral-rollups-sdk@^0.6.5 \
  @tanstack/react-query@^5.74.4 \
  jotai@^2.12.3 \
  lucide-react@^0.503.0 \
  chess.js@^1.0.0-beta.8 \
  react-chessboard@^1.0.0 \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-label \
  @radix-ui/react-slot \
  class-variance-authority \
  clsx \
  tailwind-merge \
  sonner \
  next-themes

npm install -D \
  @types/react@^19.2.0 \
  @types/react-dom@^19.2.0 \
  @types/node@^22.14.1 \
  typescript@^5.8.3 \
  @tailwindcss/postcss \
  tailwindcss@^4.1.4 \
  tw-animate-css \
  eslint@^9.25.1 \
  eslint-config-next@16.0.3
```

#### 6.2 Delete Template Components

```bash
rm -rf frontend/src/app/counter
rm -rf frontend/src/app/account
rm -rf frontend/src/components/counter
rm -rf frontend/src/components/account
rm -rf frontend/src/components/cluster
rm -rf frontend/src/components/dashboard
rm frontend/src/components/app-hero.tsx
rm frontend/src/components/app-alert.tsx
rm frontend/src/components/app-modal.tsx
rm frontend/src/components/app-footer.tsx
rm frontend/src/components/app-header.tsx
rm frontend/src/components/app-layout.tsx
```

#### 6.3 Keep & Copy Components

Keep these from the template (they are shadcn/ui and utility components):
- `frontend/src/components/ui/*` - all shadcn components
- `frontend/src/components/solana/solana-provider.tsx`
- `frontend/src/components/theme-provider.tsx`
- `frontend/src/components/theme-select.tsx`
- `frontend/src/components/react-query-provider.tsx`
- `frontend/src/components/use-transaction-toast.tsx`
- `frontend/src/lib/utils.ts`
- `frontend/src/app/globals.css`

#### 6.4 New Chess-Specific Frontend Pages

Create these new pages:
- `frontend/src/app/page.tsx` -- Match lobby / landing page
- `frontend/src/app/create/page.tsx` -- Create match form
- `frontend/src/app/game/[matchId]/page.tsx` -- Active game board
- `frontend/src/components/chess-board.tsx` -- Interactive chessboard
- `frontend/src/components/match-lobby.tsx` -- Match listing component
- `frontend/src/components/wallet-adapter.tsx` -- Wallet connection wrapper

### Phase 7: .gitignore Update

```
# Dependencies
node_modules/
.pnp
.yarn/*

# Build outputs
.next/
out/
build/
dist/

# Anchor build artifacts
program/target/

# Test artifacts
test-ledger/
.anchor/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Environment
.env
.env.local
.env*.local

# OS
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo
next-env.d.ts
```

### Phase 8: Root package.json

```json
{
  "name": "magic-speed-chess",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build",
    "anchor:build": "cd program && anchor build",
    "anchor:test": "cd program && anchor test",
    "anchor:deploy": "cd program && anchor deploy",
    "lint": "cd frontend && npm run lint",
    "format": "prettier --write .",
    "sdk:generate": "cd program && anchor idl parse -f programs/speed_chess/src/lib.rs -o ../sdk/src/idl/speed_chess.ts",
    "scripts:deploy": "ts-node scripts/deploy-program.ts",
    "scripts:mint": "ts-node scripts/mint-test-tokens.ts"
  }
}
```

---

## 5. Known Bugs Fix Reference

| # | Bug | Severity | Fix Applied In |
|---|-----|----------|----------------|
| 1 | Cargo.toml lib name "counter" | **High** (program won't deploy with wrong lib name) | Phase 3.5: `Cargo.toml` |
| 2 | Token mint mismatch between init and join | **Critical** (join will always fail) | Phase 3.1: `constants.rs` |
| 3 | Hardcoded absolute paths in tests | **Medium** (tests fail on other machines) | Phase 5.1: `speed_chess.test.ts` |
| 4 | Dead code: transfer_tokens_with_signer | **Low** (dead code, no runtime effect) | Phase 3.9: `payout_logic.rs` |
| 5 | Dead error variant: InvalidMovePathBlocked | **Low** (never returned, misleading) | Phase 3.10: `errors/mod.rs` (remove or repurpose variant) |
| 6 | Platform fee ATA missing owner constraint | **Medium** (fee could be routed to wrong account) | Phase 3: `process_match_settlement.rs` rewrite |
| 7 | Missing escrow bump storage | **Medium** (unnecessary PDA re-derivation; potential mismatch) | Phase 3.2: `chess_match.rs` |
| 8 | No duplicate mutable account check in settlement | **Low** (Anchor borrow checker catches most cases) | Phase 3: `process_match_settlement.rs` |
| 9 | Root package.json name "legacy-next-tailwind-counter" | **Low** (cosmetic) | Phase 8: `package.json` |
| 10 | Test 3.7 pawn promotion wrong move coordinates | **High** (test will fail) | Phase 5.1: `speed_chess.test.ts` |
| 11 | Missing abort_match instruction | **High** (no way to cancel unwanted match) | Phase 4.1: `abort_match.rs` |
| 12 | Missing ephemeral rollup instructions | **Critical** (required for MagicBlock hackathon) | Phase 4: all new instructions |

---

## 6. Git Strategy

### 6.1 Preserving Chess Logic History

The chess logic files have clean commit history. To preserve it:

```bash
# Option A: Use git subtree (preserves full history)
cd new-repo
git remote add old ../magic-speed-chess
git fetch old
git checkout -b import-chess-logic old/integration/scripts
# Move files to new structure, then merge

# Option B: Cherry-pick with path rewriting (cleaner, partial history)
git format-patch <commit-range> -- program/programs/speed_chess/src/utils/chess_logic.rs
# Apply patches to new repo structure

# Option C (Simplest): Squash all old commits into one import commit
# Copy files, commit with message:
# "Import chess logic from original repo (squashed history)"
```

### 6.2 New Remote Setup

```bash
cd new-repo
git remote add origin git@github.com:<your-org>/magic-speed-chess.git
git branch -M main
git add .
git commit -m "Initial migration: clean scaffold with chess logic, ephemeral rollup support"
git push -u origin main
```

### 6.3 Branch Strategy

```
main              -- Production-ready, deployed to mainnet
  └── dev         -- Integration branch, deployed to devnet
       ├── feat/* -- Feature branches
       ├── fix/*  -- Bug fix branches
       └── chore/* -- Maintenance branches
```

---

## 7. Verification Checklist

After migration, verify each of these:

- [ ] `anchor build` succeeds in `program/` directory
- [ ] `cargo test` passes all Rust unit tests
- [ ] `anchor test` passes all TypeScript integration tests
- [ ] Program deploys to devnet without errors
- [ ] `initialize_match` creates a match successfully
- [ ] `join_match` allows a second player to join
- [ ] `make_move` processes valid chess moves
- [ ] `resign_game` correctly ends a game
- [ ] `claim_timeout_win` correctly awards timeout wins
- [ ] `process_match_settlement` correctly transfers tokens
- [ ] `abort_match` correctly cancels and refunds
- [ ] `delegate_match` correctly delegates to ephemeral validator
- [ ] `commit_state` correctly checkpoints state
- [ ] `undelegate_match` correctly undelegates
- [ ] `npm run dev` starts the frontend
- [ ] Frontend connects to wallet and displays matches
- [ ] SDK builds and exports correct types
- [ ] No hardcoded paths remain
- [ ] No template artifacts remain
- [ ] Cargo.toml `[lib] name` is `speed_chess`
- [ ] Package.json name is `magic-speed-chess`

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Anchor 0.32.1 API breaking changes from 0.31.1 | Medium | High | Check Anchor changelog for 0.32.0; update accounts/CPIs as needed. Test thoroughly. |
| ephemeral-rollups-sdk 0.2.5 incompatibility with Anchor 0.32.1 | Medium | High | MagicBlock SDK targets Anchor 0.30.x. Check compatibility matrix. Pin versions if needed. |
| Test keys not present in new repo | Low | Medium | Copy test-keys directory. These are mock devnet keys, not security-critical. |
| IDL generation changes in Anchor 0.32 | Medium | Low | Anchor 0.32 builds IDL on stable Rust. May need to update anchor idl commands. |
| MagicBlock validator not available on devnet | Medium | Medium | Ephemeral instructions will fail on devnet without MagicBlock validator. Test on localnet with MagicBlock validator Docker image. |

---

*Generated: August 2, 2026. Target: MagicBlock hackathon submission.*
