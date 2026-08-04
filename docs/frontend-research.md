# Magic Chess — Frontend Research & Design Decisions

> Research compiled 2026-08-03. 4 agents + web searches across open-source chess UIs, MagicBlock winners, UI/UX patterns, and web3 gaming frontends.

---

## 1. Chess Board Library — Recommendation

### Final Pick: `react-chessboard` v5 (Clariity fork)

Already specified in SPEC.md. Best fit for our needs:

| Feature | Support |
|---------|---------|
| Custom pieces | ✅ Object mapping `{ wK: url, bP: url }` |
| Drag & drop + click-to-move | ✅ Both |
| Animations | ✅ `dropAnimation`, smooth piece transitions |
| Mobile/touch | ✅ Touch-optimized |
| TypeScript | ✅ Full types |
| Custom square styles | ✅ Per-square styling for highlights |
| Spare pieces area | ✅ Below-board display |
| Premoves | ❌ Not in v5 (v4 juniperab fork has it) |
| npm | `react-chessboard` v5.10.0+ |
| License | MIT |

**Verdict:** Stick with it. Premoves can be added as custom logic layer on top of `onPieceDrop` return values. The v5 API is cleaner and more TypeScript-friendly than v4.

### Strong Alternative: `@xanderwaugh/chess-board` v1.1.2

Full-package option (Next.js 16, React 19, Framer Motion, Tailwind CSS 4):

| Feature | Support |
|---------|---------|
| Board themes | 4 built-in (Default, Wood, Marble, Neon) |
| Chess clock | ✅ Configurable time controls, pause/resume |
| Sound effects | ✅ Move, capture, game-end audio |
| FEN/PGN import/export | ✅ Full support |
| Light/dark mode | ✅ |
| WebSocket-ready | ✅ |
| Stockfish-ready | ✅ |
| Modular hooks | `useChessGame` returns everything |
| License | MIT |

**Why not pick it:** Heavier dependency footprint (radix-ui, sonner, framer-motion, lucide-react). We already have our own clock, state management (Jotai), and UI components (shadcn/ui). Duplicative. But excellent reference for component architecture.

### Reference: Chessground (`@bezalel6/react-chessground`)

Lichess's battle-tested board. Best premove support in ecosystem. Small (10K gzipped), zero deps, custom DOM diff algorithm. GPL-3.0 license — problematic for our MIT project.

**Take inspiration from:**
- SVG arrow drawing on board (analysis arrows)
- Move destination dots + capture rings pattern
- Premove queuing UX flow
- Touch event handling

---

## 2. MagicBlock Winners — Patterns to Follow

### Solana Blitz v1 Winners

| Place | Project | What It Is | Key Pattern |
|-------|---------|------------|-------------|
| 🥇 | **TaskForest** | Trustless task marketplace | Sub-50ms bids on ER, escrow settlement on L1 |
| 🥈 | **Blockrooms** | On-chain FPS (Backrooms) | Game sessions delegated to ER, gasless low-latency gameplay |
| 🥉 | **Magic Hide and Seek** | On-chain prop hunt | Real-time positions committed to ER, raycasts verified in program |
| 🧙 | **Soliton** | Rule 110 cellular automata | Shared world simulation evolving on ER without mainnet fees |

### Winner Patterns We Should Adopt

1. **L1 for assets, ER for gameplay** — Every winner follows this. Tokens stay on L1, game logic runs on ER. We already do this.
2. **Session delegation is the UX unlock** — Winners sell the "gasless, instant" experience prominently. Blockrooms: "gasless FPS." TaskForest: "sub-50ms bids."
3. **Single-purpose programs** — Each winner's program does one thing well. No scope creep.
4. **Polished README + demo video** — Winners have clean repos, clear value props, and working demos.
5. **MagicBlock docs chess tutorial** — MagicBlock themselves have a Unity-based on-chain chess tutorial. We're building the Anchor/Rust equivalent. That's our differentiation.

### MagicBlock Builders Page

Authentication-gated (Telegram + wallet login). Can't scrape without auth. Standard hackathon flow: register → submit with demo link + GitHub.

