# Magic Speed Chess -- Deployment Plan & Mainnet Launch Checklist

> **Status**: Pre-devnet-deployment
> **Program ID (current)**: `9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9`
> **Last updated**: 2026-08-02

---

## Part 0: Current Project State Assessment

### Instructions Implemented (6 total)
| Instruction | File | Status |
|---|---|---|
| `initialize_match` | `instructions/initialize_match.rs` | Implemented |
| `join_match` | `instructions/join_match.rs` | Implemented |
| `make_move` | `instructions/make_move.rs` | Implemented |
| `resign_game` | `instructions/resign_game.rs` | Implemented |
| `claim_timeout_win` | `instructions/claim_timeout_win.rs` | Implemented |
| `process_match_settlement` | `instructions/process_match_settlement.rs` | Implemented |

### Known Bugs (Pre-Devnet)
1. **Cargo.toml lib name is "counter"**: The `[lib]` section in `anchor/programs/speed-chess/Cargo.toml` has `name = "counter"` instead of `name = "speed_chess"`. This causes the compiled `.so` file to be named `counter.so` instead of `speed_chess.so`. Fix before devnet deploy.
2. **Hardcoded token mint addresses diverge between files**: `initialize_match.rs` and `join_match.rs` have different hardcoded constants for `SEND_TOKEN_MINT_STR` and `WSOL_MINT_STR`. These must be unified into a single source of truth (e.g., a shared constants module).
3. **Hardcoded bet amounts**: Specific bet amounts are enforced (`10_000_000` for SEND 6-dec, `100_000_000` for wSOL 9-dec). These limits will need to be relaxed or made configurable before mainnet.

### Instructions NOT Yet Implemented
- `abort_match` (cancel match in WaitingForOpponent state, refund creator)
- `claim_game_reward` (separate claim flow)
- `initialize_platform_config` (global platform configuration PDA)

---

## Part A: Devnet Deployment Plan

### A.1 Prerequisites

```bash
# Verify Solana CLI
solana --version                          # Expect >= 1.18.x
solana config get                         # Check current RPC and wallet

# Verify Anchor CLI
anchor --version                          # Expect >= 0.31.x

# Verify wallet exists and has SOL
solana balance                            # You need at least 2 SOL for program deploy
# If not, airdrop:
solana airdrop 2 --url devnet
```

### A.2 Pre-Build Fixes

**Step 1: Fix Cargo.toml lib name**
Edit `/Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor/programs/speed-chess/Cargo.toml`:

Change line 9 from:
```toml
name = "counter"
```
To:
```toml
name = "speed_chess"
```

**Step 2: Unify hardcoded mint addresses (critical for mainnet readiness)**

The file `anchor/programs/speed-chess/src/instructions/join_match.rs` has different mint constants from `initialize_match.rs`. Both files should import from a shared module:

Create a new file `anchor/programs/speed-chess/src/constants.rs`:
```rust
use solana_program::pubkey::Pubkey;
use solana_program::pubkey;

// Test mints -- replace with real mainnet addresses before mainnet deploy
pub const SEND_TOKEN_MINT: Pubkey = pubkey!("SENDYLjLBaTgjyfXtPP2aHUt91WhNzX7iUfpThyApht");
pub const WSOL_MINT: Pubkey = pubkey!("WSiBAnrREwNLdGkDpXuqdKL4fJvAHeJhDfehmFdMdvw");

// Mainnet addresses (for reference -- do NOT use on devnet)
// pub const USDC_MAINNET_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// pub const USDT_MAINNET_MINT: Pubkey = pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
```

### A.3 Build Steps

```bash
# Navigate to anchor directory
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor

# Clean previous build artifacts
cargo clean

# Build the program
anchor build

# Verify the build output -- the .so file should now be named correctly
ls -la target/deploy/speed_chess.so
# Before the Cargo.toml fix this was named "counter.so"

# Verify the keypair exists
ls -la target/deploy/speed_chess-keypair.json

# If you need to regenerate the program keypair (only do this once):
# solana-keygen new -o target/deploy/speed_chess-keypair.json --force
# anchor keys sync
```

### A.4 Deploy Steps

```bash
# 1. Set cluster to devnet
solana config set --url https://api.devnet.solana.com

# 2. Check balance (you need ~2 SOL)
solana balance

# 3. Airdrop if needed
solana airdrop 2

# 4. Deploy the program
anchor deploy --provider.cluster devnet

# Expected output:
# Deploying workspace: https://api.devnet.solana.com
# Upgrade authority: ~/.config/solana/id.json
# Deploying program "speed_chess"...
# Program path: ./target/deploy/speed_chess.so...
# Program Id: 9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9
# Deploy success

# 5. Note the deployed program ID (should match lib.rs declare_id!)
```

### A.5 Post-Deploy Verification

```bash
# Replace with your actual Program ID
PROGRAM_ID="9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9"

# 1. Verify the program exists on-chain
solana program show $PROGRAM_ID

# 2. Dump the deployed binary and compare with local build
solana program dump $PROGRAM_ID /tmp/deployed_speed_chess.so
sha256sum target/deploy/speed_chess.so /tmp/deployed_speed_chess.so
# Hashes must match

# 3. Fetch the IDL from devnet
anchor idl fetch $PROGRAM_ID --provider.cluster devnet > /tmp/fetched_idl.json

# 4. Verify IDL is valid JSON
python3 -c "import json; json.load(open('/tmp/fetched_idl.json')); print('IDL valid')"

# 5. Build and run the TypeScript IDL type file
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess
npx tsc --noEmit anchor/target/types/speed_chess.ts 2>&1 | head -20
```

