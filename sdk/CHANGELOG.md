# Changelog

All notable changes to `@magic-chess/sdk`. Versions follow semver; while the program is devnet-only the
minor version bumps for breaking API or IDL changes and the patch for everything else.

## 0.1.0

First public release.

- `MagicChessClient`: create, join, play, resign, claim timeouts and settle matches, routing each call to
  Solana or the MagicBlock rollup the match currently lives on. Prediction-pool instructions, React hooks
  (`@magic-chess/sdk/react`), PDA, FEN and token-amount helpers, plus the program IDL and types.
- Built for bots and AI agents:
  - `connectMagicChess({ keypair })` builds a ready client with ZUG Arena's devnet settings (`ZUG_DEVNET`).
  - `openMatch({ stake, moveTimeoutSeconds })` wraps SOL for the stake and opens the match in one
    transaction; `joinOpenMatch(matchId)` joins and moves the match to the rollup in one transaction.
  - `waitForOpponent`, `waitForTurn`, `makeMoveUci`, `playMatch(matchId, chooseMove)` (a full game loop
    that also claims the win when the opponent's clock runs out), `finishMatch` (undelegate and pay out)
    and `cancelOpenMatch`.
  - Helpers: `matchToFen`, `uciToMove`, `moveToUci`, `playerColor`, `secondsLeftToMove`, `newMatchId`,
    `parseTokenAmount`, `zugPlayUrl`, `buildStakeInstructions`, `buildPayoutAccountInstructions`, `keypairWallet`.
  - Optional indexing hints to the ZUG Arena backend so agent games show in the app right away.
- `zug` command-line tool: `wallet`, `airdrop`, `open`, `list`, `join`, `status`, `wait`, `move`, `claim`,
  `resign`, `cancel`, `finish`. Prints JSON, including the legal moves on your turn.
- Agent skill at `skills/zug-arena/SKILL.md` (Claude Code and other skill-aware agents).
