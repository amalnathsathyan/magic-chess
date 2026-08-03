# Magic Chess — Deployment Guide

> **Target**: macOS 12.6 (Darwin 21.6.0)
> **Solana CLI**: 4.1.1
> **Anchor CLI**: 1.1.2
> **Build SBF**: requires `--tools-version v1.52` (v1.54 crashes on macOS 12)
> **Surfpool**: `~/.cargo/bin/surfpool`
> **Program ID**: `5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6`
> **Program Keypair**: `target/deploy/magic_chess-keypair.json`
> **Program Binary**: `target/deploy/magic_chess.so`
> **Last updated**: 2026-08-03

---

## Prerequisites

### 1. Verify installed tools

```bash
solana --version        # Expected: solana-cli 4.1.1
anchor --version        # Expected: anchor-cli 1.1.2
cargo --version         # Expected: cargo 1.x.x
surfpool --version      # Expected: surfpool x.x.x
```

### 2. Verify wallet exists

```bash
ls -la ~/.config/solana/id.json
```

If this file does not exist, generate one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

### 3. Set environment variables (optional)

```bash
export ANCHOR_PROVIDER_URL="http://localhost:8899"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
```

### 4. Confirm program keypair is present

```bash
ls -la magic-chess-program/target/deploy/magic_chess-keypair.json
# Must show a 298-byte file containing the private key for 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
```

### 5. Confirm Anchor.toml program ID matches the keypair

```bash
solana-keygen pubkey magic-chess-program/target/deploy/magic_chess-keypair.json
# Must print: 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
```

---

## Quick Build (Shared Step)

Every deployment path starts with building the program.

```bash
cd magic-chess-program

# Clean previous build artifacts (optional but recommended)
cargo clean

# Build with the macOS-12-compatible tools version
cargo build-sbf --tools-version v1.52

# Verify build output
ls -la target/deploy/magic_chess.so
# Expected: ~696 KB .so file
```

**Troubleshooting**: If you see `error: toolchain is not installed`:

```bash
cargo build-sbf --tools-version v1.52 --install-only
cargo build-sbf --tools-version v1.52
```

---

## Path A: Surfpool (Local Testing)

Surfpool runs a local Solana validator with state forking from a remote RPC. Use for fast local iteration.

### A.1 Build the program

Run the Quick Build step above if not already done.

### A.2 Start Surfpool

```bash
cd magic-chess-program

surfpool start \
  --port 8899 \
  --ws-port 8900 \
  --slot-time 400 \
  --airdrop-keypair-path ~/.config/solana/id.json \
  --airdrop-amount 10000000000000 \
  --debug
```

If you want auto-redeploy on code changes:

```bash
surfpool start \
  --port 8899 \
  --airdrop-keypair-path ~/.config/solana/id.json \
  --airdrop-amount 10000000000000 \
  --debug \
  --watch
```

### A.3 Verify Surfpool is running

In a second terminal:

```bash
curl -s http://localhost:8899 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
# Expected: {"jsonrpc":"2.0","result":"ok","id":1}
```

### A.4 Deploy the program

```bash
solana config set --url http://localhost:8899
solana program deploy \
  target/deploy/magic_chess.so \
  --program-id target/deploy/magic_chess-keypair.json
```

### A.5 Verify deployment

```bash
solana program show 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
# Expected: Owner: BPFLoaderUpgradeab1e11111111111111111111111
```

### A.6 Airdrop SOL for testing

```bash
solana airdrop 100 --url localhost
solana balance --url localhost
# Expected: ~500 SOL
```

### A.7 Run the test suite

```bash
# Pure Rust unit tests
cargo test --lib

# Unit test harness (182 tests)
cargo test --test unit_tests

# LiteSVM integration tests
cargo test --test litesvm
```

### Quick Verify (Path A)

```bash
solana program show 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6 && \
solana balance && \
echo "Surfpool deploy OK"
```

---

## Path B: Solana Devnet

Deploy to the public Solana Devnet cluster.

### B.1 Set Solana config to devnet

```bash
solana config set --url https://api.devnet.solana.com
solana config get
# Expected: RPC URL: https://api.devnet.solana.com
```

### B.2 Check wallet balance / airdrop

```bash
solana balance
```

You need at least **6 SOL** on devnet for program deploy (~696 KB binary). If low:

```bash
solana airdrop 2
solana airdrop 2
solana airdrop 2
solana balance
# Wait 30 seconds between airdrops if rate-limited
```

### B.3 Build the program

```bash
cd magic-chess-program
cargo clean
cargo build-sbf --tools-version v1.52
```

### B.4 Deploy to devnet

```bash
# Option 1: Anchor
anchor deploy --provider.cluster devnet

# Option 2: Solana CLI directly
solana program deploy \
  --url devnet \
  --program-id target/deploy/magic_chess-keypair.json \
  target/deploy/magic_chess.so
```

Expected output:
```
Program Id: 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
```

### B.5 Verify deployment