### A.6 Integration Scripts Execution

```bash
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess

# 1. Mock Token Setup (creates mock USDC mint and funds player ATAs)
npx ts-node --esm anchor/integration-scripts/MockTokenSetup.ts

# 2. Initialize a test match
npx ts-node --esm anchor/integration-scripts/InitializeMatch.ts

# 3. (After implementing) Join match
# npx ts-node --esm anchor/integration-scripts/JoinMatch.ts
```

### A.7 Run Full Test Suite Against Devnet

```bash
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor

# Run tests against devnet (skip deploy since already deployed)
anchor test --provider.cluster devnet --skip-deploy

# Or run specific test file
anchor test --provider.cluster devnet --skip-deploy tests/speed_chess.test.ts
```

### A.8 MagicBlock Devnet Configuration

If MagicBlock ephemeral rollups will be used:

```bash
# Environment variables for MagicBlock devnet integration
export EPHEMERAL_PROVIDER_ENDPOINT="https://devnet-us.magicblock.app"
export EPHEMERAL_WS_ENDPOINT="wss://devnet-us.magicblock.app"
export MAGIC_ROUTER_URL="https://devnet-router.magicblock.app"
```

These should be set in:
- `anchor/.env` (for build/deploy scripts)
- Railway backend environment variables
- Vercel/Next.js frontend environment variables

---

## Part B: Devnet Test Plan

### B.1 Program Deployment
- [ ] Program deploys without errors
- [ ] Program ID matches `declare_id!()` in `lib.rs`
- [ ] Keypair file matches deployed program
- [ ] IDL can be fetched from devnet
- [ ] IDL matches local build

### B.2 Token Setup
- [ ] Mock USDC (or test SEND/WSOL) mint created on devnet
- [ ] Player Associated Token Accounts created
- [ ] Players funded with sufficient test tokens
- [ ] Token transfers between accounts work
- [ ] Escrow token account PDA derived correctly

### B.3 Match Lifecycle
- [ ] `initialize_match` succeeds with valid params (SEND)
- [ ] `initialize_match` succeeds with valid params (wSOL)
- [ ] `initialize_match` rejected with unsupported mint
- [ ] `initialize_match` rejected with invalid bet amount
- [ ] `initialize_match` rejected with platform fee > 10000
- [ ] `initialize_match` rejected with empty match_id
- [ ] `initialize_match` rejected with match_id > 32 chars
- [ ] `initialize_match` rejected with wrong token account owner
- [ ] `initialize_match` rejected with mint mismatch
- [ ] `join_match` succeeds (black player joins as Player 2)
- [ ] `join_match` rejected if creator tries to join own match
- [ ] `join_match` rejected if bet amount mismatch
- [ ] `join_match` rejected if wrong token mint
- [ ] `join_match` rejected if match already full/active
- [ ] `join_match` rejected if wrong token account owner
- [ ] Match transitions to `Active` state after join
- [ ] `total_pot` correctly updated after join (2x bet)
- [ ] MatchCreatedEvent emitted on init
- [ ] PlayerJoinedEvent emitted on join

### B.4 Gameplay: Basic Moves
- [ ] `make_move`: White pawn e2-e4 succeeds
- [ ] `make_move`: Black pawn e7-e5 succeeds
- [ ] `make_move`: wrong turn rejected (`NotYourTurn`)
- [ ] `make_move`: moving opponent's piece rejected (`InvalidMoveNotYourPiece`)
- [ ] `make_move`: empty source square rejected (`InvalidMoveEmptySource`)
- [ ] `make_move`: sideways pawn move into own piece rejected
- [ ] `make_move`: pawn double-move from non-starting rank rejected
- [ ] `make_move`: forward pawn move into occupied square rejected
- [ ] `make_move`: path-blocked move rejected
- [ ] `make_move`: king moves into check rejected (`InvalidMoveLeavesKingInCheck`)
- [ ] `make_move`: non-player signer rejected (`NotAPlayer`)
- [ ] `make_move`: on concluded game rejected (`GameNotActive`)
- [ ] `MoveMadeEvent` emitted with correct fields
- [ ] `current_turn` flips correctly after each valid move
- [ ] `last_move_timestamp` updates after each move
- [ ] `halfmove_clock` and `fullmove_number` update correctly
- [ ] FEN board representation is consistent

### B.5 Gameplay: Special Moves
- [ ] Pawn capture diagonally works (e4xd5)
- [ ] En passant capture works
- [ ] Castling kingside works (both colors)
- [ ] Castling queenside works (both colors)
- [ ] Castling blocked when king has moved
- [ ] Castling blocked when rook has moved
- [ ] Castling blocked when path is attacked
- [ ] Pawn promotion to Queen works
- [ ] Pawn promotion to Rook works
- [ ] Pawn promotion to Bishop works
- [ ] Pawn promotion to Knight works
- [ ] Promotion without specifying piece rejected
- [ ] Promotion on non-last rank rejected

### B.6 Gameplay: End Conditions
- [ ] Checkmate detected and ends game (WhiteWins or BlackWins)
- [ ] Stalemate ends game (Draw)
- [ ] 50-move rule triggers draw
- [ ] GameEndedEvent emitted with correct status, winner, and reason

