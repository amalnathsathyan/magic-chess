# Agent 4: TypeScript SDK Design

## Status: ✅ Complete — No code changes

## Recommendation: Anchor IDL Wrapper (Option B)

Thin facade over `anchor.Program<SpeedChess>` with typed helpers. 3-day build time.

### Why Not @solana/kit?
- Project already on web3.js v1 + Anchor v0.31 + wallet-adapter
- MagicBlock compatibility not confirmed for @solana/kit
- Hackathon timeline too tight for migration

### API Surface

```typescript
class SpeedChessClient {
  // Match lifecycle
  createMatch(params) → { match, signature }
  joinMatch(params) → { match, signature }
  abortMatch(matchId) → { signature }        // NEW — must add to program
  
  // Gameplay
  makeMove(matchId, move) → MoveResult
  resign(matchId) → { signature }
  claimTimeout(matchId) → { signature }
  
  // Settlement
  settleMatch(matchId) → { signature, payout }
  
  // Queries
  getMatch(matchId) → MatchState
  listJoinableMatches(filters?) → MatchInfo[]
  getPlayerMatches(player) → MatchInfo[]
  
  // Events
  onMatchCreated(callback) → unsubscribe()
  onMoveMade(matchId, callback) → unsubscribe()
  onGameEnded(matchId, callback) → unsubscribe()
}
```

### File Structure
```
sdk/src/
├── index.ts, client.ts, types.ts, idl.ts, pda.ts
├── instructions/ (one per instruction)
├── utils/ (chess.ts, token.ts, transaction.ts, errors.ts)
└── react/ (provider, useMatch, useMatches, useGame, useMatchEvents)
```

### Package: `@speed-chess/sdk`
- Core: no React dependency (Node.js compatible)
- `/react` subpath export for React hooks
- Peer dependencies: `@coral-xyz/anchor`, `@solana/web3.js`

### Blocking Gap
`abortMatch` instruction missing from program — without it, creators can't cancel unwanted matches. Must add before SDK release.

## Implementation Status: ✅ Complete

- `sdk/` directory created with full scaffold
- `MagicChessClient` class with all match lifecycle, gameplay, settlement methods
- React hooks: `useMatch`, `useMatches`, `usePlayerMatches`, `useMatchEvents`, `MagicChessProvider`
- PDA derivation helpers for all PDAs
- Blocking: `abortMatch` instruction still needs to be added to the program
