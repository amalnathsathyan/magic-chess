# Agent 7: Kani Proofs + Mollusk/LiteSVM Testing Strategy

## Status: ✅ Complete — No code changes

## Kani Formal Verification: NOT Recommended for Hackathon

- Chess state space too large for bounded model checking
- 3-5 day setup effort for 3-4 narrow proofs
- Better: `proptest` crate for property-based fuzz testing
- Only tractable proofs: board init = 32 pieces, 2 kings, no initial check

## Testing Strategy: Three-Tier Approach

### Tier 1: Plain `#[test]` (54 tests)
Chess logic functions are PURE RUST — no Solana VM needed.
- 12 pawn movement tests
- 3 knight tests
- 3 bishop tests
- 3 rook tests
- 2 queen tests
- 4 king tests
- 7 castling tests
- 4 check/checkmate/stalemate tests
- 2 endgame rule tests
- 14 validate_and_apply_move integration tests
- 2 board initialization tests

**Zero SVM overhead, runs in milliseconds.**

### Tier 2: Mollusk (Instruction-level + CU)
- Instruction integration tests for `make_move` with account setup
- CU profiling with `MolluskComputeUnitBencher` (critical!)
- More accurate CU reporting than LiteSVM

### Tier 3: LiteSVM (Payout/Token tests)
- Token transfers with PDA signers
- Multi-instruction flows (create → join → move → settle)
- 7 payout tests: winner, draw, fee calculation, duplicate rejection

## CU Benchmarks (6 to profile)
1. Simple pawn advance (baseline)
2. Knight move (no path check)
3. Bishop across board (path check)
4. Queen diagonal (longest path)
5. are_no_legal_moves midgame (~30 legal moves — expensive!)
6. Full initialize_match instruction

## Dev Dependencies
```toml
[dev-dependencies]
mollusk-svm = "0.0.15"
```

## Implementation Timeline
- Week 1: 54 plain `#[test]` (highest value)
- Week 2: CU benchmarks
- Week 3: Payout integration tests
- Stretch: Kani proofs for board initialization