### B.7 Game End: Resignation & Timeout
- [ ] `resign_game`: White resigns, Black wins
- [ ] `resign_game`: Black resigns, White wins
- [ ] `resign_game`: non-player rejected (`NotAPlayer`)
- [ ] `resign_game`: non-active game rejected (`GameNotActive`)
- [ ] `resign_game`: opponent not joined yet rejected (`OpponentNotJoinedYet`)
- [ ] `claim_timeout_win`: succeeds when opponent has timed out
- [ ] `claim_timeout_win`: rejected if timeout not configured
- [ ] `claim_timeout_win`: rejected if opponent has not timed out yet
- [ ] `claim_timeout_win`: rejected if not opponent's turn
- [ ] `claim_timeout_win`: non-player rejected
- [ ] GameEndedEvent emitted for resign and timeout

### B.8 Settlement
- [ ] `process_match_settlement`: WhiteWins -- correct payout to Player 1
- [ ] `process_match_settlement`: BlackWins -- correct payout to Player 2
- [ ] `process_match_settlement`: Draw -- refund to both players (minus fee)
- [ ] Platform fee correctly calculated and split
- [ ] Winner receives `total_pot - fee`
- [ ] Double settlement rejected (`PayoutAlreadyProcessed`)
- [ ] Settlement on active game rejected (`GameNotConcluded`)
- [ ] Wrong player ATA rejected (`PlayerTokenAccountMismatch`)
- [ ] Wrong platform ATA rejected (`PlatformTokenAccountError`)
- [ ] `payout_processed` flag set to `true` after settlement
- [ ] Escrow account drained to 0 after successful settlement
- [ ] PayoutEvent / DrawPayoutEvent emitted

### B.9 MagicBlock Integration (if using ER)
- [ ] Session key delegation succeeds
- [ ] Moves signed by session key (no wallet popup per move)
- [ ] Crank timeout check executes correctly on ER
- [ ] Auto-settlement via crank works
- [ ] State committed to L1 on undelegation

---

## Part C: Mainnet Launch Checklist

### C.1 Security (BLOCKING -- must complete before mainnet)

- [ ] **External security audit** completed by a reputable firm (OtterSec, Sec3, Trail of Bits, or Neodyme)
- [ ] All CRITICAL findings from audit fixed and re-reviewed
- [ ] All HIGH findings from audit fixed and re-reviewed
- [ ] All MEDIUM findings documented with mitigation plan
- [ ] Internal security review completed (use the `solana-vulnerability-scanner` skill)
- [ ] Arbitrary CPI check: no `invoke_signed` calls with user-supplied program IDs
- [ ] PDA validation: all bumps stored and validated (`bump = chess_match.bump` pattern)
- [ ] Owner/signer checks: no `UncheckedAccount` anywhere in production instructions
- [ ] Sysvar validation: `Clock`, `Rent`, etc. properly validated
- [ ] Token program: always use anchor_spl official wrapper, never raw CPI
- [ ] Integer overflow: all `checked_add`, `checked_sub`, `checked_mul`, `checked_div` used
- [ ] Reentrancy assessment documented (Anchor programs are generally not reentrant, but CPIs to unknown programs could be)
- [ ] Platform fee ATA owner constraint properly set
- [ ] Token mint validation prevents fake-token attacks
- [ ] `match_id` validation prevents seed collision attacks
- [ ] All user-supplied amounts validated before transfer

### C.2 Admin Key Security (BLOCKING)

- [ ] Deployer wallet is a hardware wallet (Ledger/Trezor)
- [ ] Upgrade authority set to a multisig (Squads or a 2-of-3 multisig)
- [ ] Treasury/fee wallet is a separate hardware wallet
- [ ] Emergency pause capability designed (an admin instruction to freeze new matches)
- [ ] Admin keys never stored in plaintext in repo, `.env`, or CI

### C.3 Pre-Mainnet Configuration Changes

**Required code changes before mainnet build:**

1. **Replace hardcoded token mints** with actual mainnet addresses:
   ```rust
   // Real mainnet token mints
   pub const USDC_MAINNET_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
   pub const USDT_MAINNET_MINT: Pubkey = pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
   ```

2. **Remove or relax hardcoded bet amounts** -- do not hardcode specific bet amounts on mainnet. Allow any amount within configured min/max.

3. **Set platform fee parameters**:
   - Platform fee: 200 bps (2%) -- confirm this is the desired rate
   - Fee split: 50% treasury / 50% developer (or whatever split is decided)

4. **Finalize the treasury wallet address** (hardware wallet):
   - This is the wallet that receives 50% of platform fees
   - Do NOT use a software keypair

5. **Finalize the developer wallet address** (hardware wallet):
   - This is the wallet that receives 50% of platform fees

6. **Update Cargo.toml for release builds**:
   ```toml
   [profile.release]
   overflow-checks = true
   lto = "fat"
   codegen-units = 1
   opt-level = 3
   ```

### C.4 Testing (BLOCKING)

- [ ] 100% test coverage for all 6 instructions (happy + error paths)
- [ ] All test categories from Part B passing on devnet
- [ ] CU profiling complete -- all instructions under 200k CU budget
  ```bash
  anchor test --provider.cluster devnet --skip-deploy 2>&1 | grep "consumed"
  ```
