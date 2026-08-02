# Mollusk CU Benchmarks

Compute Unit (CU) benchmarks for the Magic Chess on-chain chess engine, powered
by [Mollusk](https://github.com/anza-xyz/mollusk) -- a lightweight SVM test
harness from Anza.

## What is Mollusk?

Mollusk provides a minified Solana Virtual Machine (SVM) that loads and executes
compiled BPF `.so` programs natively -- without a full validator, AccountsDB, or
Bank. It is purpose-built for fast, deterministic CU profiling in Rust `#[test]`
functions.

All benchmarks in this directory run via `cargo test`, not `cargo test-sbf`.

## Prerequisites

1. Build the program first:

```bash
anchor build
```

2. This produces `target/deploy/magic_chess.so` at the workspace root.

## How to Run

```bash
# From the workspace root (magic-chess-program/):
cargo test --features integration-tests -p magic_chess --test cu_benchmarks -- --nocapture

# Or run a single benchmark:
cargo test --features integration-tests -p magic_chess --test cu_benchmarks bench_01_pawn_advance_baseline -- --nocapture
```

## CU Budget

The program's default compute budget is **200,000 CU**. Each benchmark validates
that the instruction stays well within this limit.

## Benchmarks

| # | Name | CU | Range | Description |
|---|------|-----|-------|-------------|
| 01 | pawn advance e2e4 | ~33,744 | 7k-50k | Simplest legal move: no capture, no path check, no promotion |
| 02 | knight Nb1c3 | ~32,811 | 7k-50k | Knight skips path-checking entirely; L-shaped delta only |
| 03 | bishop Bc1f4 | ~10,293 | 5k-25k | Diagonal path-clearing over 3 intermediate squares |
| 04 | queen Qd1h5 | ~27,270 | 10k-40k | Longest diagonal slider path (5 squares) |
| 05 | no-legal-moves midgame | ~31,846 | 15k-50k | Scotch Game; `are_no_legal_moves()` scans ~30 Black moves |
| 06 | initialize_match | ~7,781 | -- | Account init + CPI. Fails at SPL Token (not loaded) |
| 07 | initialize_match (token CPI) | ~7,781 | -- | Same as 06 but tries to load `spl_token.so` |
| 08 | complex midgame ~40 moves | ~36,380 | 25k-60k | Sicilian Defense; `are_no_legal_moves()` scans ~40 Black moves |

### Notes

- Benchmarks 06 and 07 fail at the SPL Token CPI because the token program `.so`
  is not loaded in Mollusk. The test handles this gracefully with a `SKIP`
  status. To enable full CPI measurement, build `spl_token.so` and place it at
  `target/deploy/spl_token.so` or `tests/fixtures/spl_token.so`.
- CU values are measured on macOS (aarch64). Values on Linux x86_64 may differ
  slightly.
- All benches are below budget with ample headroom. The heaviest operation is
  `are_no_legal_moves()` which peaks at ~36k CU in a complex midgame position.

## Crate Compatibility

mollusk-svm 0.14.0 uses the new-style Solana Agave crate ecosystem
(`solana-pubkey` v4, `solana-account` v4, `solana-instruction` v3) which is
incompatible with the `solana-sdk` v2.x re-exports used elsewhere in this
project. The benchmark file imports directly from these crates rather than from
`solana_sdk` to avoid type conflicts.

## Adding New Benchmarks

1. Add a `BoardDef` builder function for your position (or reuse an existing
   one)
2. Add a `#[test]` function that calls `run_make_move_bench()` or builds a
   custom instruction with `mollusk.process_instruction()`
3. Update the `run_all_benchmarks()` summary runner to include your new test
4. Update this README with the new CU numbers
