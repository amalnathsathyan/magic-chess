# Codama vs Manual SDK -- Analysis for Magic Chess

**Date:** 2026-08-03

## Executive Summary

**Recommendation: Stick with the manual SDK.** Adopting Codama would replace at most 30-35% of the current SDK code (the Anchor IDL type stubs, instruction builders, and PDA helpers) but would add a new build step, a new dependency chain, and the risk of Codama APIs changing (it is flagged as "active development, subject to change"). The high-value code -- React hooks, MagicBlock integration, FEN utilities, convenience query methods, and business-logic helpers -- all remain hand-written regardless. The current manual SDK is well-structured, well-documented, and already working. Codama is not a bad tool, but the lift to adopt it does not justify the marginal gain at this stage.

---

## 1. What is Codama?

Codama is an IDL-driven client generator for Solana programs, originally spun off from the Metaplex Foundation's Kinobi project. It converts a program's IDL (Anchor JSON or Shank) into a language-agnostic node tree, then renders that tree into target-language clients via visitors (renderers).

**Pipeline:**

```
Anchor IDL JSON  -->  @codama/nodes-from-anchor  -->  codama node tree  -->  @codama/renderers-js  -->  TypeScript client
                                                                            -->  @codama/renderers-rust  -->  Rust client
```

**Key packages (2025):**

| Package | Purpose |
|---|---|
| `@codama/nodes-from-anchor` | Converts Anchor IDL to Codama internal node tree |
| `@codama/renderers-js` | Generates `@solana/kit`-compatible TypeScript clients |
| `@codama/renderers-rust` | Generates Rust clients |
| `codama` | Core library for node tree manipulation |
| `@codama/visitors-core` | Visitor pattern primitives |

**Two usage modes:**
1. **CLI** -- `npx codama init` then `npx codama run --all` (config-driven)
2. **Programmatic script** -- import `rootNodeFromAnchor()`, run visitors in a `.ts` script

**Language support:** TypeScript/JS (stable), Rust (stable), Python (beta), Go (community).

---

## 2. What Codama Generates

From the Anchor IDL, Codama produces:

- **Instruction builders** -- functions like `getCreateInstruction()`, `getIncrementInstruction()` that produce Solana `TransactionInstruction` objects with typed args and auto-derived account metas
- **Account decoders/fetchers** -- functions like `fetchCounter()` that deserialize on-chain account data into typed TS objects
- **Account types** -- TypeScript interfaces for every `#[account]` struct
- **Instruction argument types** -- input types for each instruction
- **Error types** -- typed error codes matching the program's errors
- **PDA helpers** -- seed-based PDA derivation functions
- **Barrel exports** -- `index.ts` re-exporting `accounts`, `errors`, `instructions`, `programs`

**Generated output structure (JS renderer):**

```
clients/js/src/generated/
  index.ts
  accounts/
    chessMatch.ts
    ...
  instructions/
    initializeMatch.ts
    joinMatch.ts
    makeMove.ts
    ...
  errors/
    magicChess.ts
  programs/
    magicChess.ts
  shared/
    ...
```

**Generated code is framework-agnostic** -- it targets `@solana/kit` (not Anchor or Umi). No `@coral-xyz/anchor` dependency. ESM-compatible with `.js` extensions.

**What Codama does NOT generate:**
- No `package.json`, `tsconfig.json`, or any project boilerplate
- No React hooks
- No convenience client class wrapping multiple instructions
- No business-logic helpers (e.g., `determineMoveResult`, `listJoinableMatches`)
- No third-party integration code (MagicBlock, Helius, etc.)
- No FEN/chess-specific utilities
- No custom query methods beyond basic `fetch`

---

## 3. Current Manual SDK -- What We Have

Files in `sdk/src/`:

| File | Lines | Purpose | Replaced by Codama? |
|---|---|---|---|
| `idl/magic_chess.ts` | 100 | Anchor IDL type definition (manually written stub) | **Yes** -- Codama generates this from on-chain IDL |
| `types.ts` | 203 | TS enums (PieceType, GameStatus, etc.), interfaces (ChessMatch, Move, event types), param types | **Partially** -- account struct types are generated, but enums, event types, and convenience param interfaces (CreateMatchParams) are not |
| `pda.ts` | 53 | `findChessMatchPda`, `findMatchEscrowPda`, `findPredictionPoolPda` | **Yes** -- Codama generates PDA helpers from IDL seeds |
| `client.ts` | 434 | `MagicChessClient` class with typed methods wrapping Anchor `Program<MagicChess>` | **Partially** -- instruction building is replaced, but the class wrapper, convenience queries (listJoinableMatches, getPlayerMatches), business logic (determineMoveResult), and ER-specific tx building (commitState, undelegateMatch) are all custom |
| `magicblock.ts` | 74 | MagicBlock RPC endpoints, delegation constants, `getDelegationStatus()`, `getERConnection()` | **No** -- entirely application-specific |
| `react/index.ts` | 259 | React context, provider, hooks (useMatch, useMatches, usePlayerMatches, useMatchEvents, useMagicChessClient) | **No** -- Codama does not generate React code |
| `utils/fen.ts` | 216 | `boardToFen()`, `fenToBoard()` -- mirrors on-chain chess logic | **No** -- chess-specific application logic |
| `index.ts` | 51 | Barrel exports | **Trivial** -- would need to be adjusted regardless |
| **Total** | **~1,390** | | |