- [ ] Fuzz testing: random legal moves on random boards, verify invariants
- [ ] Load testing: 100 concurrent matches, 1000 moves per match
- [ ] Mainnet fork testing: clone mainnet state, test against it with USDC
- [ ] Integration test: full match lifecycle (init -> join -> moves -> end -> settle)
- [ ] Race condition test: two settlements submitted simultaneously
- [ ] Edge case: match with 0 platform fee bps
- [ ] Edge case: match with 10000 platform fee bps (100%)
- [ ] Edge case: very short and very long match IDs

### C.5 Infrastructure

- [ ] **Mainnet RPC provider**: Helius, QuickNode, or Triton (with WebSocket support)
  - Helius: `https://mainnet.helius-rpc.com/?api-key=<KEY>`
  - QuickNode: `https://<NAME>.solana-mainnet.quiknode.pro/<KEY>/`
- [ ] **RPC fallback**: Second provider for redundancy
- [ ] Backend deployed and tested against mainnet RPC
- [ ] Helius webhooks pointing to mainnet program
- [ ] Redis + Postgres production-ready:
  - Automated backups enabled
  - Connection pooling configured
  - Monitoring alerts on disk usage, connection count
- [ ] API rate limiting configured
- [ ] DDoS protection (Cloudflare or similar)
- [ ] SSL/TLS configured for all endpoints
- [ ] CORS configured correctly

### C.6 Monitoring & Alerting

- [ ] Transaction error rate monitoring (PagerDuty alert if > 5%)
- [ ] Program error counters (alert on spike in any error variant)
- [ ] Settlement monitoring (every settlement logged)
- [ ] Escrow balance monitoring (unexpected large balance = stuck funds)
- [ ] Backend health endpoint with automated checks
- [ ] RPC provider health monitoring
- [ ] Cost monitoring (RPC usage fees)

### C.7 Legal & Compliance

- [ ] Terms of Service published on website
- [ ] Privacy Policy published on website
- [ ] Wagering/gambling legal review for target jurisdictions
- [ ] Token legal review (is any part a security?)
- [ ] KYC/AML assessment documented
- [ ] Geographic restrictions implemented if needed
- [ ] Age verification implemented if needed

### C.8 Community & Launch

- [ ] Twitter/Discord announcement posts drafted
- [ ] Documentation site live (program instructions, error codes, API)
- [ ] SDK/Client library published (npm for TypeScript)
- [ ] Onboarding guide for new users
- [ ] Bug bounty program set up (optional but recommended)
- [ ] Support channel staffed (Discord)

---

## Part D: Mainnet Launch Steps

### D.1 Final Build

```bash
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess/anchor

# Clean build with release optimizations
cargo clean
anchor build -- --profile release

# The output .so will be at:
# target/deploy/speed_chess.so

# Verify the program ID
solana-keygen pubkey target/deploy/speed_chess-keypair.json
# Must match declare_id!() in lib.rs
```

### D.2 Deploy to Mainnet

```bash
# 1. Switch to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# 2. Verify wallet (MUST BE HARDWARE WALLET)
solana balance
# Ensure you have enough SOL for deployment (~3-5 SOL)

# 3. Deploy
anchor deploy --provider.cluster mainnet

# WARNING: This costs real SOL. The cost depends on program size (~4-6 SOL for typical programs)

# 4. Save the transaction signature
# DEPLOY_TX_SIGNATURE=<copy from output>
```

### D.3 Verify Mainnet Deployment

```bash
PROGRAM_ID="<your_program_id>"

# 1. Show program info
solana program show $PROGRAM_ID

# 2. Dump deployed binary and verify hash
solana program dump $PROGRAM_ID /tmp/mainnet_speed_chess.so
sha256sum target/deploy/speed_chess.so /tmp/mainnet_speed_chess.so
# HASHES MUST MATCH

# 3. Check upgrade authority
solana program show $PROGRAM_ID | grep "Upgrade Authority"
# Should show your intended authority

# 4. Verify on Solana Explorer
open "https://explorer.solana.com/address/$PROGRAM_ID?cluster=mainnet"
```

### D.4 Initialize Platform Config

```bash
# Create the global platform configuration PDA
# (Requires implementing the initialize_platform_config instruction first)

# Example:
anchor run initialize-platform-config \
  --fee-bps 200 \
  --treasury-wallet <TREASURY_HARDWARE_WALLET> \
  --dev-wallet <DEVELOPER_HARDWARE_WALLET>
```

### D.5 Deploy Frontend

```bash
cd /Users/amalnathsathyan/Documents/trycatchblock/magic-speed-chess

# Set environment variables for production
cat > .env.production << 'EOF'
NEXT_PUBLIC_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=<YOUR_KEY>
NEXT_PUBLIC_PROGRAM_ID=<YOUR_PROGRAM_ID>
NEXT_PUBLIC_NETWORK=mainnet-beta
EOF

# Build
npm run build

# Deploy to Vercel/Cloudflare/Railway
# vercel --prod
```

### D.6 Deploy Backend

```bash
# Railway environment variables
RPC_URL=https://mainnet.helius-rpc.com/?api-key=<YOUR_KEY>
RPC_WS_URL=wss://mainnet.helius-rpc.com/?api-key=<YOUR_KEY>
PROGRAM_ID=<YOUR_PROGRAM_ID>
HELIUS_WEBHOOK_URL=https://api.helius.xyz/v0/webhooks/<WEBHOOK_ID>
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/speedchess
REDIS_URL=redis://<user>:<pass>@<host>:6379
NODE_ENV=production
```

---

## Part E: Post-Launch Monitoring

