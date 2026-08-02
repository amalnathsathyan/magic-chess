# MVP Execution Order & Migration Plan

## Git Convention

All commits must end with:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Phase 0: Fresh Repo Setup (DO THIS FIRST)

### Step-by-step

```bash
# 1. Create new local folder
mkdir ~/Documents/magic-speed-chess-v2
cd ~/Documents/magic-speed-chess-v2

# 2. Init git
git init
git checkout -b main

# 3. Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
target/
.next/
.env
.env.local
*.log
.DS_Store
test-ledger/
dist/
EOF

# 4. First commit (empty scaffold)
git add .gitignore
git commit -m "chore: init repo

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Init Anchor project
anchor init program --no-git
# This creates program/ with Anchor boilerplate

# 6. Create folder structure
mkdir -p frontend backend sdk scripts
mkdir -p agent-findings

# 7. Copy agent findings
cp ~/Documents/trycatchblock/magic-speed-chess/agent-findings/*.md agent-findings/
cp ~/Documents/trycatchblock/magic-speed-chess/SPEC.md .
cp ~/Documents/trycatchblock/magic-speed-chess/README.md .
cp ~/Documents/trycatchblock/magic-speed-chess/BACKEND_DESIGN.md .
cp ~/Documents/trycatchblock/magic-speed-chess/MIGRATION_PLAN.md .
cp ~/Documents/trycatchblock/magic-speed-chess/DEPLOYMENT_PLAN.md .
cp ~/Documents/trycatchblock/magic-speed-chess/TOKEN_STRATEGY.md .
cp ~/Documents/trycatchblock/magic-speed-chess/FEE_SPLIT_DESIGN.md .
cp ~/Documents/trycatchblock/magic-speed-chess/HACKATHON_SHOWCASE.md .
cp ~/Documents/trycatchblock/magic-speed-chess/MVP-ORDER.md .

git add -A
git commit -m "docs: add agent findings, specs, and design documents

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## ORDERED MVP TASKS (Execute in this order)

### BLOCK 1: Core Program Compiles (CRITICAL — Must be first)

#### 1.1: Copy pure logic files (no changes needed)
Files to copy from old repo `anchor/programs/speed-chess/src/`:
- `utils/chess_logic.rs` → `program/programs/speed_chess/src/utils/chess_logic.rs`
- `state/piece.rs` → `program/programs/speed_chess/src/state/piece.rs`
- `state/enums.rs` → `program/programs/speed_chess/src/state/enums.rs`
- `state/castling_rights.rs` → `program/programs/speed_chess/src/state/castling_rights.rs`
- `state/en_passant_square.rs` → `program/programs/speed_chess/src/state/en_passant_square.rs`
- `errors/mod.rs` → `program/programs/speed_chess/src/errors/mod.rs`
- `events/mod.rs` → `program/programs/speed_chess/src/events/mod.rs`

```bash
# From the old repo
SRC=~/Documents/trycatchblock/magic-speed-chess/anchor/programs/speed-chess/src
DST=~/Documents/magic-speed-chess-v2/program/programs/speed_chess/src

cp $SRC/utils/chess_logic.rs $DST/utils/chess_logic.rs
cp $SRC/state/piece.rs $DST/state/piece.rs
cp $SRC/state/enums.rs $DST/state/enums.rs
cp $SRC/state/castling_rights.rs $DST/state/castling_rights.rs
cp $SRC/state/en_passant_square.rs $DST/state/en_passant_square.rs
cp $SRC/errors/mod.rs $DST/errors/mod.rs
cp $SRC/events/mod.rs $DST/events/mod.rs