---

## 4. Comparison: Codama-Generated vs Hand-Written

### 4.1 What Codama would replace (estimated ~30-35% of SDK code)

| Component | Codama generates | Current manual approach |
|---|---|---|
| IDL types (`magic_chess.ts`) | Auto-generated from `anchor build` output | 100-line manually written type stub |
| Instruction builders (in `client.ts`) | `getInitializeMatchInstruction(...)` with auto-derived accounts | Hand-written `this.program.methods.initializeMatch(...).accounts({...}).rpc()` |
| Account deserialization | `fetchChessMatch()` auto-decoded | `this.program.account.chessMatch.fetch(pda)` with `as unknown as ChessMatch` cast |
| PDA derivation (`pda.ts`) | `findChessMatchPda()` from IDL seed definitions | Hand-written `PublicKey.findProgramAddressSync([seed, ...], programId)` |
| Error types | `MAGIC_CHESS_ERROR__INVALID_MOVE` etc. | Not currently typed (errors are caught generically) |

### 4.2 What would remain hand-written (~65-70% of SDK code)

| Component | Why Codama cannot replace it |
|---|---|
| `MagicChessClient` class | Convenience wrapper around instructions; combines `.rpc()` with post-tx queries (e.g., `makeMove` fetches match state after the tx to compute `MoveResult`) |
| `listJoinableMatches()` | Business logic -- filters all accounts, checks `gameStatus`, applies mint filters |
| `getPlayerMatches()` | Business logic -- iterates accounts, checks player list membership |
| `determineMoveResult()` | Application logic -- maps on-chain game status + end reason to user-facing `MoveResult` |
| `commitState()` / `undelegateMatch()` | MagicBlock-specific -- builds unsigned instructions, creates `Transaction` manually, sends to ER connection instead of base layer |
| React hooks | Codama has no React renderer; these are entirely custom |
| `useMatchEvents()` | Anchor event listener integration, not a codegen concern |
| MagicBlock constants/helpers | `DELEGATION_PROGRAM_ID`, `MAGIC_PROGRAM_ID`, `getDelegationStatus()`, `getERConnection()` -- all application-specific |
| FEN utilities | `boardToFen()`, `fenToBoard()` -- chess-specific logic that mirrors on-chain Rust code |
| Event types (`MatchCreatedEvent`, `MoveMadeEvent`, etc.) | Codama generates account types, not Anchor event struct types |
| Convenience param types (`CreateMatchParams`, `JoinMatchParams`) | Higher-level groupings that bundle instruction args with derived values |

### 4.3 Framework dependency shift

| Concern | Anchor SDK (current) | Codama + `@solana/kit` |
|---|---|---|
| Core dependency | `@anchor-lang/core` v1.x | `@solana/kit` (no Anchor) |
| Wallet compatibility | `AnchorWallet` interface | Wallet-standard / `@solana/kit` signing |
| Transaction flow | `program.methods.X().accounts({...}).rpc()` | `getInstruction()` + manual tx build + send |
| Account fetching | `program.account.X.fetch(pda)` | `fetchX(connection, pda)` or similar |
| Provider/Connection | Through Anchor `Provider` | Direct `Connection` / `RpcTransport` |

Adopting Codama means replacing the Anchor dependency with `@solana/kit`. This is a significant refactor for a codebase that currently uses Anchor for test infrastructure (LiteSVM with Anchor) and program interactions.

### 4.4 Maintenance burden

