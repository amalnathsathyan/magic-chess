# Agent 3: FEN Notation Research

## Status: ✅ Complete — No code changes

## Recommendation: NO on-chain FEN for MVP

FEN (Forsyth-Edwards Notation) is the standard chess position format. Our board state is already fully transparent on-chain as `[[Option<Piece>; 8]; 8]`. Any client can compute FEN off-chain for zero CU cost.

## Key Findings

### FEN Should Be Off-Chain
- `boardToFen()`: ~60-80 lines TypeScript, trivial to implement
- `fenToBoard()`: ~100-150 lines TypeScript, useful for test fixtures
- Both should live in the shared SDK `packages/chess-utils/`

### FEN Serialization (6 fields)
1. Piece placement: rows 7→0 (FEN rank 8→1), '/' separated
2. Active color: 'w' or 'b'
3. Castling: "KQkq" or "-"
4. En passant: "e3" or "-"
5. Halfmove clock
6. Fullmove number

### For Threefold Repetition: Zobrist Hashing, NOT FEN
- Zobrist: 8 bytes/position, ~10 CU/move, incremental XOR update
- FEN: 40-90 bytes, ~300 CU, full string comparison
- Zobrist is 5-11x cheaper in storage, 5-10x cheaper in compute

### Implementation Plan
- **Now**: TypeScript utils in SDK (`boardToFen`, `fenToBoard`)
- **Production**: Add `zobrist_key: u64` + `position_history: [u64; 100]` to ChessMatch
- **Never**: On-chain FEN computation (waste of CU)

### How Stockfish Handles It
FEN is an I/O format only — parsed once into bitboards, never used in engine loop. We should follow the same pattern: on-chain = runtime format (array), off-chain = display format (FEN).

## Implementation Status: Complete

- `sdk/src/utils/fen.ts`: `boardToFen()` and `fenToBoard()` implemented
- On-chain: `generate_fen()` in chess_logic.rs produces FEN for MoveMadeEvent
- Zobrist hashing: implemented in chess_logic.rs for threefold repetition
