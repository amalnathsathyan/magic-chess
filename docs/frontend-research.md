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

## 10. References

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