### Critical Finding: No Chess Project Has Ever Won

**Zero chess projects among 240+ submissions across 7 Blitz editions (v0-v6).** MagicBlock's own chess tutorial (`magicblock-labs/Solana-Unity-Chess`, 23 stars) is Unity/C# based and uses **direct L1 state** — not Ephemeral Rollups. Their Anchor chess engine (`magicblock-labs/sol-chess`) is deployed on devnet but has no web frontend.

**This is our gap.** We're building the first web-based chess game on MagicBlock Ephemeral Rollups with:
- Anchor/Rust chess engine (already built — 205 tests)
- Next.js web frontend (not Unity)
- True ER delegation for gasless moves (not direct L1)
- SPL token wagering with PDA escrow

### Winner Tech Stack (80% of winners)

| Layer | Choice | Our Match |
|-------|--------|-----------|
| Frontend | Next.js 14-16 + React 18/19 + Tailwind | ✅ Matched |
| Smart Contract | Anchor 0.32.x (Rust) | ✅ Anchor 1.1.2 |
| Structure | Monorepo: `programs/` + `app/` | ✅ `magic-chess-program/` + `frontend/` |
| Auth | Privy | ✅ Spec'd |
| State | Zustand or Redux | Jotai (simpler) |
| Deployment | Vercel | ✅ Planned |
| Session Keys | Games, trading apps | ✅ Core feature |
| VRF | Gaming randomness | Not needed (chess is deterministic) |

### Winner Patterns to Copy

1. **Monorepo with clear separation** — Ghost Stops, WHO RUG US?, YieldWars all use `programs/` + `app/` structure
2. **Session keys marketed as UX unlock** — "Gasless gameplay" in taglines
3. **Vendored/typed API clients** — Ghost Stops vendors FlashTrade V2 client; we have `@magic-chess/sdk`
4. **Landing page separate from app** — Expensee has `landingpage/` as separate Next.js app
5. **Demo video + clean README** — Every winner has both

---

## 3. Design Decisions

### Landing Page: YES

**Recommendation: Landing page with "Enter Arena" CTA.**

Rationale:
- Separates marketing/onboarding from gameplay
- Shows project credibility (specs, MagicBlock integration, security, token model)
- Single clear CTA repeated — "Enter Arena" or "Play Now"
- Hero section with animated chess board (non-interactive, ambient)
- Trust signals: audit score (94/100), test count (205), MagicBlock partnership

Landing page sections:
```
Hero (animated board + "Enter Arena" CTA)
  ↓
How It Works (3 steps: Create Match → Play Gasless → Win Tokens)
  ↓
Why MagicBlock (gasless, 50ms moves, 4 wallet confirms total)
  ↓
Game Modes (Blitz, Standard, Friendly — with visual cards)
  ↓
Token Flow (visual diagram of escrow → gameplay → settlement)
  ↓
Security (PDA escrow, 205 tests, 94/100 audit score)
  ↓
Footer (links, social, "Enter Arena" CTA again)
```

### Mood & Style Direction

**"Digital Arena" — dark, premium, competitive but inviting.**

- **Base:** Deep charcoal/near-black (`#0a0a0f` to `#14141f`)
- **Accent:** Electric emerald (`#00e676`) — fresh, not the cliché purple
- **Secondary:** Warm amber (`#ffab00`) — for captures, warnings, clock urgency
- **Surfaces:** Subtle glass morphism on cards, 1px borders with low opacity
- **Typography:** JetBrains Mono for moves/notation, Space Grotesk for headings, DM Sans for body
- **Board:** Dark squares `#1a1a2e`, light squares `#2d2d44` — distinct from chess.com green, lichess brown
- **Pieces:** Custom SVG set with slight neon-edge glow on selection
- **Animations:** Framer Motion — staggered reveals on landing, smooth piece transitions in-game

**Why not chess.com green, lichess brown, or the overused purple gradient:**
- Green = chess.com clone. Brown = lichess clone. Purple = AI slop.
- Emerald + charcoal = distinctive, fresh, still feels premium and competitive.

