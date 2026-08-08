# Deployment Guide

How to build and deploy the Magic Chess program to Solana devnet.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Solana CLI | 1.18+ | `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"` |
| Anchor | 1.1.2 | `cargo install --git https://github.com/coral-xyz/anchor --tag v1.1.2 anchor-cli --locked` |
| Node.js | 18+ | `https://nodejs.org/` or `nvm install 18` |
| SBF toolchain | (via Solana) | `solana-install` automatically includes it |

Verify installations:

```bash
rustc --version   # >= 1.75.0
solana --version  # >= 1.18.0
anchor --version  # >= 1.1.2
node --version    # >= 18.0.0
avm --version     # Anchor Version Manager (bundled with Anchor)
```

## Build

### 1. Set up Solana CLI

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json
```

Generate a new keypair if you don't have one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

### 2. Build the program

```bash
cd magic-chess-program
anchor build
```

This produces:
- `target/deploy/magic_chess.so` — the compiled BPF program binary
- `target/idl/magic_chess.json` — the IDL (interface definition)
- `target/types/magic_chess.ts` — TypeScript types (generated)

**Build flags:**

```bash
# Verbose build output
anchor build --verbose

# Skip IDL generation (fast builds during development)
anchor build --skip-idl
```

### 3. Sync program keys

After the first build, Anchor generates a new keypair at `target/deploy/magic_chess-keypair.json`. Sync it to the project:

```bash
anchor keys sync
```

This updates the `declare_id!()` in `programs/magic_chess/src/lib.rs` and the `[programs.devnet]` section in `Anchor.toml`.

## Deploy to Devnet

### 1. Fund your wallet

Request a devnet airdrop:

```bash
solana airdrop 2
```

Check balance:

```bash
solana balance
```

You need at least 2-4 SOL for the initial deployment (the program binary is large due to the chess engine).

### 2. Deploy

```bash
anchor deploy --provider.cluster devnet
```

You should see output like:

```
Deploying cluster: https://api.devnet.solana.com
Upgrade authority: /Users/.../.config/solana/id.json
Deploying program "magic_chess"...
Program path: ./target/deploy/magic_chess.so...
Program Id: FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h

Deploy success
```

### 3. Verify deployment

Check that the program is live on devnet:

```bash
solana program show FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h --url devnet
```

Or visit the Solana Explorer:

```
https://explorer.solana.com/address/FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h?cluster=devnet
```

The explorer should show the program account with the owner set to the BPF Loader and the executable flag set to `true`.

### 4. Upload the IDL

Anchor 1.x uses Program Metadata to store the IDL on-chain. Initialize it:

```bash
anchor idl init FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h \
  --filepath target/idl/magic_chess.json \
  --provider.cluster devnet
```

Verify the IDL upload:

```bash
anchor idl fetch FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h --provider.cluster devnet
```

### 5. Upgrade (re-deploy)

Deploy program upgrades **before** a frontend release that contains a new
generated IDL. Account layouts and instruction account ordering are part of the
runtime interface; publishing the frontend first can make valid transactions
fail or prevent match accounts from decoding.

To upgrade an existing program:

```bash
anchor build
anchor upgrade --provider.cluster devnet \
  --program-id FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h \
  ./target/deploy/magic_chess.so
```

Then update the IDL:

```bash
anchor idl upgrade FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h \
  --filepath target/idl/magic_chess.json \
  --provider.cluster devnet
```

Finally, sync the exact generated artifacts into the SDK and verify there is no
drift:

```bash
cd ../sdk
npm run sync-idl
cd ..
cmp magic-chess-program/target/idl/magic_chess.json sdk/src/idl/magic_chess.json
cmp magic-chess-program/target/types/magic_chess.ts sdk/src/idl/magic_chess.ts
```

## Configuration

### Anchor.toml

Key sections in `magic-chess-program/Anchor.toml`:

```toml
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.devnet]
magic_chess = "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h"

[programs.localnet]
magic_chess = "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANCHOR_PROVIDER_URL` | RPC endpoint override | `https://api.devnet.solana.com` |
| `ANCHOR_WALLET` | Path to keypair | `~/.config/solana/id.json` |
| `SOLANA_RPC_URL` | Alternative RPC (Helius, QuickNode) | (none) |

For production RPC providers, set in your shell profile:

```bash
export ANCHOR_PROVIDER_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
```

## Localnet (Local Validator)

For local development and testing:

```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Deploy to localnet
anchor deploy --provider.cluster localnet
```

Localnet provides:
- Instant confirmations
- No airdrop limits
- Fresh state on each restart
- No internet requirement

## Test Suite

```bash
# Run Anchor integration tests (requires local validator)
anchor test

# Run pure Rust unit tests (no validator needed)
cargo test --manifest-path programs/magic_chess/Cargo.toml

# Run with verbose logging
anchor test -- --nocapture
```

The test suite includes:
- 47+ pure unit tests for chess logic
- Mollusk CU benchmarks
- LiteSVM integration tests for payout and settlement flows

## Troubleshooting

### "blockstore error" or "AccountInUse" on deploy

The program binary already exists. Use `anchor upgrade` instead of `anchor deploy`.

### "insufficient funds"

```bash
solana airdrop 2 --url devnet
```

The initial deploy requires ~4 SOL. Subsequent upgrades require ~0.3 SOL.

### "ELF error: multiple regions with the same offset"

The BPF binary is too large. Enable LTO and reduce code size:

```toml
# Cargo.toml
[profile.release]
lto = "fat"
codegen-units = 1
```

This is already configured in the project's `Cargo.toml`.

### "Error: Your configured rpc port: 8899 is already in use"

A local validator is already running. Either:
```bash
# Kill the existing validator
pkill solana-test-validator

# Or deploy to devnet instead
anchor deploy --provider.cluster devnet
```

### "Error: RPC response error -32003: Transaction simulation failed: This account may not be used to pay transaction fees"

Your deployment wallet has no SOL. Run `solana airdrop 2`.

### Program ID mismatch

If you get errors about unexpected program IDs:

```bash
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

### "AnchorError: InstructionFallbackNotFound" on IDL fetch

The IDL hasn't been uploaded. Run:

```bash
anchor idl init FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h \
  --filepath target/idl/magic_chess.json \
  --provider.cluster devnet
```

### BPF SDK version mismatch

If you see `"solana-sdk version mismatch"`:

```bash
solana-install update
anchor build
```

### "Error processing Instruction 0: custom program error: 0x0"

This is often a null account or constraint violation. Check:
- All required accounts are passed (signers, token accounts, PDA seeds)
- Token mints match between init and join
- Match is in the correct state for the instruction (e.g., Active before make_move)

## Quick Reference

```bash
# Full deploy pipeline
cd magic-chess-program
solana config set --url devnet
solana airdrop 2
anchor build
anchor keys sync
anchor deploy --provider.cluster devnet
anchor idl init <PROGRAM_ID> --filepath target/idl/magic_chess.json --provider.cluster devnet
```

Program ID (devnet): `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
