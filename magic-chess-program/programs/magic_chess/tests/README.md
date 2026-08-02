# Magic Chess Test Structure

```
tests/
├── unit_tests.rs          Unit test entry point. cargo test --test unit_tests
├── unit/                  (182 total)
│   ├── chess_logic.rs     All piece moves, castling, checkmate, endgame, integration (122)
│   ├── instructions.rs    Instruction handler logic, state transitions, error conditions (38)
│   └── magicblock.rs      Session keys, delegation, task IDs (22)
├── litesvm.rs             LiteSVM integration tests (pre-existing)
├── litesvm/
│   ├── mod.rs
│   └── helpers.rs
├── mollusk_tests.rs.disabled  Mollusk benchmarks (disabled — mollusk-svm compat)
├── mollusk/
│   └── cu_benchmarks.rs.disabled
├── integration/
│   └── payout.rs.disabled     Anchor/SPL payout tests (disabled — Solana 3.x compat)
└── README.md
```

## Running Tests

```bash
# All unit tests (pure Rust, no Solana VM)
cargo test --test unit_tests

# All tests including library unit tests
cargo test -p magic_chess --lib
```