### E.1 First 24 Hours (War Room)

- [ ] Monitor ALL transactions to the program
- [ ] Watch for unusual patterns:
  - Extremely large bets
  - Rapid match creation / settlement
  - Transactions failing at unusual rates
  - Unexpected program errors
- [ ] Core team available for emergency response
- [ ] Discord/Telegram channel for real-time alerts
- [ ] Have emergency rollback/deployment plan ready

### E.2 First Week

- [ ] Daily review of:
  - Total matches created
  - Total matches completed
  - Total volume in escrow (USDC)
  - Platform fees collected
  - CU consumption and costs
  - RPC usage and costs
- [ ] Fix any UX issues reported by users
- [ ] Respond to all Discord questions within 4 hours
- [ ] Onboard initial users from chess communities
- [ ] Plan first feature update

### E.3 Ongoing Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Transaction success rate | > 99.5% | < 98% |
| Avg confirmation time | < 2s | > 5s |
| Program errors / 100 tx | < 1 | > 5 |
| Escrow TVL | Tracked | Abrupt drop |
| Settlements processed | All matched | Mismatch |
| RPC cost / day | < $50 | > $100 |

### E.4 Monitoring Dashboard (Minimal)

Key metrics to expose from the backend:
```typescript
// GET /api/admin/metrics
{
  "matches_created_24h": 150,
  "matches_completed_24h": 120,
  "active_matches": 45,
  "total_volume_usdc": 7500.00,
  "platform_fees_collected_usdc": 150.00,
  "settlements_processed_24h": 118,
  "avg_cu_per_move": 45000,
  "avg_cu_per_settlement": 32000,
  "rpc_calls_24h": 85000,
  "unique_players_24h": 95
}
```

---

## Part F: Devnet vs Mainnet Configuration

| Config Parameter | Devnet | Mainnet |
|---|---|---|
| Solana RPC URL | `https://api.devnet.solana.com` | `https://mainnet.helius-rpc.com/?api-key=<KEY>` |
| Solana WS URL | `wss://api.devnet.solana.com` | `wss://mainnet.helius-rpc.com/?api-key=<KEY>` |
| Program ID | `9z5kWJ5KSPfZXmCzv6cJyFXc6Y7tmsH5hj7SUy8aZji9` | **FINAL** -- never changes |
| MagicBlock ER | `https://devnet-us.magicblock.app` | TBD (confirm with MagicBlock) |
| MagicBlock Router | `https://devnet-router.magicblock.app` | TBD |
| Anchor.toml cluster | `devnet` | `mainnet` |
| Anchor.toml wallet | `~/.config/solana/id.json` (software) | Hardware wallet path |
| Platform fee (bps) | 200 (2%) | 200 (2%) |
| Fee split | 50/50 (treasury/dev) | 50/50 (treasury/dev) |
| Betting token | Mock SEND (`SENDYLjL...`) or Mock wSOL (`WSiBAnr...`) | Real USDC (`EPjFWdd5...`) |
| Treasury wallet | Test keypair | Hardware wallet multisig |
| Developer wallet | Test keypair | Hardware wallet multisig |
| Bet amounts | Hardcoded (10 SEND / 0.1 wSOL) | Configurable, min/max range |
| Deployer wallet | `~/.config/solana/id.json` | Hardware wallet |
| Upgrade authority | Deployer keypair | Squads multisig |
| Backend DB | Railway free tier | Railway Pro or dedicated |
| Monitoring | Minimal | Required (PagerDuty + Grafana) |
| Error alerts | Console only | PagerDuty/Discord/Telegram |

---

## Part G: Deployment Scripts

### G.1 `scripts/deploy-devnet.sh`

```bash
#!/bin/bash
# File: scripts/deploy-devnet.sh
# Deploys the Magic Speed Chess program to Solana devnet

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANCHOR_DIR="$SCRIPT_DIR/../anchor"

echo "========================================"
echo " Magic Speed Chess - Devnet Deployment"
echo "========================================"

# Check prerequisites
command -v solana >/dev/null 2>&1 || { echo "ERROR: solana CLI not found. Install: sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "ERROR: anchor CLI not found. Install: cargo install anchor-cli"; exit 1; }

# Check wallet
echo ""
echo "[1/5] Checking wallet..."
WALLET=$(solana config get keypair | grep "Keypair Path" | awk '{print $3}')
if [ ! -f "$WALLET" ]; then
    echo "ERROR: Wallet not found at $WALLET"
    exit 1
fi
WALLET_ADDR=$(solana-keygen pubkey "$WALLET")
echo "  Wallet: $WALLET_ADDR"

# Set devnet
echo ""
echo "[2/5] Setting cluster to devnet..."
solana config set --url https://api.devnet.solana.com

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "  Current balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
    echo "  Balance < 2 SOL. Requesting airdrop..."
    solana airdrop 2
    echo "  New balance: $(solana balance | awk '{print $1}') SOL"
fi

# Build
echo ""
echo "[3/5] Building program..."
cd "$ANCHOR_DIR"
anchor build

# Verify build
SO_FILE="$ANCHOR_DIR/target/deploy/speed_chess.so"
if [ ! -f "$SO_FILE" ]; then
    echo "ERROR: Build failed. $SO_FILE not found."
    echo "  Tip: Check Cargo.toml lib name -- should be 'speed_chess' not 'counter'"
    exit 1
fi
SO_SIZE=$(ls -lh "$SO_FILE" | awk '{print $5}')
echo "  Build complete. Program size: $SO_SIZE"

# Show program ID
PROGRAM_ID=$(solana-keygen pubkey "$ANCHOR_DIR/target/deploy/speed_chess-keypair.json")
echo "  Program ID: $PROGRAM_ID"

# Deploy
echo ""
echo "[4/5] Deploying to devnet..."
anchor deploy --provider.cluster devnet
echo "  Deploy transaction sent."

# Verify
echo ""
echo "[5/5] Verifying deployment..."
sleep 3
solana program show "$PROGRAM_ID" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  VERIFIED: Program deployed at $PROGRAM_ID"
else
    echo "  WARNING: Could not verify program. Check manually:"
    echo "    solana program show $PROGRAM_ID"
fi

echo ""
echo "========================================"
echo " Devnet deployment complete!"
echo " Program ID: $PROGRAM_ID"
echo " Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo "========================================"
```