### App Structure

```
/               → Landing page (public, no wallet needed)
/arena          → Lobby (match list, create/join, live games)
/play/[matchId] → Game view (board, clock, moves, chat)
/play/[matchId]/spectate → Spectator view (read-only board + prediction market)
/profile        → Player stats, ELO, match history
```

### Player UX Flow

```
Landing → Connect Wallet (Privy) → Lobby → Create/Join Match
  → Set Session Key (1 wallet confirm)
  → Play (0 confirms, all gasless)
  → Game ends → Claim winnings (1 wallet confirm)
```

4 wallet confirmations total. This is our key selling point.

### Spectator Features

- **Live board view** — read-only, move-by-move updates
- **Move list** — SAN notation, clickable to jump to position
- **Captured pieces** — displayed on sides
- **Prediction market** — bet on outcome (White/Black/Draw) while watching
- **Evaluation bar** — engine analysis if Stockfish integrated later
- **Share game** — PGN export, link copy

---

## 4. Component Architecture Blueprint

```
frontend/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout (Privy provider, theme)
│   ├── arena/
│   │   ├── page.tsx                # Lobby (match list)
│   │   └── layout.tsx              # Arena layout (header, wallet status)
│   ├── play/
│   │   └── [matchId]/
│   │       ├── page.tsx            # Game view
│   │       └── spectate/
│   │           └── page.tsx        # Spectator view
│   └── profile/
│       └── page.tsx                # Player profile
├── components/
│   ├── landing/
│   │   ├── Hero.tsx                # Animated board + CTA
│   │   ├── HowItWorks.tsx          # 3-step cards
│   │   ├── WhyMagicBlock.tsx       # Feature comparison table
│   │   ├── GameModes.tsx           # Mode cards (Blitz/Standard/Friendly)
│   │   ├── TokenFlow.tsx           # Visual diagram
│   │   └── Security.tsx            # Audit score + test count
│   ├── chess/
│   │   ├── ChessBoard.tsx          # react-chessboard wrapper
│   │   ├── ChessClock.tsx          # Dual clock with urgency states
│   │   ├── MoveList.tsx            # SAN notation, scrollable, clickable
│   │   ├── CapturedPieces.tsx      # Side display
│   │   ├── PromotionDialog.tsx     # Piece selection modal
│   │   ├── GameStatus.tsx          # Check/Checkmate/Stalemate overlay
│   │   └── BoardControls.tsx       # Flip, resign, draw offer
│   ├── lobby/
│   │   ├── MatchCard.tsx           # Match list item
│   │   ├── CreateMatchForm.tsx     # Token, wager, timeout, mode
│   │   └── LiveGamesFeed.tsx       # Real-time active games
│   ├── prediction/
│   │   ├── PredictionPool.tsx      # Betting pool display
│   │   └── PlaceBetForm.tsx        # Bet on outcome
│   └── shared/
│       ├── WalletButton.tsx        # Privy connect/disconnect
│       ├── TokenDisplay.tsx        # SPL token amount + icon
│       └── TransactionStatus.tsx   # Tx pending/confirmed/failed
├── hooks/
│   ├── useChessMatch.ts           # Match state (Jotai atoms)
│   ├── useChessClock.ts           # Clock tick logic
│   ├── useMagicBlock.ts           # ER connection, delegation
│   ├── useSessionKey.ts           # IndexedDB key management
│   └── useMoveSubmit.ts           # Tx submission + status
├── store/
│   ├── match.ts                   # Jotai atoms for current match
│   ├── lobby.ts                   # Jotai atoms for match list
│   └── wallet.ts                  # Jotai atoms for wallet state
├── lib/
│   ├── chess.ts                   # chess.js wrapper, FEN helpers
│   ├── magicblock.ts              # ER client, delegation helpers
│   ├── tokens.ts                  # SPL token metadata
│   └── sounds.ts                  # Move/capture/game-end audio
└── styles/
    ├── globals.css                # Tailwind + CSS variables
    └── board-themes.ts            # Board color presets
```

