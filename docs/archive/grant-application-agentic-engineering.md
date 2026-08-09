# Agentic Engineering Grant Application — Magic Chess

**Submit at**: https://superteam.fun/earn/grants/agentic-engineering
**Grant amount**: 200 USDG
**Target deadline**: September 8, 2026 (IST)

> Iterated with solana.new's `apply-grant` workflow in Codex. Claude Code and Codex session transcripts (`claude-session.jsonl`, `codex-session.jsonl`) are exported to the project root as proof of the agentic workflow.

---

## How I use solana.new for agentic engineering

I have used solana.new's agentic toolchain inside Claude Code and Codex throughout Magic Chess. The workflow includes:

- **Idea validation** (`validate-idea` skill): stress-tested the concept against market data and competitor landscape
- **Scaffolding** (`scaffold-project` skill): generated the Anchor workspace, SDK structure, and frontend skeleton
- **Build guidance** (`build-with-claude` skill): step-by-step implementation of the chess engine, escrow logic, and prediction pools
- **Security review** (`solana-audit`, `review-and-iterate` skills): internal agent-assisted review passes covering delegation auth, session-key isolation, and re-entrancy vectors
- **Deploy prep** (`deploy-to-mainnet` skill): devnet deployment, MagicBlock ER wiring, Cloudflare frontend
- **This application** (`apply-grant` skill): gathered project data, git history, and generated this submission

The current IDL exposes 21 instructions, and the repository contains 263 Rust test definitions across its core and CU harnesses. A fresh core run verified 252 passing tests. This grant helps me extend the same agent-assisted loop into adversarial review, end-to-end product verification, and a public agent gameplay demo.

---

## Step 1: Basics

**Project Title**
> Magic Chess

**One Line Description**
> An on-chain chess arena on Solana with comprehensive rule enforcement, gasless MagicBlock gameplay, trustless SPL-token wagers, parimutuel predictions, and SDK access designed for both human and AI players.

**TG username**
> t.me/amalnathsathyan

**Wallet Address**
> 8NUByb8eh3W4okxPXhSnaRdc75YZguJJu9LdZMsP8S6D

---

## Step 2: Details

**Problem Statement**
> Chess already has a global culture of players, spectators, rankings, tournaments, and creators, yet its on-chain market is still largely untapped. When I studied blockchain chess products, I kept finding projects that solved only one fragment: a basic rules engine, an escrow contract, or chess as a side mode inside a larger platform. I could not find the complete experience I wanted as a player—create a serious match, play without repeated wallet friction, let spectators participate in the outcome, and settle everything transparently. The opportunity is not to invent demand for chess; it is to give an existing player-and-spectator market an on-chain product that still feels like chess.

**Proposed Solution**
> Magic Chess closes that loop with an original Rust rules implementation built as an Anchor program. It covers piece movement, castling, en passant, promotions, check and checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule. MagicBlock Ephemeral Rollups handle delegated gameplay so moves are gasless and low-latency, while Solana L1 holds SPL wagers in PDA escrow and handles settlement. A parimutuel prediction layer lets spectators predict White, Black, or Draw and rewards correct predictors proportionally.
>
> The TypeScript SDK is designed to expose the same match lifecycle to human clients and AI agents. Privy already provides the social-login foundation; this grant completes the restricted sponsorship flow for L1 entry transactions and the end-to-end product wiring. The goal is simple: make on-chain chess feel as natural as Web2 chess, while adding trustless wagering, verifiable game history, spectator participation, and open agent access.