### G.2 `scripts/deploy-mainnet.sh`

```bash
#!/bin/bash
# File: scripts/deploy-mainnet.sh
# Deploys the Magic Speed Chess program to Solana mainnet-beta
# WARNING: This costs real SOL. Review EVERYTHING before proceeding.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANCHOR_DIR="$SCRIPT_DIR/../anchor"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}"
echo "=============================================="
echo "  WARNING: MAINNET DEPLOYMENT"
echo "  This will deploy to Solana mainnet-beta"
echo "  This costs REAL SOL and is IRREVERSIBLE"
echo "=============================================="
echo -e "${NC}"

# Checklist check
echo "Pre-deployment checklist:"
echo ""
echo "  [ ] External security audit completed"
echo "  [ ] All critical/high bugs fixed"
echo "  [ ] Token mints updated for mainnet (USDC, not mock SEND)"
echo "  [ ] Hardcoded bet amounts removed"
echo "  [ ] Treasury wallet set (hardware wallet)"
echo "  [ ] All 8 test categories passed on devnet"
echo "  [ ] CU profiling complete"
echo "  [ ] Upgrade authority plan confirmed"
echo "  [ ] RPC provider ready for mainnet"
echo ""

read -p "Have you completed ALL items above? Type 'YES' to continue: " confirm
if [ "$confirm" != "YES" ]; then
    echo "Deployment cancelled."
    exit 1
fi

echo ""
read -p "What is the EXACT program ID you are deploying? " expected_id

# Check program ID
ACTUAL_ID=$(solana-keygen pubkey "$ANCHOR_DIR/target/deploy/speed_chess-keypair.json")
if [ "$expected_id" != "$ACTUAL_ID" ]; then
    echo -e "${RED}MISMATCH: Expected $expected_id but keypair gives $ACTUAL_ID${NC}"
    echo "Deployment cancelled."
    exit 1
fi

echo ""
echo -e "${YELLOW}Program ID verified: $ACTUAL_ID${NC}"

# Build
echo ""
echo "[1/3] Building with release optimizations..."
cd "$ANCHOR_DIR"
cargo clean
anchor build -- --profile release

SO_FILE="$ANCHOR_DIR/target/deploy/speed_chess.so"
if [ ! -f "$SO_FILE" ]; then
    echo -e "${RED}Build failed.${NC}"
    exit 1
fi

echo ""
echo "[2/3] Setting cluster to mainnet-beta..."
solana config set --url https://api.mainnet-beta.solana.com

echo ""
echo -e "${YELLOW}Current mainnet wallet balance: $(solana balance)${NC}"
echo -e "${YELLOW}Deploy cost estimate: 4-6 SOL${NC}"

read -p "Proceed with deployment? Type 'DEPLOY' to continue: " deploy_confirm
if [ "$deploy_confirm" != "DEPLOY" ]; then
    echo "Deployment cancelled."
    exit 1
fi

echo ""
echo "[3/3] Deploying to mainnet-beta..."
anchor deploy --provider.cluster mainnet

echo ""
echo -e "${GREEN}Deployment transaction sent!${NC}"
echo ""

# Verify
sleep 5
echo "Verifying deployment..."
solana program show "$ACTUAL_ID"

echo ""
echo -e "${GREEN}=============================================="
echo " DEPLOYMENT COMPLETE"
echo " Program ID: $ACTUAL_ID"
echo " Explorer: https://explorer.solana.com/address/$ACTUAL_ID"
echo "==============================================${NC}"
echo ""
echo "NEXT STEPS:"
echo "  1. Verify on-chain: solana program show $ACTUAL_ID"
echo "  2. Set upgrade authority to multisig"
echo "  3. Initialize platform config"
echo "  4. Deploy frontend with mainnet config"
echo "  5. Deploy backend with mainnet config"
echo "  6. Monitor transactions for 24 hours"
```

### G.3 `scripts/verify-deployment.sh`