git add -A
git commit -m "feat: copy chess logic, state types, errors, and events

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### 1.2: Copy instruction files with fixes applied
Files from old repo (ALREADY FIXED in current working dir):
- `constants.rs` → `program/programs/speed_chess/src/constants.rs` (NEW)
- `state/chess_match.rs` → `program/programs/speed_chess/src/state/chess_match.rs`
- `state/mod.rs` → `program/programs/speed_chess/src/state/mod.rs`
- `instructions/initialize_match.rs` → `program/programs/speed_chess/src/instructions/initialize_match.rs`
- `instructions/join_match.rs` → `program/programs/speed_chess/src/instructions/join_match.rs`
- `instructions/make_move.rs` → `program/programs/speed_chess/src/instructions/make_move.rs`
- `instructions/resign_game.rs` → `program/programs/speed_chess/src/instructions/resign_game.rs`
- `instructions/claim_timeout_win.rs` → `program/programs/speed_chess/src/instructions/claim_timeout_win.rs`
- `instructions/process_match_settlement.rs` → `program/programs/speed_chess/src/instructions/process_match_settlement.rs`
- `instructions/mod.rs` → `program/programs/speed_chess/src/instructions/mod.rs`
- `utils/payout_logic.rs` → `program/programs/speed_chess/src/utils/payout_logic.rs`
- `utils/mod.rs` → `program/programs/speed_chess/src/utils/mod.rs`
- `lib.rs` → `program/programs/speed_chess/src/lib.rs`

```bash
cp $SRC/constants.rs $DST/constants.rs
cp $SRC/state/chess_match.rs $DST/state/chess_match.rs
cp $SRC/state/mod.rs $DST/state/mod.rs
cp $SRC/instructions/*.rs $DST/instructions/
cp $SRC/utils/payout_logic.rs $DST/utils/payout_logic.rs
cp $SRC/utils/mod.rs $DST/utils/mod.rs
cp $SRC/lib.rs $DST/lib.rs

git add -A
git commit -m "feat: add instruction handlers with generic token support

- Remove all hardcoded token mints and bet amounts
- Add constants.rs for shared seeds/limits
- Add platform_fee_wallet and match_escrow_bump to ChessMatch
- Accept any SPL token for betting
- Remove dead code (transfer_tokens_with_signer)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### 1.3: Configure Cargo.toml and Anchor.toml
```bash
# Copy the fixed Cargo.toml (crate name = "speed_chess")
cp $SRC/../Cargo.toml $DST/../Cargo.toml

# Update Anchor.toml
# - Set correct program ID
# - Add anchor_version = "0.31.1"

git add -A
git commit -m "fix: correct crate name and Anchor configuration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### 1.4: Verify build
```bash
cd program && anchor build
# Should compile with 0 errors
```

---

### BLOCK 2: Tests (HIGH)

#### 2.1: Fix test file
- Copy `tests/speed_chess.test.ts` from old repo
- Replace absolute paths with relative ones
- Update to use new program API (platform_fee_wallet arg, no hardcoded mints)

#### 2.2: Add Rust unit tests
- Create `tests/chess_logic_tests.rs` — 54 plain `#[test]` for chess logic
- Create `tests/payout_tests.rs` — 7 payout tests
- Add `mollusk-svm` to dev-dependencies for CU profiling

#### 2.3: Run tests
```bash
anchor test
```

---

### BLOCK 3: Frontend (MEDIUM — parallel with Block 4)

#### 3.1: Init Next.js app
```bash
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir
```

#### 3.2: Install dependencies
```bash
cd frontend
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui
npm install react-chessboard
npm install jotai @tanstack/react-query
```

#### 3.3: Create chess UI
- Copy wallet provider from old repo (components/solana/)
- Create chess board page (`app/game/[matchId]/page.tsx`)
- Create lobby page (`app/games/page.tsx`)
- Create match creation form (`app/create/page.tsx`)
- Create chess components (board, timer, move history, controls)

---

### BLOCK 4: Backend (MEDIUM — parallel with Block 3)

#### 4.1: Init Fastify server
```bash
mkdir backend && cd backend
npm init -y
npm install fastify @fastify/websocket @fastify/cors
npm install pg drizzle-orm ioredis
npm install @coral-xyz/anchor @solana/web3.js
npm install typescript tsx @types/node
```

#### 4.2: Create database schema
- Run CREATE TABLE statements from BACKEND_DESIGN.md
- Set up Drizzle ORM

