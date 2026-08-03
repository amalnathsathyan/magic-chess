# Magic Chess — Current State & Next Steps

> Auto-generated 2026-08-03. Handoff doc for next agent/session.

## What's Done

### Program (Anchor 1.1.2, Solana 2.x)
- **22 instructions**: full match lifecycle + MagicBlock ER + prediction markets
- **All 13 bugs fixed** (12 verified, 1 LOW dead code remains)
- **205 tests**: 182 unit + 23 LiteSVM + 8 Mollusk CU + 12 Anchor TS
- **Program ID**: `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`
- **Build**: `cargo build-sbf --tools-version v1.52` (macOS 12)
- **Deployed**: local test validator, not yet on devnet

### SDK (`@magic-chess/sdk`)
- Manual TypeScript client: `MagicChessClient`, React hooks, PDA helpers, FEN utils, MagicBlock helpers
- **Decision**: Stick with manual SDK (not Codama). Anchor 1.1.2 requires web3.js v1. MagicBlock requires @solana/kit v4. Hybrid approach.
- **Peer dep fix needed**: `sdk/package.json` has invalid `@solana/web3.js: ^2.0.0` → should be `@solana/kit: ^4.0.0`
- MagicBlock instructions (`delegateMatch`, `commitState`, `undelegateMatch`) in SDK need wire-up

### Frontend (Next.js 15 + PWA)
- **Builds clean**: `cd frontend && npm run build` passes
- **7 routes**: landing, arena (lobby), play/[matchId], spectate, profile
- **11 components**: ChessBoard (react-chessboard v5), ChessClock, MoveList, PromotionDialog, etc.
- **Privy wired**: email, Google, wallet, Discord login. Embedded Solana wallet.
- **Jotai store**: wallet, match, lobby atoms
- **MagicBlock integration**: all TODO stubs in `frontend/lib/magicblock.ts`
- **Deps**: @solana/kit v5.5.1, @privy-io/react-auth v2.25.0, react-chessboard v5, chess.js

### Docs
- `README.md`: architecture diagram (mermaid), gas model, token flow, session keys, crank
- `DEPLOY.md`: 3 paths (Surfpool → Solana devnet → MagicBlock devnet)

## What's NOT Done (Next Agent Tasks)

### P0 — Frontend Live
1. **Create Privy app** at dashboard.privy.io → get App ID + App Secret
2. **Enable gas sponsorship** in Privy Dashboard: App pays → Solana Devnet → TEE
3. **Create `.env.local`** in `frontend/`:
   ```
   NEXT_PUBLIC_PRIVY_APP_ID=<from-privy>
   PRIVY_APP_SECRET=<from-privy>
   NEXT_PUBLIC_PROGRAM_ID=FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
   ```
4. **Run**: `cd frontend && npm run dev` → open localhost:3000
5. **Verify**: sign in via Google/email → embedded wallet created → wallet address shown

### P0 — Deploy Program to Devnet
1. `solana config set --url devnet`
2. `solana airdrop 2` (×3 for 6 SOL)
3. `cargo build-sbf --tools-version v1.52`
4. `anchor deploy --provider.cluster devnet`
5. Upload IDL: `anchor idl init --filepath target/idl/magic_chess.json FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`

### P1 — Wire SDK to Frontend
1. Fix `sdk/package.json` peer deps (see above)
2. Replace TODO stubs in `frontend/lib/magicblock.ts` with real SDK calls
3. Wire `useChessMatch`, `useMoveSubmit`, `useMagicBlock` hooks to SDK
4. Implement `createMatch`, `joinMatch`, `makeMove` flows from UI

### P1 — PWA Setup
1. Add `manifest.json` to `frontend/public/`
2. Add service worker (`next-pwa` or `@serwist/next`)
3. Create PWA install prompt component
4. Generate app icons (192×192, 512×512, maskable)

### P2 — Zero-Bet Friendly Mode
1. Change `MIN_BET_AMOUNT: 1` → `0` in `constants.rs`
2. Guard SPL transfer in `initialize_match.rs` and `join_match.rs` with `if bet_amount > 0`
3. Optional: add `has_bet: bool` field to skip escrow creation

### P2 — E2E Test Flow
1. Deploy to devnet
2. Create SPL token mint (mock $CHESS or USDC devnet)
3. Test: initialize_match → join_match → make_move × N → game end → settle

### P3 — MagicBlock Devnet
1. Program deployed on Solana devnet (prerequisite)
2. Test delegation flow: delegate_match → make moves on ER → commit → undelegate
3. Test session keys: set_session_key → 0-confirmation moves
4. Test crank automation: schedule_timeout → claim_timeout_win → auto-settle

## Key Architecture Decisions
- **Tokens stay on L1**, ER = game engine only. No Ephemeral SPL Token escrow needed.
- **Session key scope**: `make_move` only. Not resign, not claim_timeout.
- **Gas model**: L1 delegation ~$0.001 (Privy), ER moves $0 (MagicBlock), commits free (10/mo), session close ~$0.06.
- **4 wallet confirmations** per player per match regardless of move count.
- **Next.js + PWA**, not React Native. Mobile via PWA install prompt.
- **Manual SDK**, not Codama. Anchor→web3.js v1, MagicBlock→@solana/kit v4. Can't unify yet.
- **Devnet first**, then MagicBlock ER, then mainnet.

## File Map
```
magic-chess/
├── magic-chess-program/     # Anchor program + tests (Rust)
├── sdk/                     # @magic-chess/sdk (TypeScript)
├── frontend/                # Next.js 15 + PWA
│   ├── app/                 # 7 routes
│   ├── components/          # 11 chess + landing components
│   ├── hooks/               # useChessClock, useChessMatch, useMagicBlock, useMoveSubmit
│   ├── lib/                 # SDK wiring + MagicBlock helpers (TODO stubs)
│   ├── store/               # Jotai atoms (wallet, match, lobby)
│   └── .env.example         # All env vars documented
├── docs/
│   └── current-state.md     # This file
├── README.md                # Architecture doc with mermaid diagram
├── DEPLOY.md                # 3-path deployment guide
└── SPEC.md                  # Project specification
```
