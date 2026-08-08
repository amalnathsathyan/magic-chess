# MagicBlock Solana Blitz V7 Submission — Magic Chess

**Event:** Solana Blitz V7 — Collaboration  
**Submit:** https://build.magicblock.app/?event=10&stage=blitz  
**Status:** Submission copy is ready. The pitch/demo video URL and country of residence still need to be added.

---

## Form fields

### About you

**First name**
> Amalnath

**Last name**
> Sathyan

**Email**
> amalnathsathyan@gmail.com

**Country of residence**
> `<ADD COUNTRY OF RESIDENCE>`

**Role(s)**
> Founder, Blockchain Engineer, Full-stack Developer — select the closest available options.

**Wallet**
> `8NUByb8eh3W4okxPXhSnaRdc75YZguJJu9LdZMsP8S6D`

### Proof of work

**Project name**
> Magic Chess

**Description**
> Chess already has a global culture of players, spectators, rankings, and tournaments, yet its on-chain market is still largely untapped. Existing blockchain chess experiments often solve only one part of the experience: move validation, escrow, or a chess mode inside a larger platform. I wanted the complete loop—create a serious match, play without repeated wallet friction, let spectators participate in the outcome, and settle everything transparently.
>
> Magic Chess is a real-time, on-chain chess arena on Solana. Players create and join matches with an optional SPL-token wager, while spectators predict White, Black, or Draw through parimutuel pools. The original Rust rules engine validates piece movement, castling, en passant, promotion, check and checkmate, stalemate, threefold repetition, insufficient material, and the fifty-move rule. PDA escrows hold wagers, and the program settles match and prediction payouts without a trusted operator.
>
> MagicBlock is what makes this usable as a game rather than a sequence of wallet popups. A match account is created on Solana and delegated to an Ephemeral Rollup. Moves execute against the delegated state with low latency and no per-move gas cost; scoped session keys remove repeated approvals. The final state commits back to Solana, while token custody and settlement stay on L1.
>
> The live devnet PWA, public Anchor program, TypeScript SDK, prediction flow, and backend are already implemented. A fresh core test run verified 252 passing Rust tests with zero failures and three environment-dependent cases ignored. For Blitz V7's collaboration theme, Magic Chess brings players, spectators, and eventually headless agents into the same verifiable match: different participants, one shared on-chain state.

**Categories — choose up to three**
> Games · Consumer · DeFi

**Project website**
> https://arena.chessmagic.workers.dev/

**GitHub project repository**
> https://github.com/amalnathsathyan/magic-chess

**Pitch & Demo**
> `<ADD YOUTUBE OR LOOM VIDEO URL — KEEP UNDER 3 MINUTES>`

**Explorer link — MagicBlock integration proof**
> https://explorer.solana.com/address/FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h?cluster=devnet

**Program address**
> `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`

**Additional information**
> MagicBlock is part of the core execution path, not a badge added for the hackathon. The program implements delegation, ER move execution, scoped per-player session keys, state commits, and undelegation. Solana L1 remains responsible for SPL-token custody and deterministic settlement.
>
> The repository includes the Anchor program, Next.js PWA, TypeScript SDK, Fastify/PostgreSQL backend, CI, LiteSVM integration coverage, payout-flow tests, and Mollusk compute-unit benchmarks. The demo and repository are public, and the devnet program deployment has been independently rechecked for this submission.
>
> I am a solo builder and have worked as a blockchain engineer in the Solana ecosystem since 2024. The idea has stayed with me since the Turbin3 MagicBlock Special Cohort. My immediate goal is simple: make the complete create → join → play → predict → settle flow feel like chess first and blockchain second.

**Team members**
> Solo builder — `t.me/amalnathsathyan`

**Ecosystem partners**
> Leave blank unless the form treats technology integrations as ecosystem partners. No formal partnership is claimed.

---

## Judge quick start

1. Open the live devnet application: https://arena.chessmagic.workers.dev/
2. Sign in with Privy or connect a Solana wallet.
3. Open the Arena to create, join, or spectate a match.
4. Verify the deployed program in Solana Explorer using the link above.
5. Review the public repository and the architecture in `README.md`.

For a local frontend run:

```bash
git clone https://github.com/amalnathsathyan/magic-chess.git
cd magic-chess/frontend
npm install
cp .env.example .env.local
npm run dev
```

The local `.env.local` requires a Privy app ID and platform fee wallet. Judges who only want to evaluate the product should use the live devnet deployment.

To run the verified core Rust suite:

```bash
cd magic-chess/magic-chess-program
cargo test -p magic_chess
```

---

## Pitch and demo script — approximately 2:40

### 0:00–0:15 — Hook

Show an active board with the second player and spectator view visible.

> Chess already has players and spectators. What it does not have is a complete on-chain arena where both groups can participate without turning every move into a wallet transaction.

### 0:15–0:30 — Product

Show the landing page, then enter the Arena.

> Magic Chess lets players create and join verifiable chess matches, optionally wager SPL tokens, and open parimutuel predictions to spectators.

### 0:30–1:15 — Create and join

- Sign in.
- Create a match with predictions enabled.
- Copy the match link.
- Join from a second clean browser profile.

> The match and escrow start on Solana. Once the match is ready, its state is delegated to a MagicBlock Ephemeral Rollup for real-time play.

### 1:15–1:55 — Play and predict

- Make moves from both player windows.
- Show that the board updates without a wallet approval for every move.
- Place a prediction from the spectator view.

> Scoped session keys authorize gameplay without exposing token custody. Spectators use the same verifiable match state to predict White, Black, or Draw.

### 1:55–2:20 — On-chain proof

- Open the deployed program in Solana Explorer.
- Briefly show the match account or a move transaction.
- Show the repository's delegation and session-key code for no more than ten seconds.

> MagicBlock executes the high-frequency game state. Solana L1 remains the source of truth for escrow and settlement.

### 2:20–2:40 — Close

Show the live arena and GitHub repository.

> Magic Chess turns a two-player game into a shared arena for players, spectators, builders, and future agents. Try the devnet build and inspect every layer in the public repository.

---

## Final submission checklist

- [x] Live project website responds successfully.
- [x] GitHub repository is public.
- [x] Devnet program deployment is verified.
- [x] Description explains how MagicBlock is essential to the product.
- [x] Categories selected: Games, Consumer, DeFi.
- [ ] Add country of residence.
- [ ] Record and upload the sub-three-minute pitch/demo video.
- [ ] Replace the video placeholder with its public URL.
- [ ] Record only flows that work on the deployed build; do not narrate roadmap features as shipped.
- [ ] Submit when the Blitz V7 window opens—the official page currently exposes the event metadata but reports no open submission event.
