// Unit tests for Magic Chess — pure Rust, no Solana VM needed.
//
// Module declarations for tests organised under tests/unit/:
//   - chess_logic.rs   — All piece moves, castling, checkmate, endgame, integration (122 tests)
//   - instructions.rs  — Instruction handler logic, state transitions, error conditions (38 tests)
//   - magicblock.rs    — Session keys, delegation, task IDs (22 tests)

#[path = "unit/chess_logic.rs"]
mod chess_logic;

#[path = "unit/instructions.rs"]
mod instructions;

#[path = "unit/magicblock.rs"]
mod magicblock;