**Project Details**
> Chess already has a global culture of players, spectators, rankings, tournaments, and creators, but its on-chain market is still largely untapped. When I looked at blockchain chess products, I kept finding projects that solved only one part of the experience: a basic rules engine, an escrow contract, or chess as one small game inside a larger platform. I could not find the complete loop I wanted as a player — create a serious match, play it without wallet friction, let spectators participate in the outcome, and settle everything transparently. I have worked as a blockchain engineer in the Solana ecosystem since 2024, mainly on full-stack Solana projects, and this idea has been in my head since the Turbin3 MagicBlock Special Cohort.
>
> Magic Chess is my attempt to build that complete loop. It is an original Rust chess-rules implementation built as an Anchor program, covering piece movement, castling, en passant, promotion, check and checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule. Match state and move validation live on-chain. MagicBlock Ephemeral Rollups handle delegated gameplay so moves can be submitted gaslessly and with low latency, while Solana L1 remains the settlement layer for SPL-token wagers. The devnet program also includes per-player session keys, PDA escrow, timeout and settlement flows, and parimutuel prediction pools.
>
> The thesis is simple: players can create a game with or without a wager, another player can join, and spectators can predict the result. I expect the prediction layer to create more activity than head-to-head wagers alone, which is why zero-wager matches matter: a good game can attract an audience even when the players did not put up a pot. Correct predictors share the pool proportionally, while part of the losing side of the pool goes to the players. That gives strong players another reason to create public matches and gives spectators a reason to follow them. My aim is a platform where someone who loves chess can sign in with a social account or wallet and immediately play, learn, and earn — without first learning how Solana fees, RPCs, or transaction signing work.
>
> The next step is to turn the current devnet build into a coherent public product. By September 8, I will finish the Privy social-login and sponsored-transaction flow, wire the frontend through the complete create → join → play → predict → settle lifecycle, publish clear agent integration documentation, and demonstrate an agent completing a match through the same SDK used by humans. Longer term, I want Human vs Human, Human vs Agent, and Agent vs Agent competition, leaderboards, tournaments, and carefully designed incentives for new players. The north-star version of Magic Chess is a place where autonomous agents can build reputations beside human players — and where, one day, a player like Magnus Carlsen can play a match that anyone in the world can watch and verify. That is the ambition; this grant milestone is deliberately narrow: make the existing on-chain system easy to enter, easy to verify, and usable by an agent without special infrastructure.

**Deadline**
> September 8, 2026 (Asia/Kolkata)