---

## 5. Key UI Patterns to Implement

### Move Interaction
- **Primary:** Click-to-move (tap source → tap destination). More precise on mobile.
- **Secondary:** Drag-and-drop (react-chessboard v5 supports both).
- **Premove:** Custom logic — queue premove via `onPieceDrop` return, submit when opponent moves.
- **Move highlighting:** Green dot on valid destination empty squares, green ring on capturable pieces. Red ring on king when in check.

### Clock Display
- Dual clock above/below player names
- Urgency states: normal → warning (< 60s, amber pulse) → critical (< 10s, red pulse + shake)
- Display remaining time + per-move increment

### Game Status Overlay
- Full-screen overlay on game end (not just a toast)
- Animations: checkmate = board flash + piece collapse. Stalemate = gentle fade.
- Clear result text + token distribution summary
- "Claim Winnings" button (triggers settlement tx)

### Spectator View
- Same board, but non-interactive
- Move list synced with board position (click move → jump to that position)
- Prediction pool sidebar if prediction_enabled
- "Currently watching: N" live counter

### Transaction UX
- Every move = transaction to MagicBlock ER
- Show subtle loading state on piece drop (pulse animation, not a spinner)
- Failed move = piece snaps back + error toast
- Successful move = piece slides smoothly + subtle sound

---

## 6. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Board library | `react-chessboard` v5 | Already spec'd. MIT. Clean API. |
| Game logic | `chess.js` | Standard. FEN, PGN, move validation. |
| Framework | Next.js 15 (App Router) | Already spec'd. |
| Styling | Tailwind CSS 4 + shadcn/ui | Consistent with spec. |
| Animation | Framer Motion | Page transitions, piece moves, overlays. |
| State | Jotai | Atomic, simpler than Redux. Spec'd. |
| Auth | Privy | Google/email → embedded wallet. Spec'd. |
| Icons | Lucide React | Already in spec. |
| Sounds | Web Audio API (custom) | Lightweight. No npm dependency needed. |
| Fonts | Space Grotesk + JetBrains Mono + DM Sans | Distinctive, not Inter/Roboto. Google Fonts. |

---

## 7. Animation Specs

### Piece Movement
| Scenario | Duration | Easing |
|----------|----------|--------|
| Short move (1-2 sq) | 200-350ms | `ease-out` |
| Long move (across board) | 500-750ms | `easeInOutQuart` |
| Capture | 300-450ms | `ease-in` + scale down+fade |
| Promotion | 400-500ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) |
| Castling | 400-500ms | `ease-out` (king+rook together) |

### State Highlights
- **Check:** Red radial gradient pulse on king's square, 1.5s loop
- **Last move:** Semi-transparent green/yellow overlay on from+to squares
- **Selected piece:** Blue border glow + legal move dots/rings on destinations
- **Premove:** Dimmed/hollow indicator on destination square

### Page Transitions
- Landing → Arena: Staggered card reveals (50ms delay per card)
- Arena → Game: Board expands from center, side panels slide in
- Game end: Full-screen overlay with result animation

---

## 8. Accessibility (Day 1)

### Keyboard Navigation
| Key | Action |
|-----|--------|
| Tab | Navigate between board and controls |
| Space/Enter | Select piece, confirm destination |
| Arrow keys | Move piece during drag / navigate squares |
| Escape | Cancel selection, close dialogs |
| Left/Right arrows | Navigate move history (when move list focused) |

### Screen Reader
- ARIA labels on all 64 squares: `{piece} on {square}` (e.g., "White king on e1")
- Announce moves: "White pawn e2 to e4"
- Announce game events: "Check", "Checkmate", "Stalemate"
- Live region for move announcements

### Visual
- High-contrast board theme option
- Focus indicators on all interactive elements
- WCAG 2.1 AA minimum for text contrast
- Touch targets ≥ 44×44px on mobile

---

## 9. Sound Design