```bash
solana program show 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6 --url devnet
```

Expected:
```
Program Id: 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
Owner: BPFLoaderUpgradeab1e11111111111111111111111
Executable: true
```

### B.6 Upload IDL

```bash
ANCHOR_PROVIDER_URL="https://api.devnet.solana.com" \
anchor idl init \
  --filepath target/idl/magic_chess.json \
  5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6
```

### Quick Verify (Path B)

```bash
solana program show 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6 --url devnet && \
solana balance --url devnet && \
echo "Devnet deploy OK"
```

---

## Path C: MagicBlock Devnet (Ephemeral Rollups)

Path B (Solana devnet) is a prerequisite — the base program must be live on devnet first.

### C.1 Prerequisites

- Path B completed: program live on Solana devnet at `5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6`
- Dependencies installed:

```bash
cd magic-chess-program
npm install
```

### C.2 Test MagicBlock endpoint

```bash
curl -s https://devnet.magicblock.app -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
# Expected: {"jsonrpc":"2.0","result":"ok","id":1}
```

### C.3 Deploy/Register on MagicBlock

MagicBlock uses **delegation** — the base program on Solana devnet is delegated to the MagicBlock validator. There is no separate `.so` upload. The delegation happens at runtime via CPI to `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`.

Your program already has the delegation instructions (`delegate_match`, `commit_state`, `undelegate_match`) built in. Confirm:

```bash
grep -r "delegate\|magicblock\|ephemeral" programs/magic_chess/src/ --include="*.rs"
```

### C.4 Run MagicBlock integration test

```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"

npx ts-mocha -p ./tsconfig.json -t 1000000 tests/magicblock_session_test.ts
```

This test: creates delegation account → initializes match on ER → plays moves gasless → commits state → undelegates.

### C.5 ER Validator Endpoints

| Region | Endpoint |
|---|---|
| US | `https://devnet-us.magicblock.app` |
| EU | `https://devnet-eu.magicblock.app` |
| Asia | `https://devnet-as.magicblock.app` |

### Quick Verify (Path C)

```bash
curl -s https://devnet.magicblock.app -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' && \
echo "MagicBlock endpoint OK" && \
echo "Run: npx ts-mocha -p ./tsconfig.json -t 1000000 tests/magicblock_session_test.ts"
```

---

## Troubleshooting

### Error: `cargo build-sbf: command not found`

```bash
agave-install init 2.1.0
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Error: `v1.54 crashes on macOS 12`

Known issue with macOS 12 (Monterey). Always use `--tools-version v1.52`:

```bash
cargo build-sbf --tools-version v1.52
```

### Error: `insufficient funds` on devnet deploy

Program is ~696 KB, costs ~6 SOL to deploy.

```bash
solana airdrop 2 --url devnet   # Repeat 3-4 times
solana balance --url devnet     # Should show 6+ SOL
```

### Error: `account already in use` / `Program already deployed`

**Option 1: Upgrade** (keeps program ID, adds to existing buffer):
```bash
solana program deploy \
  --url devnet \
  --program-id target/deploy/magic_chess-keypair.json \
  target/deploy/magic_chess.so
```

**Option 2: Close and redeploy** (fresh start, breaks all existing PDAs):
```bash
solana program close 5Ro6jsg6ov1VmEQ7Un5NAaydyfpUKDvABCK5CE5qN5E6 \
  --url devnet --bypass-warning
solana program deploy --url devnet \
  --program-id target/deploy/magic_chess-keypair.json \
  target/deploy/magic_chess.so
```

### Error: `Unable to connect to validator` (Surfpool)

```bash
# Kill existing process on port 8899
kill $(lsof -t -i:8899)
# Restart Surfpool
surfpool start --port 8899 ...
```

### Error: `anchor test` fails with "RPC URL not set"

```bash
solana config set --url http://localhost:8899
anchor test --skip-build
```

### Error: `ephemeral_rollups_sdk` version mismatch

```bash
# Check versions
npm ls @magicblock-labs/ephemeral-rollups-kit 2>/dev/null
cargo tree -p ephemeral-rollups-sdk 2>/dev/null | head -5
```

Current locked versions: `ephemeral-rollups-sdk` 0.16.2 (Rust), `@magicblock-labs/ephemeral-rollups-kit` ^0.6.0 (npm).

---

## Restoring Local Config After Devnet Work

```bash
solana config set --url http://localhost:8899
solana config get
# Confirm: RPC URL: http://localhost:8899
```

---

## Summary Table

| Path | Cluster | Deploy Cost | Speed | Use Case |
|---|---|---|---|---|
| **A: Surfpool** | Local fork | Free | Instant | Rapid iteration, unit/integration tests |
| **B: Devnet** | Solana Devnet | ~6 SOL (free faucet) | ~2-5 min | Integration testing, MagicBlock base |
| **C: MagicBlock** | MagicBlock Devnet | Requires Path B first | ~1 min (delegation) | Gasless moves, sessions, crank |
