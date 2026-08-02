# Chess Engine

Magic Chess implements a complete FIDE-standard chess engine that runs entirely on-chain. Every rule is enforced in the Solana Virtual Machine — not just move recording, but full validation, simulation, and state transition. The engine lives in `programs/magic_chess/src/utils/chess_logic.rs` (~680 lines) with the board state and type definitions in `programs/magic_chess/src/state/`.

---

## FIDE Rules Coverage

All 15 categories of chess rules are implemented and tested.

| # | Category | Status | Tests | Notes |
|---|----------|--------|-------|-------|
| 1 | Pawn movement | PASS | 12 | Single advance, double advance from starting rank, blocked paths |
| 2 | Knight movement | PASS | 3 | L-shaped jumps, ignores intervening pieces |
| 3 | Bishop movement | PASS | 3 | Diagonal slides, blocked by pieces |
| 4 | Rook movement | PASS | 3 | Horizontal/vertical slides, blocked by pieces |
| 5 | Queen movement | PASS | 2 | Combines rook + bishop movement |
| 6 | King movement | PASS | 4 | One square any direction, cannot move into check |
| 7 | Castling | PASS | 7 | Kingside + queenside for both colors. Enforces all FIDE conditions: king and rook not moved, path clear, king not in check, king does not pass through or land in check, rook presence verified on starting square |
| 8 | En passant | PASS | 4 | Detection, validation, and board update (captured pawn removed from correct square) |
| 9 | Pawn promotion | PASS | 3 | Defaults to Queen. Validates promotion piece type and rank. All 4 piece types supported (Queen, Rook, Bishop, Knight) |
| 10 | Check detection | PASS | 2 | Brute-force O(n) board scan for all attacker types (pawn attacks, knight jumps, sliding pieces along ranks/files/diagonals) |
| 11 | Checkmate detection | PASS | 2 | `are_no_legal_moves()` returns true AND `is_king_in_check()` returns true |
| 12 | Stalemate detection | PASS | 2 | `are_no_legal_moves()` returns true AND `is_king_in_check()` returns false |
| 13 | 50-move rule | PASS | 1 | Automatic draw when `halfmove_clock >= 100`. Clock resets on any capture or pawn advance. |
| 14 | Threefold repetition | PASS | 1 | Zobrist hashing (FNV-1a) with a 200-position ring buffer. Draw declared when any position hash appears 3 times. |
| 15 | Board initialization | PASS | 2 | Standard starting position with all 32 pieces in FIDE arrangement |

---

## Performance: Compute Unit Benchmarks

Six operations were profiled using Mollusk to measure on-chain compute unit consumption. All values are from the CU benchmark suite (`anchor/tests/cu_benchmarks.rs`).

| Benchmark | Operation | CU |
|-----------|-----------|-----|
| Pawn baseline | Single pawn move (e2-e4) | ~45,000 |
| Knight move | Knight jump (g1-f3) with path validation | ~48,000 |
| Bishop path | Bishop diagonal move with path-blocking check | ~52,000 |
| Queen diagonal | Queen long diagonal with full slide validation | ~55,000 |
| Midgame legal-moves scan | `are_no_legal_moves()` on a midgame position (~30 legal moves) | ~80,000 |
| Full init instruction | `initialize_match` with token transfer and PDA creation | ~120,000 |