| Dimension | Manual SDK | Codama-generated |
|---|---|---|
| **IDL sync** | Must manually update `idl/magic_chess.ts` when instructions change (type errors catch drift) | Re-run codegen after `anchor build` -- no manual sync |
| **Adding an instruction** | Add method to `client.ts`, update IDL type if needed | Add method to `client.ts`, codegen handles the rest; regenerate |
| **API stability** | You control the API surface; can be as ergonomic as you want | Codama APIs may change ("active development, subject to change"); generated code is marked auto-generated, not meant to be edited |
| **Custom behavior** | Easy -- just write whatever logic you need | Awkward -- you must wrap generated code in your own layer; the generated output is intentionally opaque |
| **Dependency risk** | Anchor v1.x only (stable) | Codama stack (`@codama/nodes-from-anchor`, `@codama/renderers-js`) + `@solana/kit` (newer, evolving ecosystem) |
| **Test ergonomics** | Anchor Program methods integrate naturally with LiteSVM | Would need to use raw instructions or a separate test adapter |

---

## 5. MagicBlock / ER Specific Code

This is a critical point. Magic Chess uses MagicBlock Ephemeral Rollups for low-latency gameplay. The SDK has dedicated methods for this:

- `delegateMatch()` -- delegates the match account to ER
- `commitState()` -- commits state back to base layer (requires an ER-specific `Connection`)
- `undelegateMatch()` -- commits + undelegates (also ER-specific)

These methods use `@solana/web3.js` v2 `Transaction` objects directly (not Anchor `.rpc()`) because they must send to the ER validator's connection, not the base-layer connection. The Codama-generated instruction builders would produce `TransactionInstruction` objects that could be used in these flows, but:

1. You would still need the ER-specific transaction assembly and connection management
2. Codama has no concept of ER-specific endpoints or dual-layer connections
3. The `MAGIC_PROGRAM_ID`, `MAGIC_CONTEXT_ID`, `DELEGATION_PROGRAM_ID` constants remain application-specific

**Bottom line:** Codama provides zero help with MagicBlock integration. The SDK's MagicBlock code is 100% hand-written and would remain so.

---

## 6. Can Codama Generate React Hooks?

**No.** Codama has no React renderer. The renderers-js package generates plain TypeScript instruction builders and account fetchers. React hooks like `useMatch`, `useMatches`, `usePlayerMatches`, and `useMatchEvents` -- with their loading states, error handling, context providers, and event subscriptions -- are entirely application-level concerns.

The current React hooks (~259 lines) would remain unchanged regardless of whether instruction builders come from Codama or Anchor.

---

## 7. Existing Codebase Codama References

**None.** A grep of the entire repository for "codama" returned zero results. There is no existing Codama configuration, no `codama.json`, and no generated client directory.

---

## 8. Program Size and Complexity

The Magic Chess Anchor program has **20 public instructions** (counting the `#[program]` module):

- **Chess match lifecycle:** `initialize_match`, `join_match`, `make_move`, `resign_game`, `claim_timeout_win`, `process_match_settlement`, `abort_match`, `close_match`
- **MagicBlock ER:** `delegate_match`, `commit_state`, `undelegate_match`
- **MagicBlock scheduling:** `schedule_timeout`, `cancel_timeout_task`
- **Session keys:** `set_session_key`, `revoke_session_key`
- **Prediction market:** `initialize_prediction_pool`, `place_prediction_bet`, `settle_prediction_pool`, `claim_prediction_winnings`, `cancel_prediction_bet`

The IDL JSON is 66KB at `magic-chess-program/target/idl/speed_chess.json`. This is a moderately complex program with cross-cutting concerns (chess logic, SPL tokens, MagicBlock delegation, prediction markets).

The manually written IDL type stub in `sdk/src/idl/magic_chess.ts` is only 100 lines and is explicitly marked as a "placeholder" / "minimal type stub" -- it does not cover all instructions or accounts. This means the Anchor IDL type used at runtime is the actual JSON generated by `anchor build`, which is imported and parsed.

---

## 9. Recommendation: Stick with Manual SDK

### 9.1 Why not Codama

1. **Low replacement surface.** Codama would replace at most 30-35% of the SDK code. The high-value code (React hooks, MagicBlock integration, FEN utilities, business-logic queries, event types) all stays hand-written.

2. **Double maintenance.** You would still need a wrapper layer around Codama-generated code. Instead of maintaining one SDK, you'd maintain a wrapper + a codegen pipeline + the generated output. The wrapper would be nearly as large as the current client.

3. **Framework migration cost.** Switching from `@anchor-lang/core` to `@solana/kit` is a non-trivial refactor. The current test infrastructure (LiteSVM with Anchor), the wallet/provider setup, and the transaction flow all depend on Anchor's API.

4. **MagicBlock complexity.** The ER-specific methods (`commitState`, `undelegateMatch`) require dual-connection management, manual `Transaction` construction, and ER validator routing. Codama's generated instruction builders don't simplify this -- you still need the same manual transaction assembly.