**Proof of Work**
> - **Live demo:** https://arena.chessmagic.workers.dev/
> - **Public repository:** https://github.com/amalnathsathyan/magic-chess
> - **Devnet program:** `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
> - **On-chain scope:** Match creation and joining, move validation, MagicBlock delegation, per-player session keys, timeout handling, SPL escrow settlement, and prediction-pool lifecycle are implemented in the Anchor program.
> - **Chess coverage:** Automated cases cover standard piece movement and captures, castling restrictions, en passant, promotions, check/checkmate, stalemate, repetition, insufficient material, and the fifty-move rule.
> - **Test infrastructure:** A fresh `cargo test -p magic_chess` run verified 252 passing Rust tests with zero failures and three environment-dependent cases ignored. The repository also contains nine Mollusk compute-unit benchmark cases and 30 Anchor TypeScript integration cases.
> - **Security work:** Public commits document signer and delegation hardening, per-player session-key isolation, escrow validation, checked arithmetic, re-entrancy regression tests, token edge cases, and prediction-lifecycle tests. These are internal security passes, not a claim of an independent audit.
> - **TypeScript SDK:** `@magic-chess/sdk` exists in the repository with client methods, PDA derivation, IDL types, React hooks, and MagicBlock routing helpers. It is not yet claimed as published to npm.
> - **Application and infrastructure:** A Next.js 15 PWA, Fastify API, PostgreSQL persistence, leaderboard endpoints, and CI workflow are present in the repository; the remaining grant work is end-to-end product integration and public validation.
> - **Agentic engineering evidence:** The development workflow uses solana.new skills including validate-idea, scaffold-project, build-with-claude, solana-audit, review-and-iterate, and apply-grant. Session transcripts `claude-session.jsonl` and `codex-session.jsonl` are exported as evidence of the agent-assisted workflow.

**Personal X Profile**
> x.com/amalnathsathyan

**Personal GitHub Profile**
> github.com/amalnathsathyan

**Colosseum Crowdedness Score**
> Generate the score at https://colosseum.com/copilot, take a screenshot, upload it to a publicly accessible Google Drive file, and paste the shareable link here.

**AI Session Transcript**
> Attach `claude-session.jsonl` and `codex-session.jsonl` from the project root. These transcripts capture the full solana.new agentic workflow used to build Magic Chess.

---

## Step 3: Milestones

**Goals and Milestones**
> 1. **Verified devnet lifecycle — August 15:** Reconcile the program IDL and SDK, run and document the current test suites, and demonstrate create → join → delegate → move → end → settle on devnet from the application.
> 2. **Gasless onboarding — August 22:** Complete Privy social login and embedded-wallet onboarding, sponsor the required L1 entry transactions through a restricted fee-payer flow, and use scoped session keys for gasless moves on MagicBlock ER.
> 3. **Predictions and spectator flow — August 29:** Wire the spectator interface to real match state and complete the devnet bet → settle → claim path, including live odds, failure states, and regression tests for payout edge cases.
> 4. **Agent demo and public playtest — September 8:** Publish agent integration documentation, run an SDK-driven agent through a complete match, open the devnet application for a community playtest, and report completed matches, unique players, prediction participation, and transaction failures.

**Primary KPI**
> At least 50 completed devnet matches from 20 unique authenticated players by September 8, 2026, with the full match lifecycle recorded on-chain.

**Final tranche reminder**
> To receive the final tranche, submit the Colosseum project link, the GitHub repository (https://github.com/amalnathsathyan/magic-chess), and the AI subscription receipt.

---

## Files and links to prepare before submitting

| Item | Status |
|---|---|
| `claude-session.jsonl` | Exported to project root |
| `codex-session.jsonl` | Exported to project root |
| Colosseum Crowdedness Score screenshot | Still required |
| Public Google Drive link for the screenshot | Still required |
| Latest core Rust test command/output summary | Verified on August 8, 2026 |
| AI subscription receipt | Required for final tranche |

---

## Internal editing notes — do not paste into the form

These points may belong in a longer vision document, but should not be presented as shipped grant deliverables yet:

- "The most complete on-chain chess engine" unless accompanied by a current, sourced competitor comparison.
- "A complete rewrite of Stockfish." Magic Chess contains an original rules engine; Stockfish is a different category of engine and introduces GPL attribution/licensing questions.
- “Zero gas” for the whole application. ER moves are gasless; L1 creation, delegation, and settlement require a payer until the sponsorship flow is complete.
- A published npm SDK until an actual npm package URL is available.
- An independent security audit unless a third-party report can be linked.
- “All tests pass” until the Mollusk CU expectations are recalibrated. The current core run is green; five of nine CU benchmarks pass, while four fail stale minimum-range assertions even though every reported measurement is far below the 200,000 CU budget.
- Token-holder revenue distributions, buybacks, burns, or fixed incentive economics before legal review and usage data. These distract from the engineering milestone and may create avoidable regulatory questions.
- A Magnus Carlsen appearance as a dated roadmap commitment. It can remain as a clearly labeled north-star ambition, not a grant milestone under the team's control.

---

## Plain copy-paste version (no markdown — paste directly into form)

---

### Step 1: Basics

**Project Title**
Magic Chess

**One Line Description**
An on-chain chess arena on Solana with comprehensive rule enforcement, gasless MagicBlock gameplay, trustless SPL-token wagers, parimutuel predictions, and SDK access designed for both human and AI players.

**TG username**
t.me/amalnathsathyan

**Wallet Address**
8NUByb8eh3W4okxPXhSnaRdc75YZguJJu9LdZMsP8S6D

---

### Step 2: Details

**Problem Statement**
Chess already has a global culture of players, spectators, rankings, tournaments, and creators, yet its on-chain market is still largely untapped. When I studied blockchain chess products, I kept finding projects that solved only one fragment: a basic rules engine, an escrow contract, or chess as a side mode inside a larger platform. I could not find the complete experience I wanted as a player—create a serious match, play without repeated wallet friction, let spectators participate in the outcome, and settle everything transparently. The opportunity is not to invent demand for chess; it is to give an existing player-and-spectator market an on-chain product that still feels like chess.

**Proposed Solution**
Magic Chess closes that loop with an original Rust rules implementation built as an Anchor program. It covers piece movement, castling, en passant, promotions, check and checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule. MagicBlock Ephemeral Rollups handle delegated gameplay so moves are gasless and low-latency, while Solana L1 holds SPL wagers in PDA escrow and handles settlement. A parimutuel prediction layer lets spectators predict White, Black, or Draw and rewards correct predictors proportionally.

The TypeScript SDK is designed to expose the same match lifecycle to human clients and AI agents. Privy already provides the social-login foundation; this grant completes the restricted sponsorship flow for L1 entry transactions and the end-to-end product wiring. The goal is simple: make on-chain chess feel as natural as Web2 chess, while adding trustless wagering, verifiable game history, spectator participation, and open agent access.

**Project Details**
Chess already has a global culture of players, spectators, rankings, tournaments, and creators, but its on-chain market is still largely untapped. When I looked at blockchain chess products, I kept finding projects that solved only one part of the experience: a basic rules engine, an escrow contract, or chess as one small game inside a larger platform. I could not find the complete loop I wanted as a player — create a serious match, play it without wallet friction, let spectators participate in the outcome, and settle everything transparently. I have worked as a blockchain engineer in the Solana ecosystem since 2024, mainly on full-stack Solana projects, and this idea has been in my head since the Turbin3 MagicBlock Special Cohort.

Magic Chess is my attempt to build that complete loop. It is an original Rust chess-rules implementation built as an Anchor program, covering piece movement, castling, en passant, promotion, check and checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule. Match state and move validation live on-chain. MagicBlock Ephemeral Rollups handle delegated gameplay so moves can be submitted gaslessly and with low latency, while Solana L1 remains the settlement layer for SPL-token wagers. The devnet program also includes per-player session keys, PDA escrow, timeout and settlement flows, and parimutuel prediction pools.

The thesis is simple: players can create a game with or without a wager, another player can join, and spectators can predict the result. I expect the prediction layer to create more activity than head-to-head wagers alone, which is why zero-wager matches matter: a good game can attract an audience even when the players did not put up a pot. Correct predictors share the pool proportionally, while part of the losing side of the pool goes to the players. That gives strong players another reason to create public matches and gives spectators a reason to follow them. My aim is a platform where someone who loves chess can sign in with a social account or wallet and immediately play, learn, and earn — without first learning how Solana fees, RPCs, or transaction signing work.

The next step is to turn the current devnet build into a coherent public product. By September 8, I will finish the Privy social-login and sponsored-transaction flow, wire the frontend through the complete create → join → play → predict → settle lifecycle, publish clear agent integration documentation, and demonstrate an agent completing a match through the same SDK used by humans. Longer term, I want Human vs Human, Human vs Agent, and Agent vs Agent competition, leaderboards, tournaments, and carefully designed incentives for new players. The north-star version of Magic Chess is a place where autonomous agents can build reputations beside human players — and where, one day, a player like Magnus Carlsen can play a match that anyone in the world can watch and verify. That is the ambition; this grant milestone is deliberately narrow: make the existing on-chain system easy to enter, easy to verify, and usable by an agent without special infrastructure.

**Deadline**
September 8, 2026 (Asia/Kolkata)

**Proof of Work**
- Live demo: https://arena.chessmagic.workers.dev/
- Public repository: https://github.com/amalnathsathyan/magic-chess
- Devnet program: FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
- On-chain scope: Match creation and joining, move validation, MagicBlock delegation, per-player session keys, timeout handling, SPL escrow settlement, and prediction-pool lifecycle are implemented in the Anchor program.
- Chess coverage: Automated cases cover standard piece movement and captures, castling restrictions, en passant, promotions, check/checkmate, stalemate, repetition, insufficient material, and the fifty-move rule.
- Test infrastructure: A fresh cargo test -p magic_chess run verified 252 passing Rust tests with zero failures and three environment-dependent cases ignored. The repository also contains nine Mollusk compute-unit benchmark cases and 30 Anchor TypeScript integration cases.
- Security work: Public commits document signer and delegation hardening, per-player session-key isolation, escrow validation, checked arithmetic, re-entrancy regression tests, token edge cases, and prediction-lifecycle tests. These are internal security passes, not a claim of an independent audit.
- TypeScript SDK: @magic-chess/sdk exists in the repository with client methods, PDA derivation, IDL types, React hooks, and MagicBlock routing helpers. It is not yet claimed as published to npm.
- Application and infrastructure: A Next.js 15 PWA, Fastify API, PostgreSQL persistence, leaderboard endpoints, and CI workflow are present in the repository; the remaining grant work is end-to-end product integration and public validation.
- Agentic engineering evidence: The development workflow uses solana.new skills including validate-idea, scaffold-project, build-with-claude, solana-audit, review-and-iterate, and apply-grant. Session transcripts claude-session.jsonl and codex-session.jsonl are exported as evidence of the agent-assisted workflow.

**Personal X Profile**
x.com/amalnathsathyan

**Personal GitHub Profile**
github.com/amalnathsathyan

**Colosseum Crowdedness Score**
Generate the score at https://colosseum.com/copilot, take a screenshot, upload it to a publicly accessible Google Drive file, and paste the shareable link here.

**AI Session Transcript**
Attach claude-session.jsonl and codex-session.jsonl from the project root. These transcripts capture the full solana.new agentic workflow used to build Magic Chess.

---

### Step 3: Milestones

**Goals and Milestones**
1. Verified devnet lifecycle — August 15: Reconcile the program IDL and SDK, run and document the current test suites, and demonstrate create → join → delegate → move → end → settle on devnet from the application.
2. Gasless onboarding — August 22: Complete Privy social login and embedded-wallet onboarding, sponsor the required L1 entry transactions through a restricted fee-payer flow, and use scoped session keys for gasless moves on MagicBlock ER.
3. Predictions and spectator flow — August 29: Wire the spectator interface to real match state and complete the devnet bet → settle → claim path, including live odds, failure states, and regression tests for payout edge cases.
4. Agent demo and public playtest — September 8: Publish agent integration documentation, run an SDK-driven agent through a complete match, open the devnet application for a community playtest, and report completed matches, unique players, prediction participation, and transaction failures.

**Primary KPI**
At least 50 completed devnet matches from 20 unique authenticated players by September 8, 2026, with the full match lifecycle recorded on-chain.

**Final tranche reminder**
To receive the final tranche, submit the Colosseum project link, the GitHub repository (https://github.com/amalnathsathyan/magic-chess), and the AI subscription receipt.