### Event Sounds (Web Audio API)
| Event | Sound | Character |
|-------|-------|-----------|
| Piece move | Soft click/thud | Low-decibel confirmation |
| Capture | Louder thud + reverb | Emphasis on material change |
| Check | Rising tone/bell | Alert without alarm |
| Checkmate | Rich chord/weighty cue | Dramatic resolution |
| Invalid move | Quick buzz | Negative feedback |
| Clock warning | Ticking (accelerating) | Time pressure signal |

### Implementation
- Web Audio API for <50ms latency
- Base64-encoded WAV files (sub-5KB each) bundled, no network requests
- Mute toggle persisted in localStorage
- Volume control per sound category
- Combine with haptic feedback on mobile (move confirm + error)

---

## 10. Devnet Status & Backend Integration (2026-08-04)

### Deployed Program

| Field | Value |
|-------|-------|
| Program ID | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| Network | Devnet |
| Anchor version | 0.32.1 (TS client) / 1.1.2 (Rust) |
| Deployment slot | 481,100,264+ |

### Working Endpoints

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Base RPC | `https://rpc.magicblock.app/devnet` | Init, join, delegate txns |
| Router API | `https://devnet-router.magicblock.app/` | Resolve ER fqdn |
| ER (Asia) | `https://devnet-as.magicblock.app/` | Moves, session keys on ER |

### Router API Format (CRITICAL)

The router uses **JSON-RPC POST**, not REST GET. Every integration must use:

```typescript
const res = await fetch("https://devnet-router.magicblock.app/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "getDelegationStatus",
    params: [accountPubkey.toBase58()],
  }),
});
const { result } = await res.json();
// result.isDelegated: boolean
// result.fqdn: string (may include https:// prefix)
```

### Instructions Confirmed Working on Devnet

| Instruction | Layer | Status | Notes |
|-------------|-------|--------|-------|
| `initializeMatch` | Base | Working | Creates match PDA + escrow |
| `joinMatch` | Base | Working | Player 2 joins, game becomes Active |
| `delegateMatch` | Base | Working | Sets `is_delegated` + `delegation_uid`, transfers ownership to DELEGGvXp |
| `makeMove` (wallet) | ER | Working | Full move validation + board update |
| `makeMove` (session key) | ER | Working | Signless move via authorized session key |
| `setSessionKey` | ER | Working | Player authorizes a session signer + expiry |
| `revokeSessionKey` | ER | Working | Clears session, reverts to wallet-only auth |
| `claimTimeoutWin` | ER | Working | Manual timeout claim |
| `resignGame` | ER | Working | Player resigns |
| `processMatchSettlement` | Base | Working | Escrow payout after game ends |

### delegateMatch Account Resolution

Anchor TS cannot auto-resolve cross-program PDAs for `delegateMatch`. Use this pattern:

```typescript
const [bufferChessMatch] = PublicKey.findProgramAddressSync(
  [Buffer.from("buffer"), chessMatchPda.toBuffer()],
  program.programId
);
const [delegationRecord] = PublicKey.findProgramAddressSync(
  [Buffer.from("delegation"), chessMatchPda.toBuffer()],
  DELEGATION_PROGRAM_ID
);
const [delegationMetadata] = PublicKey.findProgramAddressSync(
  [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()],
  DELEGATION_PROGRAM_ID
);

await program.methods.delegateMatch().accountsStrict({
  payer, chessMatch: chessMatchPda,
  bufferChessMatch, delegationRecordChessMatch: delegationRecord,
  delegationMetadataChessMatch: delegationMetadata,
  ownerProgram: program.programId,
  delegationProgram: DELEGATION_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([payer]).rpc();
```

### Session Key Flow for Gasless Moves

```
1. Wallet generates a session Keypair (client-side, stored in IndexedDB)
2. Wallet calls setSessionKey(sessionKey.publicKey, expiresAt) on ER
   └─ Signed by the player's wallet (1 tx)
3. All subsequent makeMove txs are signed by the session Keypair
   └─ No wallet popups, no gas fees (ER is gasless)
4. Session expires or player calls revokeSessionKey()
   └─ Signed by the player's wallet (1 tx)
```