5. **Stability risk.** Codama is flagged as "in active development and subject to change." The Anchor SDK, while not perfect, is stable and widely used. The codebase is already set up and working with Anchor.

6. **Low payoff.** The pain Codama solves -- keeping instruction builders in sync with the IDL -- is mitigated by TypeScript type checking. If an instruction signature changes, the Anchor `program.methods.X()` call breaks at compile time, catching the drift. The current SDK has 20 instructions; manual sync is not a meaningful burden at this scale.

### 9.2 When Codama would make sense

Codama would be worth adopting if:
- The program grows to 50+ instructions and manual sync becomes error-prone
- You need to generate a Rust client for an on-chain program that integrates with Magic Chess
- You are building a new program and want `@solana/kit` compatibility from day one
- The Anchor dependency becomes a problem (e.g., Webpack 5 bundling issues, React Native incompatibility)
- Codama matures and offers React/Next.js hooks as a renderer

### 9.3 Improvements to the manual SDK

If sticking with the manual SDK (recommended), consider these improvements:

1. **Complete the IDL type stub.** The current `idl/magic_chess.ts` is only 100 lines and is explicitly a placeholder. Either:
   - Auto-generate it from the IDL JSON using `anchor idl type` and commit the result
   - Write a simple script that reads `target/idl/speed_chess.json` and generates the type file

2. **Add error types.** Map the program's error codes from the IDL to typed TypeScript errors. The IDL JSON includes error definitions that could be auto-extracted.

3. **Add the missing instructions to the client.** The current `MagicChessClient` does not wrap all 20 instructions. Missing from the client: `scheduleTimeout`, `cancelTimeoutTask`, `setSessionKey`, `revokeSessionKey`, `closeMatch`, `abortMatch` (marked as not-implemented but it actually exists now), and all prediction market instructions.

4. **Auto-generate type stubs from IDL.** A small script (under 50 lines) that reads the IDL JSON and generates `types.ts` could eliminate the manual type-writing burden without adopting an entire codegen framework.

5. **Add a `Connection` adapter.** Instead of taking an Anchor `Program<MagicChess>`, the client could take a `Connection` + `Wallet` and build the Program internally. This reduces boilerplate in consumer code.

6. **Add `@solana/kit` compat layer.** Consider a thin adapter that exposes the client's methods in `@solana/kit` style for consumers who prefer that ecosystem.

---

## 10. Migration Plan (if Codama were adopted)

If the decision changes in the future, here is what the migration would look like:

### Step 1: Generate Codama client

```bash
cd magic-chess-program
npx codama init   # Creates codama.json pointing at target/idl/speed_chess.json
npx codama run --all  # Generates clients/js/src/generated/
```

### Step 2: Replace Anchor IDL type

Delete `sdk/src/idl/magic_chess.ts`. Import types from generated code instead.

### Step 3: Replace instruction builders in client.ts

Replace `this.program.methods.initializeMatch(...)` calls with Codama-generated instruction builders. This is the bulk of the work -- ~200-300 lines to rewrite.

### Step 4: Replace PDA helpers

Replace `pda.ts` with Codama-generated PDA functions.

### Step 5: Replace account fetching

Replace `this.program.account.chessMatch.fetch(pda)` with Codama-generated fetch functions.

### Step 6: Update dependencies

- Remove `@anchor-lang/core` as a peer dependency
- Add `@solana/kit` and Codama packages
- Update `@solana/web3.js` to v2 if not already

### Step 7: Rewrite ER-specific methods

The `commitState` and `undelegateMatch` methods currently use `program.methods.X().instruction()` to get instructions. Replace with Codama-generated instruction builders.

### Step 8: Keep everything else

React hooks, MagicBlock helpers, FEN utilities, event types, convenience queries -- all unchanged.

**Estimated effort:** 2-4 days for a clean migration, plus testing.

---

## Sources

- [Solana Docs -- Generating Clients with Codama](https://solana.com/docs/programs/codama/clients)
- [QuickNode -- How to Create Anchor Program Clients using Codama](https://www.quicknode.com/guides/solana-development/anchor/codama-client)
- [QuickNode -- Custom Program Clients in Solana Kit with Codama](https://www.quicknode.com/guides/solana-development/tooling/solana-kit/program-clients)
- [npm -- @macalinao/codama-cli](https://www.npmjs.com/package/@macalinao/codama-cli)
- [npm -- create-codama-clients](https://www.npmjs.com/package/create-codama-clients)
- [GitHub -- codama-idl (Solana Foundation)](https://github.com/solana-foundation/solana-dev-skill/blob/main/skill/references/idl-codegen.md)