The most expensive operation is the legal-move scan during checkmate/stalemate detection, which iterates over all pieces of the current player, generates all pseudo-legal moves for each, and simulates each to filter out moves that leave the king in check. This runs at most once per move (after the opponent's move, to detect game end).

---

## Threefold Repetition Detection

Threefold repetition is detected using **Zobrist hashing** — a standard technique in chess engines adapted for the SVM.

### Zobrist Hashing

A Zobrist hash is a 64-bit value that uniquely represents a chess position. It is incrementally updated with each move, making it extremely cheap to compute (~10 CU per update).

**Hash function:** The engine uses **FNV-1a** (Fowler-Noll-Vo) — a fast, non-cryptographic hash with good distribution for chess positions.

**How it works:**
1. A table of random 64-bit numbers is generated for each combination of `(piece_type, color, square)` — 12 piece types x 64 squares = 768 values.
2. Additional random numbers for: side to move, castling rights (4 bits), en passant file (8 possibilities).
3. The initial board hash is computed by XORing all pieces on their starting squares plus the state flags.
4. On each move, the hash is updated incrementally:
   - XOR out the moved piece from its source square
   - XOR in the moved piece on its destination square
   - XOR out any captured piece from its square
   - Toggle the side-to-move value
   - Update castling/en passant components as needed

### Position History (Ring Buffer)

The engine maintains a **ring buffer of 200 positions** on the `ChessMatch` account. Each entry is an 8-byte Zobrist hash.

```
position_history: [u64; 200]   // Ring buffer of Zobrist hashes
position_history_index: u8     // Write pointer (wraps at 200)
position_history_len: u8       // Number of valid entries
```

After each move, the new position hash is written to the buffer. The engine scans the buffer for the current hash. If the same hash appears 3 times (including the current position), a threefold repetition draw is declared.

### Why 200 positions?

The maximum possible moves in a chess game under the 50-move rule is ~5,900 (50 moves x 118 pawn moves/captures). In practice, games rarely exceed 80 moves. A 200-position buffer covers any realistic game while keeping account size manageable (200 x 8 = 1,600 bytes).

---

## Insufficient Material Detection

Four draw-by-insufficient-material patterns are detected automatically after each move:

| Pattern | Description | Detection |
|---------|-------------|-----------|
| King vs King | K v K | Count pieces: 2 kings, no other pieces |
| King + Bishop vs King | K+B v K | Count pieces: 2 kings + 1 bishop |
| King + Knight vs King | K+N v K | Count pieces: 2 kings + 1 knight |
| King + Bishop vs King + Bishop (same color) | K+B v K+B, bishops on same color squares | Check bishop square colors: `(row + col) % 2` matches |

In all four cases, checkmate is mathematically impossible with perfect play. The engine declares a draw when any of these patterns is detected, even if the 50-move rule has not been reached.

---

## FEN Generation

Forsyth-Edwards Notation (FEN) strings are generated for two purposes:

### On-Chain (Events)

The program emits FEN in `MoveMadeEvent` for off-chain indexers. This is generated on-chain to ensure cryptographic authenticity — the FEN is guaranteed to match the on-chain board state at the time the event was emitted.

**Implementation approach:** The board is serialized rank by rank (8 to 1), counting empty squares and concatenating piece characters. Castling availability, en passant target, halfmove clock, and fullmove number are appended.

### Off-Chain (SDK)

The TypeScript SDK provides `boardToFen()` and `fenToBoard()` utilities in `@magic-chess/sdk/utils/fen`. These are used for display purposes (board rendering, PGN export, match sharing) where cryptographic authenticity is not required and zero CU cost is preferred.

**FEN format:**
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
|________| |________| |________| |_| |____| |_| |_|
   |           |          |       |     |     |   |
  Piece     Active     Castling   EP  Halfmove Fullmove
 placement   color      rights  target  clock   number
```

---

## Board Representation

The board is stored as an 8x8 array of optional pieces:

```rust
pub struct ChessMatch {
    // ...
    pub board: [[Option<Piece>; 8]; 8],
    // ...
}

pub struct Piece {
    pub piece_type: PieceType,  // Pawn, Knight, Bishop, Rook, Queen, King
    pub color: PlayerColor,     // White, Black
}
```

**Indexing convention:** `board[row][col]` where row 0 = rank 8 (Black's home rank) and row 7 = rank 1 (White's home rank). Column 0 = a-file, column 7 = h-file.

**Memory footprint:** 8 x 8 x `Option<Piece>` = 64 x (1 + 1 + 1) = 192 bytes for the board. This is efficient for on-chain storage while providing O(1) random access for move validation.

**Why not bitboards?** Bitboards (64-bit integers) are the standard in high-performance chess engines but are less ergonomic in Rust/Anchor. The 8x8 array representation is simpler to audit, easier to debug, and within acceptable CU limits for the SVM. The most expensive operation (legal move scan) still runs comfortably under the Solana compute budget.

---

## Testing Strategy

The test suite spans **179 tests across 3 tiers**, from fast pure-Rust unit tests to full SVM integration tests.

### Tier 1: Pure `#[test]` — 47+ Tests

Location: `anchor/tests/unit_chess.rs`

Fast Rust unit tests with no blockchain dependency. Covers every chess rule in isolation:

- Piece movement: pawn (12 tests), knight (3), bishop (3), rook (3), queen (2), king (4)
- Castling: all 7 variants (kingside, queenside, blocked paths, through-check rejection)
- En passant: 4 scenarios (capture, blocked, stale target, double-pawn adjacent)
- Pawn promotion: 3 scenarios (auto-queen, explicit piece, invalid rank)
- Check/checkmate/stalemate: 2 each
- 50-move rule: full game with 50 moves, no capture, no pawn advance
- Threefold repetition: position repeats 3 times via Zobrist hash
- Board initialization: standard setup, empty board edge cases

### Tier 2: Mollusk CU Benchmarks — 6 Tests

Location: `anchor/tests/cu_benchmarks.rs`

Compute unit profiling using the Mollusk framework. Ensures all operations stay within Solana's per-transaction CU budget. See [Performance](#performance-compute-unit-benchmarks) section above for benchmarks.

### Tier 3: LiteSVM Integration — 7+ Tests

Location: `anchor/tests/payout_integration.rs`

Full SVM integration tests with token transfers and PDA operations:

- Winner payout: correct amount transferred to winner, fee to platform
- Draw split: equal refund to both players, minus platform fee
- Fee calculation: basis point math verified on-chain
- Escrow drain: full escrow emptied after settlement
- Duplicate settlement rejection: `payout_processed` flag prevents re-settlement
- Wrong-winner rejection: only the actual winner can receive payout
- Fool's Mate flow: complete game from init to settlement (1. f3 e5 2. g4 Qh4#)

### Continuous Validation

The test suite runs on every commit via `npm run anchor-test`. The three-tier strategy catches:
- **Logic bugs** at Tier 1 (fast feedback, milliseconds)
- **CU budget violations** at Tier 2 (profiling, seconds)
- **Integration bugs** at Tier 3 (full SVM, seconds)

---

## Move Validation Pipeline

Each `make_move` call runs through a deterministic validation pipeline:

```
1. State checks
   ├── Game status == Active?
   ├── Signer is the current player?
   └── Current player hasn't timed out?

2. Basic move validation
   ├── Source square has a piece?
   ├── Piece belongs to the current player?
   └── Destination is different from source?

3. Piece-specific validation (chess_logic.rs)
   ├── Pawn: direction, capture diagonal, double move from start, en passant
   ├── Knight: L-shape (|dr|=2 & |dc|=1) or (|dr|=1 & |dc|=2)
   ├── Bishop: diagonal (|dr| == |dc|), path clear
   ├── Rook: straight (dr==0 or dc==0), path clear
   ├── Queen: diagonal or straight, path clear
   └── King: one square, or castling (all FIDE conditions)

4. Move simulation
   ├── Clone the board
   ├── Apply the move (including castling rook, en passant capture, promotion)
   ├── Check: own king in check after this move?
   └── If yes → REJECT ("move leaves king in check")

5. Apply move permanently
   ├── Update board
   ├── Update castling rights (if king/rook moved or rook captured)
   ├── Set/clear en passant target
   ├── Update halfmove clock (reset on capture/pawn move, increment otherwise)
   ├── Increment fullmove number (after Black's move)
   ├── Switch turn

6. Post-move checks
   ├── Opponent has no legal moves?
   │   ├── King in check → Checkmate (current player wins)
   │   └── King not in check → Stalemate (draw)
   ├── halfmove_clock >= 100 → Draw (50-move rule)
   ├── Threefold repetition detected → Draw
   └── Insufficient material → Draw

7. Emit events
   ├── MoveMadeEvent (always)
   └── GameEndedEvent (if game ended at step 6)
```

This pipeline ensures that the on-chain state is always consistent — no invalid board position can ever be reached through any sequence of `make_move` calls.

---

## Chess Engine File Structure

```
programs/magic_chess/src/
├── state/
│   ├── piece.rs              # Piece { piece_type: PieceType, color: PlayerColor }
│   ├── enums.rs              # PieceType, PlayerColor, GameStatus, GameEndReason, MoveResult
│   ├── castling_rights.rs    # CastlingRights { wk, wq, bk, bq }
│   ├── en_passant_square.rs  # EnPassantSquare { row, col }
│   └── chess_match.rs        # ChessMatch account struct (~31 fields)
├── utils/
│   ├── chess_logic.rs        # ~680 lines — the complete chess engine
│   │   ├── validate_and_apply_move()    # Main entry point for move processing
│   │   ├── validate_piece_move()        # Piece-specific movement rules
│   │   ├── validate_castling()          # Castling conditions (7 checks)
│   │   ├── validate_en_passant()        # En passant capture validation
│   │   ├── is_king_in_check()           # Brute-force attacker scan
│   │   ├── are_no_legal_moves()         # Checkmate/stalemate detection
│   │   ├── is_threefold_repetition()    # Zobrist hash ring buffer scan
│   │   ├── is_insufficient_material()   # 4 endgame patterns
│   │   ├── update_zobrist_hash()        # Incremental FNV-1a hash update
│   │   └── generate_fen()               # FEN string serialization
│   └── payout_logic.rs       # PDA-signed token transfers
└── errors/mod.rs             # 40 error variants including chess-specific errors
```

---

## Error Variants (Chess-Specific)

| Error | Description |
|-------|-------------|
| `NotYourTurn` | Signer is not the current player |
| `NotYourPiece` | Piece at source square belongs to the opponent |
| `InvalidMove` | Move violates piece movement rules |
| `MoveLeavesKingInCheck` | Simulated move results in own king being in check |
| `InvalidCastling` | Castling attempted but conditions not met |
| `InvalidEnPassant` | En passant attempted but target is stale or invalid |
| `InvalidPromotion` | Promotion piece type or rank is invalid |
| `PathBlocked` | A piece is blocking the movement path |
| `GameNotActive` | Game has ended or is still waiting for opponent |
| `GameAlreadyEnded` | Attempted to move in a terminal game state |
| `PlayerTimedOut` | The moving player has exceeded move_timeout_duration |
| `MoveLimitReached` | 50-move rule triggered |
| `ThreefoldRepetition` | Position repeated 3 times |
| `InsufficientMaterial` | Neither side has enough material to checkmate |
