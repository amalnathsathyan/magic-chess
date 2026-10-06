# Agent 12: Migration Plan to Fresh Repo

## Status: ✅ Complete — `MIGRATION_PLAN.md` written (1,214 lines)

### Latest Versions Researched
| Dependency | Current | Latest Stable |
|------------|---------|---------------|
| anchor-lang | 0.31.1 | **0.32.1** |
| @coral-xyz/anchor | 0.31.1 | **0.32.1** |
| @solana/web3.js | 1.98.1 | **1.98.4** (last v1) |
| ephemeral-rollups-sdk | not used | **0.2.5** (Rust) |
| @magicblock-labs/ephemeral-rollups-sdk | not used | **0.6.5** (npm) |
| Next.js | 15.3.1 | **16.0.3** |
| React | 19.1.0 | **19.2.3** |

### Migration Phases (8 phases)
1. **Scaffold**: `anchor init program` + `create-next-app frontend`
2. **Copy Pure Logic**: 5 files verbatim (piece, enums, castling, en_passant, chess_logic)
3. **Rewrite with Fixes**: 11 files with all bugs fixed
4. **New Instructions**: 6 stub specs (abort, delegate, commit, undelegate, schedule, cancel)
5. **Tests**: Fix paths + create chess_logic_tests, payout_tests, CU benchmarks
6. **Frontend**: Clean install + template deletion + new page architecture
7. **Git**: .gitignore, branch strategy
8. **Root**: package.json renamed with all scripts

### 13 Bugs Categorized by Severity
See `00-OVERVIEW.md` for complete list.

### Repository Structure (Clean)
```
new-speed-chess/
├── program/          # Anchor program
├── sdk/              # TypeScript SDK
├── frontend/         # Next.js app
├── backend/          # Fastify API
└── scripts/          # Deployment scripts
```

### Git Strategy
- Option A: `git subtree` to preserve chess logic history
- Option B: Cherry-pick specific commits
- Option C: Squashed import (cleanest for fresh repo)

### Verification Checklist
20 checkboxes covering build, test, deploy, all instructions.