#### 4.3: Create API endpoints
- Webhook receiver (Helius)
- Match listing, detail, history
- Player stats, leaderboard
- WebSocket gateway for live updates

#### 4.4: Set up Helius webhook
- Create webhook on Helius dashboard
- Point to Railway-deployed backend URL

---

### BLOCK 5: MagicBlock Integration (HIGH — after core compiles)

#### 5.1: Add dependencies
```toml
# Cargo.toml
ephemeral-rollups-sdk = { version = "0.2.5", features = ["anchor"] }
```

#### 5.2: Add instruction stubs
- `delegate_match.rs`
- `commit_state.rs`
- `undelegate_match.rs`
- `schedule_timeout.rs`
- `cancel_timeout_task.rs`

#### 5.3: Add `#[ephemeral]` macro
- Annotate program entry point in lib.rs

#### 5.4: Session key client integration
```bash
npm install @magicblock-labs/ephemeral-rollups-kit
```

---

### BLOCK 6: Token + Fee Split (MEDIUM — after core stable)

#### 6.1: Manual SPL token creation
- Create $SPEED token
- Distribute 60% to dev wallet
- Create Raydium CPMM liquidity pool

#### 6.2: Add fee split logic
- Create PlatformConfig PDA
- Create TreasuryVault PDA
- Update payout_logic for 50/50 split

#### 6.3: Add claim_game_reward instruction
- Create RewardClaim PDA
- Implement progressive claim amounts
- Backend relay for gasless claims

---

### BLOCK 7: Deployment (FINAL)

#### 7.1: Devnet deploy
```bash
./scripts/deploy-devnet.sh
```

#### 7.2: Verify everything
- Run full test suite on devnet
- Run 75-item devnet checklist (DEPLOYMENT_PLAN.md)

#### 7.3: Mainnet deploy (when ready)
```bash
./scripts/deploy-mainnet.sh
```

---

## Files Changed Summary

### From old repo (fixed in current working dir):
| File | Changes |
|------|---------|
| `Cargo.toml` | `name = "counter"` → `"speed_chess"` |
| `lib.rs` | Added `constants` module, `platform_fee_wallet_arg` param |
| `constants.rs` | **NEW** — all shared seeds, limits, addresses |
| `state/chess_match.rs` | Removed `MAX_MATCH_ID_LEN` dup, added `platform_fee_wallet`, `match_escrow_bump` |
| `instructions/initialize_match.rs` | Generic tokens, no hardcoded mints |
| `instructions/join_match.rs` | Generic tokens, no hardcoded mints |
| `instructions/make_move.rs` | Use `CHESS_MATCH_SEED` constant |
| `instructions/resign_game.rs` | Use `CHESS_MATCH_SEED` constant |
| `instructions/claim_timeout_win.rs` | Use `CHESS_MATCH_SEED` constant |
| `instructions/process_match_settlement.rs` | Use constants, removed unused import |
| `utils/payout_logic.rs` | Removed dead code, use `MATCH_ESCROW_SEED` constant |

### NOT changed (logic unchanged):
| File | Status |
|------|--------|
| `utils/chess_logic.rs` | No changes (castling lines already correct) |
| `state/piece.rs` | No changes |
| `state/enums.rs` | No changes |
| `state/castling_rights.rs` | No changes |
| `state/en_passant_square.rs` | No changes |
| `errors/mod.rs` | No changes |
| `events/mod.rs` | No changes |

---

## Remaining Work (NOT yet done)

1. **abort_match instruction** — critical UX gap (funds locked if no P2)
2. **close_match instruction** — cleanup after settlement
3. **Platform fee ATA owner validation** — constraint in process_match_settlement
4. **Duplicate mutable account check** — in settlement
5. **MagicBlock session keys + crank** — 14-20 day integration
6. **Prediction market PDAs** — add `prediction_enabled: bool`
7. **Test file paths fixed** — remove absolute paths
8. **54 Rust unit tests** — chess logic pure `#[test]`
9. **Token launch + claim drip** — manual SPL creation
10. **Fee split treasury** — PlatformConfig + TreasuryVault PDAs