The session key needs NO SOL on the ER. The ER processes transactions gasless for delegated accounts. The authorization is enforced by the program:
- `session_signer != Pubkey::default()` (session must be set)
- `signer == session_signer` (must match the authorized key)
- `now < session_expires_at` (must not be expired)

### Known Limitation: Task Scheduler CPI

The `makeMove` handler previously tried to CPI to `Magic11111111111111111111111111111111111111` (Task Scheduler) for auto-timeout-claim scheduling. This program does not exist on the current ER instance, causing a fatal instruction error.

**Fix applied (deployed):** The Task Scheduler CPI is disabled. Manual timeout enforcement works through the existing timeout check in `makeMove` (lines 69-87 in `make_move.rs`) — on every move, the handler checks if the opponent has timed out. Players can also call `claimTimeoutWin` manually.

This means **everything works** for gameplay. The only missing feature is automatic timeout claiming via crank, which can be re-enabled when MagicBlock deploys the Task Scheduler to the ER.

### ER Transaction Construction

```typescript
// On the ER, use erConnection (NOT baseConnection) for:
// - makeMove
// - setSessionKey / revokeSessionKey
// - claimTimeoutWin / resignGame

const erProvider = new anchor.AnchorProvider(
  erConnection,
  new anchor.Wallet(signerKeypair), // wallet or session key
  { commitment: "confirmed" }
);
const erProgram = new anchor.Program(idl, erProvider);

// makeMove: only 2 accounts needed (magic_program auto-resolved from IDL)
await erProgram.methods
  .makeMove({ fromRow, fromCol, toRow, toCol, promotion })
  .accounts({
    chessMatch: chessMatchPda,
    player: signerKeypair.publicKey,
  })
  .signers([signerKeypair])
  .rpc();
```

### Key Program Addresses

| Program | Address |
|---------|---------|
| Magic Chess | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| Delegation | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Task Scheduler | `Magic11111111111111111111111111111111111111` |
| Magic Context | `MagicContext1111111111111111111111111111111` |
| Session Keys | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |

### PDA Seeds

```typescript
const CHESS_MATCH_SEED = Buffer.from("chess_match");
const MATCH_ESCROW_SEED = Buffer.from("match_escrow");

const [chessMatchPda] = PublicKey.findProgramAddressSync(
  [CHESS_MATCH_SEED, Buffer.from(matchId)],
  programId
);
const [escrowPda] = PublicKey.findProgramAddressSync(
  [MATCH_ESCROW_SEED, Buffer.from(matchId)],
  programId
);
```

### SPL Token Setup (Devnet)

For wagering, use a devnet SPL mint. In tests we create a fresh mint per match. In production, use a stable devnet USDC mint or the project's own token:

```typescript
import { createMint, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

const mint = await createMint(connection, payer, payer.publicKey, null, 6);
const ata = (await getOrCreateAssociatedTokenAccount(connection, payer, mint, playerPubkey)).address;
await mintTo(connection, payer, mint, ata, payer.publicKey, amount);
```

---

## 11. UI/UX Audit — Senior Design Review

### What's Built (Solid Foundation)

The frontend scaffold is strong. Landing page sections, arena/lobby with filtering, chess components, Jotai state management, Framer Motion animations — all present and well-structured.

**Landing page** (`/`): Clean hero with "Enter Arena" CTA. Sections flow naturally: Hero → HowItWorks → GameModes → WhyMagicBlock → Security. The emerald-on-charcoal color scheme is distinctive. Good trust signals (test count, audit score, MagicBlock integration).

**Arena/Lobby** (`/arena`): Filterable match list with status badges, wager filters, time control filters. Match cards show players, wager, time control, and "Gasless ER" tag. Create match form modal. Clean glass-card aesthetic.

**Chess Components**: All 8 chess-specific components are built and well-designed:
- `ChessBoard` — react-chessboard wrapper with move highlighting, check detection, drag+click
- `ChessClock` — dual clock with urgency states (amber pulse <60s, red pulse <10s)
- `MoveList` — paired notation, auto-scroll, PGN/FEN copy
- `GameStatus` — full-screen overlay with spring animation, result + payout display
- `CapturedPieces`, `BoardControls`, `PromotionDialog`, `PlayerCard` — all scaffolded

