// LiteSVM-pattern integration test suite for Magic Chess Anchor program.
// Uses solana-program-test under the hood for built-in SPL Token support.
//
// Run with:
//   anchor build          # compile the program .so once
//   cargo test --features integration-tests
//
// Or equivalently enable the feature and run from workspace root.

#[path = "litesvm/mod.rs"]
mod litesvm;