```bash
#!/bin/bash
# File: scripts/verify-deployment.sh
# Usage: ./scripts/verify-deployment.sh <PROGRAM_ID> [cluster]

set -euo pipefail

PROGRAM_ID="${1:-}"
CLUSTER="${2:-devnet}"

if [ -z "$PROGRAM_ID" ]; then
    echo "Usage: $0 <PROGRAM_ID> [devnet|mainnet]"
    exit 1
fi

case "$CLUSTER" in
    devnet)   RPC_URL="https://api.devnet.solana.com" ;;
    mainnet)  RPC_URL="https://api.mainnet-beta.solana.com" ;;
    *)        echo "Invalid cluster: $CLUSTER"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANCHOR_DIR="$SCRIPT_DIR/../anchor"
SO_FILE="$ANCHOR_DIR/target/deploy/speed_chess.so"

echo "========================================"
echo " Verifying deployment of $PROGRAM_ID"
echo " Cluster: $CLUSTER"
echo "========================================"

# 1. Show program info
echo ""
echo "[1/4] Program info:"
solana program show "$PROGRAM_ID" --url "$RPC_URL" 2>/dev/null || {
    echo "ERROR: Program not found at $PROGRAM_ID on $CLUSTER"
    exit 1
}

# 2. Dump and compare binary
echo ""
echo "[2/4] Binary verification:"
if [ -f "$SO_FILE" ]; then
    solana program dump "$PROGRAM_ID" /tmp/verify_deployed.so --url "$RPC_URL"
    LOCAL_HASH=$(sha256sum "$SO_FILE" | awk '{print $1}')
    DEPLOYED_HASH=$(sha256sum /tmp/verify_deployed.so | awk '{print $1}')
    if [ "$LOCAL_HASH" = "$DEPLOYED_HASH" ]; then
        echo "  HASH MATCH: $LOCAL_HASH"
    else
        echo "  HASH MISMATCH!"
        echo "    Local:     $LOCAL_HASH"
        echo "    Deployed:  $DEPLOYED_HASH"
    fi
    rm /tmp/verify_deployed.so
else
    echo "  WARNING: Local .so not found at $SO_FILE. Skipping hash check."
fi

# 3. Fetch IDL
echo ""
echo "[3/4] IDL fetch:"
IDL_FILE="/tmp/verify_idl_${PROGRAM_ID}.json"
anchor idl fetch "$PROGRAM_ID" --provider.cluster "$CLUSTER" > "$IDL_FILE" 2>/dev/null || {
    echo "  WARNING: Could not fetch IDL. The program may not have been deployed with Anchor."
}
if [ -f "$IDL_FILE" ]; then
    IDL_SIZE=$(wc -c < "$IDL_FILE")
    echo "  IDL fetched: $IDL_SIZE bytes"
    python3 -c "import json; json.load(open('$IDL_FILE')); print('  IDL is valid JSON')" 2>/dev/null || echo "  WARNING: IDL is not valid JSON"
    rm "$IDL_FILE"
fi

# 4. Explorer link
echo ""
echo "[4/4] Explorer:"
case "$CLUSTER" in
    devnet)  echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet" ;;
    mainnet) echo "  https://explorer.solana.com/address/$PROGRAM_ID" ;;
esac

echo ""
echo "========================================"
echo " Verification complete!"
echo "========================================"
```

---

## Part H: Program Upgrade & State Migration Strategy

### H.1 Upgrade Authority Management

```bash
# View current upgrade authority
solana program show <PROGRAM_ID> | grep "Upgrade Authority"

# Transfer to Squads multisig (recommended for mainnet):
# 1. Create a Squads multisig at https://app.squads.so
# 2. Transfer upgrade authority:
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --new-upgrade-authority <SQUADS_MULTISIG_ADDRESS>

# Verify transfer:
solana program show <PROGRAM_ID> | grep "Upgrade Authority"

# To burn upgrade authority (make program immutable -- NOT recommended initially):
# solana program set-upgrade-authority <PROGRAM_ID> --final
```

### H.2 Upgrade Procedure

```bash
# 1. Make code changes on a feature branch
# 2. Test thoroughly on localnet + devnet
# 3. Build with release profile:
cd anchor && anchor build -- --profile release

# 4. Deploy the new buffer:
solana program write-buffer \
  target/deploy/speed_chess.so \
  --url mainnet-beta

# 5. Note the buffer address from output
BUFFER_ADDRESS="<buffer_address>"

# 6. Deploy upgrade (from Squads multisig):
solana program deploy \
  --buffer "$BUFFER_ADDRESS" \
  --program-id <PROGRAM_ID> \
  --url mainnet-beta

# 7. Close the old buffer to recover rent:
solana program close --buffers --url mainnet-beta
```

### H.3 State Migration Strategy

The `ChessMatch` account has `#[account]` with `#[derive(InitSpace)]`. If fields are added or changed:

**Option A: Backward-Compatible (preferred)**
- Only ADD fields at the end of the struct
- Use `Option<T>` for new fields to handle old accounts
- Existing accounts continue working without migration
- New matches use the new fields naturally

**Option B: Migration Instruction (if layout must change)**
- Add a `migrate_chess_match` instruction
- It takes an existing `ChessMatch` account and closes/creates new format
- Optionally uses `realloc` for simple additions within rent constraints
- Requires all active matches to be migrated before settlement

**Option C: Proxy Program Pattern (for major upgrades)**
- Deploy new program at a new address
- Original program forwards all instructions to new program
- Old program becomes a proxy that's never upgraded
- Users gradually migrate to interacting with new program directly

### H.4 Version Tracking

Add a `version: u8` field to `ChessMatch` for backward compatibility:
```rust
#[account]
pub struct ChessMatch {
    pub version: u8,   // Starts at 1, increment on migrations
    // ... existing fields ...
}
```

---

## Part I: Emergency Response Plan

### I.1 Emergency Scenarios & Responses