### What's Missing (Critical Path for Playable Chess)

#### 1. `/play/[matchId]` Page — THE GAME VIEW

This is the single most important page and it does not exist yet. Without it, users can browse matches but cannot play. This page must compose:
- `ChessBoard` (center, responsive)
- `ChessClock` (top or sides, dual display)
- `MoveList` (right sidebar, scrollable)
- `PlayerCard` × 2 (top, showing player identity + captured pieces)
- `GameStatus` overlay (on game end)
- `BoardControls` (flip board, resign, draw offer)
- `PromotionDialog` (modal on pawn promotion)

**Recommended layout:**
```
┌─────────────────────────────────────────────────────┐
│  [PlayerCard: Black]  │  [ChessClock: Black time]   │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│                          │                          │
│     ChessBoard           │     MoveList             │
│     (responsive,         │     (scrollable,         │
│      click-to-move)      │      paired notation)    │
│                          │                          │
│                          │  [CapturedPieces]        │
│                          │  [BoardControls]         │
├──────────────────────────┴──────────────────────────┤
│  [PlayerCard: White]  │  [ChessClock: White time]   │
└─────────────────────────────────────────────────────┘
```

Mobile: stack vertically — clocks on top, board center, move list collapsible below.

#### 2. Session Key Flow in Match UI

When a player enters a match, they should see a session setup prompt:
- "Enable gasless moves?" toggle/dialog
- If yes: generate session key → IndexedDB → call `setSessionKey` → 1 wallet confirm
- Show "Gasless mode active" indicator (green dot + "Gasless" badge)
- On match end or disconnect: offer to revoke session

The session key must be persisted in IndexedDB (not localStorage) for security. The `useSessionKey` hook (not yet built) should handle: generate, store, load, revoke, expire.

#### 3. Real-Time Board Sync

The current `useChessMatch` hook manages local chess.js state but doesn't sync with on-chain state. For a delegated match on the ER:
- On mount: fetch chess_match account from ER → hydrate FEN + moves
- On opponent move: poll ER or use WebSocket to detect state changes
- After own move: send tx to ER → confirm → update local state
- Loading state: show skeleton board while fetching

#### 4. Wallet Integration

Privy is configured (`.env.local` has app ID) but not wired into the UI flow:
- Landing: "Enter Arena" should trigger wallet connect if not connected
- Arena: show wallet status in header (done in `WalletButton`)
- Match creation: requires connected wallet with token balance
- Joining: requires wallet + sufficient token balance for wager
- Playing: wallet connected for session setup, then session key takes over

#### 5. Transaction Feedback Loop

Every on-chain action needs clear UX:
- **Pending**: Subtle pulse animation on the piece/submit button (not a blocking spinner)
- **Confirmed**: Piece slides smoothly, move appears in list, clock switches
- **Failed**: Piece snaps back, error toast with retry option
- **Timeout/Network**: Graceful degradation — show "Reconnecting..." banner

#### 6. Match Lifecycle States the UI Must Handle

```
WaitingForOpponent → Show "Waiting for opponent..." with copy-link button
Active (your turn) → Highlight your clock, enable piece interaction
Active (their turn) → Disable interaction, show "Opponent's turn"
WhiteWins / BlackWins / Draw → Show GameStatus overlay with payout summary
```

#### 7. Empty States

- Lobby with no matches: "No matches found. Create one?"
- No moves yet: "Game starts when White makes the first move"
- Wallet not connected: "Connect wallet to play"
- No session key: Prompt to enable gasless mode

### Design Polish Needed

| Issue | Severity | Fix |
|-------|----------|-----|
| No `/play/[matchId]` page | **Critical** | Build immediately — this is the core product |
| Mock data in lobby (`MOCK_MATCHES`) | **High** | Wire to SDK `getMatches()` or on-chain account fetch |
| `useMagicBlock` returns mock tx sigs | **High** | Wire to real `submitMoveTx` from `lib/magicblock.ts` |
| Hardcoded payout text in `GameStatus` | **Medium** | Read actual pot from on-chain match state |
| No session key UI | **High** | Build `useSessionKey` hook + setup dialog |
| No loading skeletons | **Medium** | Add skeleton components for board, move list, match cards |
| No error boundaries per section | **Medium** | Wrap board, lobby, and clock in error boundaries |
| No mobile-responsive board sizing | **High** | `boardWidth` should be dynamic based on viewport |
| Clock not connected to on-chain time | **High** | Read `last_move_timestamp` + `move_timeout_duration` from chain |
| Sound library exists but not wired | **Low** | Wire `lib/sounds.ts` to move/capture/check events |
| No PWA manifest/service worker | **Low** | Add for mobile installability |

### Recommended Build Order (Frontend)

```
1. /play/[matchId] page — compose chess components into game view
2. Wire useMagicBlock to real SDK (remove mocks)
3. Wallet connect flow (Privy) in Hero → Arena → Match
4. Session key setup UI + IndexedDB persistence
5. Real-time board sync (fetch from ER + poll/subscribe)
6. Error handling + loading states + empty states
7. Mobile responsiveness + touch optimization
8. Sound effects + PWA
9. Spectator view (/play/[matchId]/spectate)
10. Prediction market UI
```

### Verdict

The frontend has excellent bones — landing page, arena, chess components, state management, and animations are all production-quality. The critical missing piece is the game view page (`/play/[matchId]`) that ties everything together. Once that page exists with real SDK integration (not mocks), the app becomes playable. The session key flow will give it the "gasless" MagicBlock advantage. Ship the game view first, polish second.

---

## 12. References

### Open Source Chess Frontends
- [react-chessboard v5 (Clariity)](https://github.com/Clariity/react-chessboard) — Board component we're using
- [react-chessboard v4 (juniperab)](https://github.com/juniperab/react-chessboard) — Premove API reference
- [@xanderwaugh/chess-board](https://www.npmjs.com/package/@xanderwaugh/chess-board) — Full-package architecture reference
- [@bezalel6/react-chessground](https://www.npmjs.com/package/@bezalel6/react-chessground) — Lichess board wrapper, premove UX reference
- [responsive-chessboard](https://github.com/ChrisColeTech/responsive-chessboard) — Responsive sizing patterns

### MagicBlock Winners
- [TaskForest](https://x.com/task_forest) — 1st place, sub-50ms ER bids
- [MagicBlock On-Chain Chess Tutorial](https://docs.magicblock.gg/onchain_chess/on-chain-chess) — Official Unity chess tutorial
- [yield-wars-magicblock](https://github.com/compute-labs-dev/yield-wars-magicblock) — ER game reference implementation

### UI/UX Inspiration
- [ICC Rebrand by Morillas](https://morillas.com/work/icc/) — Chess platform visual identity
- [World Chess "The Tower"](https://www.advfn.com/stock-market/london/CHSS/stock-news/96550279/world-chess-plc-world-chess-unveils-the-tower) — Progression UX innovation
- [PlayChess Landing Page](https://contra.com/p/O7WUqU6o-play-chess-landing-page) — Landing page design process

### MagicBlock Technical
- [MagicBlock Documentation](https://docs.magicblock.gg)
- [Delegation Program](https://explorer.solana.com/address/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)
- [Ephemeral Rollup Endpoints](https://docs.magicblock.gg/endpoints)

---

## 8. Next Steps

1. **Initialize Next.js 15 project** in `frontend/` with Tailwind CSS 4, shadcn/ui, Jotai, react-chessboard
2. **Build landing page first** — sets visual language for entire app. Hero with ambient chess board animation.
3. **Implement Privy auth** + wallet connection flow
4. **Build lobby** — match creation, join, live game list
5. **Build game view** — board, clock, move list, game status overlay
6. **Build spectator view** — read-only board + prediction pool
7. **Integrate MagicBlock ER** — delegation, session keys, move submission
8. **Polish** — sounds, animations, mobile responsiveness, PWA