| Scenario | Severity | Response | Time to Fix |
|---|---|---|---|
| Program has critical bug (funds at risk) | CRITICAL | Halt all new match creation via frontend; disable `initialize_match` if possible; assess fund impact | < 1 hour |
| Settlement bug (wrong payouts) | CRITICAL | Stop processing settlements; manually reconcile affected matches; fix and redeploy | < 4 hours |
| RPC provider down | HIGH | Switch to backup RPC; update DNS to new endpoint | < 30 min |
| Frontend down | MEDIUM | Deploy hotfix or rollback; use status page to communicate | < 2 hours |
| Database issue | MEDIUM | Failover to replica; restore from backup if needed | < 1 hour |
| Spam / abuse attack | MEDIUM | Rate limit; filter suspicious wallets; temporarily increase fees | < 2 hours |
| Token price anomaly | LOW | Monitor; no immediate action unless attack | < 24 hours |

### I.2 Emergency Contacts

| Role | Name | Contact |
|---|---|---|
| Lead Developer | TBD | Discord: TBD, Signal: TBD |
| Security Lead | TBD | Discord: TBD, Signal: TBD |
| DevOps | TBD | Discord: TBD, Signal: TBD |
| Community Manager | TBD | Discord: TBD |

### I.3 Rollback Procedure

If the program must be rolled back to a previous version:

```bash
# 1. Identify the previous buffer (keep buffer addresses from all deploys)
PREVIOUS_BUFFER="<previous_buffer_address>"

# 2. Deploy the previous version
solana program deploy \
  --buffer "$PREVIOUS_BUFFER" \
  --program-id <PROGRAM_ID> \
  --url mainnet-beta

# 3. Verify the deployment
solana program show <PROGRAM_ID>
sha256sum previous_build.so  # Compare with dumped binary
```

### I.4 Incident Communication Template

```
Title: [INCIDENT] Magic Speed Chess - <Brief Description>
Severity: CRITICAL / HIGH / MEDIUM

Status: INVESTIGATING / MITIGATING / RESOLVED

Description: <What happened, what's affected>

User Impact: <Who is affected and how>

Timeline:
- HH:MM UTC - Incident detected
- HH:MM UTC - Investigation started
- HH:MM UTC - Mitigation deployed
- HH:MM UTC - Resolution confirmed

Root Cause: <Preliminary analysis>

Action Items:
- [ ] Fix deployed
- [ ] Post-mortem scheduled
- [ ] Tests added for this case
```

---

## Part J: Integration Scripts to Complete

### Scripts that exist but need work:

| Script | Status | What's Needed |
|---|---|---|
| `anchor/integration-scripts/MockTokenSetup.ts` | Working | Works for devnet with mock USDC |
| `anchor/integration-scripts/InitializeMatch.ts` | Working | Tested against devnet |
| `anchor/integration-scripts/JoinMatch.ts` | **Empty** | Implement join_match flow |
| `scripts/deploy-devnet.sh` | Not created | See G.1 above |
| `scripts/deploy-mainnet.sh` | Not created | See G.2 above |
| `scripts/verify-deployment.sh` | Not created | See G.3 above |

### Scripts still needed:
- `anchor/integration-scripts/FullMatchFlow.ts` -- init -> join -> moves -> end -> settle
- `anchor/integration-scripts/VerifyState.ts` -- fetches and displays full ChessMatch state
- `scripts/check-cu-usage.sh` -- profiles CU for each instruction
- `scripts/export-idl.sh` -- exports fresh IDL JSON from deployed program

---

## Part K: Action Item Summary

### Immediate (before devnet deploy)
1. [ ] Fix Cargo.toml lib name: `counter` -> `speed_chess`
2. [ ] Unify hardcoded mint addresses between `initialize_match.rs` and `join_match.rs`
3. [ ] Create `scripts/` directory and add deployment scripts
4. [ ] Implement `JoinMatch.ts` integration script
5. [ ] Run `anchor build` and verify it compiles cleanly
6. [ ] Deploy to devnet
7. [ ] Run full test suite on devnet

### Short-term (devnet stabilization)
1. [ ] Implement `abort_match` instruction (cancel match in WaitingForOpponent)
2. [ ] Implement `claim_game_reward` instruction (if needed)
3. [ ] Implement `initialize_platform_config` instruction
4. [ ] Complete all integration test scripts
5. [ ] CU profiling for all instructions
6. [ ] MagicBlock ER integration testing

### Pre-Mainnet (weeks before launch)
1. [ ] External security audit (schedule 4-6 weeks in advance)
2. [ ] Replace hardcoded mints with real mainnet addresses
3. [ ] Remove hardcoded bet amounts
4. [ ] Set up hardware wallets for treasury, developer, and upgrade authority
5. [ ] Set up Squads multisig for upgrade authority
6. [ ] Mainnet RPC provider contracts signed
7. [ ] Backend production infrastructure provisioned
8. [ ] Monitoring and alerting configured
9. [ ] Legal review completed
10. [ ] Terms of Service and Privacy Policy published

### Launch Day
1. [ ] Final build with release profile
2. [ ] Deploy to mainnet
3. [ ] Verify binary hash
4. [ ] Initialize platform config
5. [ ] Deploy frontend to production
6. [ ] Deploy backend to production
7. [ ] Enable monitoring
8. [ ] Announce on social channels

---

> **Footer**: This document should be updated as the project evolves. Check off items as they are completed. The mainnet launch checklist (Part C) is BLOCKING -- do not deploy to mainnet until all security items are checked.
