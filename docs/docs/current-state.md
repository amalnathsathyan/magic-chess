# Magic Chess — Current State & Handoff

> Updated 2026-08-04. For the next agent picking up frontend work.
> This doc is grounded in the actual codebase as of the date above.
> Read it once. Know what to wire, what to keep, and what patterns to follow.

## Program Status: Deployed on Devnet

| Field | Value |
|-------|-------|
| Program ID | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| Anchor | 1.1.2 (Rust), 0.32.1 (TS client) |
| Instructions | 22 (full match lifecycle + MagicBlock + prediction market stubs) |
| Tests | 205 (182 unit + 23 LiteSVM + 8 CU + 12 Anchor TS) |
| Base RPC | `https://rpc.magicblock.app/devnet` |
| Router API | `https://devnet-router.magicblock.app/` (JSON-RPC POST) |
| ER | `https://devnet-as.magicblock.app/` (resolved dynamically via router) |

## What Works on Devnet (Proven Patterns)

| Instruction | Layer | Method |
|-------------|-------|--------|
| `initializeMatch` | Base RPC | `program.methods.initializeMatch(...)` |
| `joinMatch` | Base RPC | `program.methods.joinMatch(...)` |
| `delegateMatch` | Base RPC | `program.methods.delegateMatch()` with `.accountsStrict()` + manual PDAs |
| `makeMove` (wallet signer) | ER | `erProgram.methods.makeMove(...)` |
| `makeMove` (session key) | ER | Same, but signed by session Keypair after `setSessionKey` |
| `setSessionKey` | ER | `erProgram.methods.setSessionKey(pubkey, expiresAt)` |
| `revokeSessionKey` | ER | `erProgram.methods.revokeSessionKey()` |
| `claimTimeoutWin` | ER | Manual timeout claim |
| `processMatchSettlement` | Base RPC | Escrow payout |

---

## The `/play/[matchId]` Page EXISTS — With Gaps

**File:** `frontend/app/play/[matchId]/page.tsx` (362 lines)

It composes all 8 chess components into a playable game view. The page is structurally complete but uses mock/placeholder data for on-chain integration.

### What the page actually does

**Component composition:**
- **Header:** Back-to-Arena link, Match ID display, Spectate link, TransactionStatus
- **Left column:** PlayerCard (black) + ChessClock + CapturedPieces (white) + ChessBoard + PromotionDialog + BoardControls + CapturedPieces (black) + PlayerCard (white)
- **Right column:** MoveList with PGN/FEN copy buttons

**Game logic:** All local via `chess.js`. Validates moves client-side, handles promotion, calculates captured pieces, determines game result (checkmate/stalemate/draw). All standard FIDE rules enforced locally.

**SDK integration (try-catch pattern):**
```typescript
// From play/[matchId]/page.tsx, lines 35-43
let client: any = null;
let matchContext: any = { match: null, loading: false, refetch: async () => {} };

try {
  client = useMagicChessClient();
  matchContext = useMatch(matchId);
} catch (e) {
  // Graceful fallback when no provider
}

// Event subscription, lines 63-79
try {
  unsubscribeEvents = useMatchEvents(matchId, {
    onMoveMade: (event: any) => { /* update FEN + moves from chain */ },
    onGameEnded: (event: any) => { /* show toast, play sound */ }
  });
} catch (e) {}
```

### What's mock vs real

| Aspect | Status | Detail |
|--------|--------|--------|
| Chess board rendering | **REAL** | react-chessboard v5, handles drag-drop + click-to-move, highlights |
| Move validation | **REAL** | chess.js validates all moves client-side (promotion, castling, en passant) |
| Piece movement | **REAL** | Optimistic update to local FEN on every move |
| Sound effects | **REAL** | `lib/sounds.ts` plays move/game-end sounds |
| Move list | **REAL** | `MoveList` renders moves in paired rows with PGN/FEN copy |
| Captured pieces | **REAL** | Calculated from board state diff against starting position |
| Game over detection | **REAL** | chess.js detects checkmate/stalemate/draw, shows GameStatus modal |
| Promotion dialog | **REAL** | Prompts piece selection when pawn reaches last rank |
| `client.makeMove` calls | **COMMENTED OUT** | Lines 133-135 and 172-174: `// e.g. client.makeMove({ matchId, move: ... })` |
| Clock state | **MOCK** | `useState(300_000)` hardcoded 5 minutes, never ticks |
| Tx status | **MOCK** | `useState<"idle">("idle")` hardcoded |
| Player addresses | **MOCK** | `"8xTk...9aF1"` and `"7xYk...2bR9"` are hardcoded strings |
| Board orientation | **STATIC** | Always `"white"`, flip button is a no-op |
| BoardControls actions | **NO-OP** | onFlipBoard, onOfferDraw, onResign are all `() => {}` |
| SDK hooks | **TRY-CATCH** | Imported but wrapped in try-catch, so page renders without SDK context |
| On-chain state sync | **NONE** | `useEffect` for match sync (line 54-60) is an empty body with comment |

### Spectate page

**File:** `frontend/app/play/[matchId]/spectate/page.tsx` (120 lines)

Same mock pattern. Read-only board (draggable=false), mock clock, mock watcher count. Uses chess.js locally. No on-chain connection.

---

## Frontend File Map (Comprehensive)

```
frontend/
├── app/
│   ├── layout.tsx                          (70 lines)   Root layout + Providers
│   ├── page.tsx                            (17 lines)   Landing page
│   ├── not-found.tsx                       (3 lines)    404
│   ├── error.tsx                           (4 lines)    Error boundary
│   ├── arena/
│   │   ├── layout.tsx                      (48 lines)   Arena layout wrapper
│   │   └── page.tsx                        (252 lines)  Lobby ⚠️ MOCK_MATCHES array
│   ├── play/[matchId]/
│   │   ├── page.tsx                        (362 lines)  Game view ⚠️ mock clock/tx/players
│   │   └── spectate/page.tsx               (120 lines)  Spectator view ⚠️ all mock
│   └── profile/page.tsx                    (203 lines)  Player profile
│
├── components/
│   ├── chess/                              8 components, all real ✅
│   │   ├── ChessBoard.tsx                  (215 lines)  react-chessboard v5 wrapper
│   │   ├── MoveList.tsx                    (148 lines)  Paired move rows, PGN/FEN copy
│   │   ├── GameStatus.tsx                  (100 lines)  Game-over modal with animation
│   │   ├── ChessClock.tsx                  (77 lines)   Dual clock display, urgency colors
│   │   ├── CapturedPieces.tsx              (85 lines)   Captured piece chips
│   │   ├── PlayerCard.tsx                  (62 lines)   Player info + active indicator
│   │   ├── BoardControls.tsx               (77 lines)   Flip, Draw, Resign buttons
│   │   └── PromotionDialog.tsx             (68 lines)   Piece selection modal
│   ├── landing/                            4 components, all real ✅
│   │   ├── Hero.tsx                        (158 lines)
│   │   ├── HowItWorks.tsx                  (75 lines)
│   │   ├── GameModes.tsx                   (97 lines)
│   │   ├── Security.tsx                    (93 lines)
│   │   └── WhyMagicBlock.tsx               (83 lines)
│   ├── lobby/                              2 components, real but mock-powered ⚠️
│   │   ├── MatchCard.tsx                   (125 lines)  Match display card
│   │   └── CreateMatchForm.tsx             (255 lines)  Match creation form
│   └── shared/                             4 components
│       ├── Providers.tsx                   (56 lines)   Privy + SolanaProgramProvider
│       ├── SolanaProgramProvider.tsx        (200 lines)  Anchor Program wiring (manual IDL)
│       ├── WalletButton.tsx                (102 lines)  Privy wallet connect/disconnect
│       ├── TransactionStatus.tsx           (83 lines)   Tx state indicator
│       └── Header.tsx                      (61 lines)   Nav bar
│
├── hooks/                                  4 hooks
│   ├── useChessMatch.ts                    (87 lines)   Local chess.js engine ONLY
│   ├── useChessClock.ts                    (109 lines)  Real clock tick logic (interval-based)
│   ├── useMagicBlock.ts                    (85 lines)   ER session + move submission ⚠️ fallback
│   └── useMoveSubmit.ts                    (80 lines)   Wraps useMagicBlock + toast
│
├── lib/                                    4 utility modules
│   ├── magicblock.ts                       (123 lines)  REAL ER delegation + move submission
│   ├── sounds.ts                           (152 lines)  Sound effects (move, capture, game end)
│   ├── chess.ts                            (62 lines)   Board helpers
│   └── utils.ts                            (7 lines)    cn() re-export
│
└── store/                                  3 Jotai modules
    ├── match.ts                            (66 lines)   FEN, moves, status atoms
    ├── lobby.ts                            (78 lines)   ⚠️ "TODO: Fetch matches from SDK"
    └── wallet.ts                           (36 lines)   Connection, balance, tx status atoms
```

**Key to annotations:**
- ✅ = Fully functional
- ⚠️ = Works but uses mock data or has missing wiring
- Mock-powered = Renders correctly but data is hardcoded

---

## Integration Patterns That Work (Copy These)

### 1. Router API — Check Delegation Status

This is in `sdk/src/magicblock.ts` and used by `frontend/lib/magicblock.ts`. It is proven on devnet.

```typescript
// From sdk/src/magicblock.ts, lines 50-73
export async function getDelegationStatus(
  account: PublicKey
): Promise<DelegationStatus> {
  const response = await fetch(MAGICBLOCK_DEVNET_ROUTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch delegation status: ${response.status} ${response.statusText}`
    );
  }

  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result as DelegationStatus;
}
```

Key details:
- Method: `POST`, not GET
- Content-Type: `application/json`
- JSON-RPC 2.0 format
- `params` is an array of base58 strings
- Result shape: `{ isDelegated: boolean, fqdn?: string }`
- The `fqdn` may or may not include `https://` -- strip/ensure as needed

### 2. ER Connection from FQDN

```typescript
// From sdk/src/magicblock.ts, lines 84-88
export function getERConnection(fqdn: string): Connection {
  // Router may return fqdn with or without https:// prefix
  const erUrl = fqdn.startsWith("https://") ? fqdn : `https://${fqdn}`;
  return new Connection(erUrl);
}
```

### 3. Submit Move to ER (Full Flow)

This is in `frontend/lib/magicblock.ts`. It is the canonical pattern for move submission.

```typescript
// From frontend/lib/magicblock.ts, lines 47-113
export async function submitMoveTx(
  client: MagicChessClient,
  matchId: string,
  from: string,
  to: string,
  promotion?: string
): Promise<string> {
  const fromCol = from.charCodeAt(0) - 97;
  const fromRow = parseInt(from[1]) - 1;
  const toCol = to.charCodeAt(0) - 97;
  const toRow = parseInt(to[1]) - 1;

  const move = {
    fromRow,
    fromCol,
    toRow,
    toCol,
    promotion: promotion ? (promotion as any) : undefined,
  };

  const [chessMatchPda] = findChessMatchPda(matchId, client.programId);

  let isDelegated = false;
  let erFqdn = "";
  try {
    const status = await getDelegationStatus(chessMatchPda);
    if (status.isDelegated) {
      isDelegated = true;
      erFqdn = status.fqdn || "";
    }
  } catch (err) {
    console.warn("Failed to check delegation status, falling back to base RPC", err);
  }

  if (isDelegated && erFqdn) {
    const erConnection = getERConnection(erFqdn);
    if (!client.wallet) throw new Error("Wallet not connected");

    const ix = await client.program.methods
      .makeMove({
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotion: move.promotion ?? null,
      } as any)
      .accounts({
        chessMatch: chessMatchPda,
        player: client.wallet.publicKey,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = client.wallet.publicKey;

    const { blockhash } = await erConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signedTx = await client.wallet.signTransaction(tx);
    const signature = await erConnection.sendRawTransaction(signedTx.serialize());

    return signature;
  } else {
    const { signature } = await client.makeMove(matchId, move);
    return signature;
  }
}
```

Critical details:
- Converts algebraic square notation (`e2`, `e4`) to row/col (0-7)
- Checks delegation FIRST, then branches: ER vs base RPC
- ER path: manual `Transaction` construction with `.instruction()`, separate `signTransaction` + `sendRawTransaction`
- Base RPC path: falls back to `client.makeMove()` (Anchor `.rpc()`)
- Only 2 accounts needed for ER: `chessMatch` + `player`
- `blockhash` fetched from ER connection, not the base RPC

### 4. delegateMatch Pattern

```typescript
// Must manually derive 3 PDAs + use accountsStrict
const [buffer] = PublicKey.findProgramAddressSync(
  [Buffer.from("buffer"), chessMatchPda.toBuffer()], program.programId
);
const [delRec] = PublicKey.findProgramAddressSync(
  [Buffer.from("delegation"), chessMatchPda.toBuffer()], DELEGATION_PROGRAM_ID
);
const [delMeta] = PublicKey.findProgramAddressSync(
  [Buffer.from("delegation-metadata"), chessMatchPda.toBuffer()], DELEGATION_PROGRAM_ID
);
await program.methods.delegateMatch().accountsStrict({
  payer, chessMatch: chessMatchPda,
  bufferChessMatch: buffer,
  delegationRecordChessMatch: delRec,
  delegationMetadataChessMatch: delMeta,
  ownerProgram: program.programId,
  delegationProgram: DELEGATION_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([payer]).rpc();
```

`DELEGATION_PROGRAM_ID` = `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`

### 5. Session Key Flow

From the test (`magicblock_session_test.ts`), proven on ER:

1. Generate session Keypair client-side, persist in IndexedDB
2. `erProgram.methods.setSessionKey(sessionKey.publicKey, new BN(expiresAt))` -- 1 wallet signature
3. All subsequent moves signed by session Keypair -- 0 wallet popups
4. `erProgram.methods.revokeSessionKey()` on disconnect/game end

### 6. Known Limitation: Task Scheduler

The Task Scheduler CPI (`Magic11111111111111111111111111111111111111`) is disabled -- the program doesn't exist on the current ER. Manual timeout enforcement in `makeMove` still works (checks if opponent timed out on every move). Players can call `claimTimeoutWin` manually.

---

## Gap List (Priority-Ordered)

### Priority 1: Wire the Play Page to On-Chain

**These make the game actually playable on-chain.**

1. **Connect `useChessClock`** to the play page. The hook (`frontend/hooks/useChessClock.ts`, 109 lines) has real tick logic with intervals, increment, pause/resume. The play page currently uses `useState(300_000)` hardcoded values instead.

2. **Wire `client.makeMove`** -- uncomment lines 133-135 and 172-174 in the play page. Replace the `// e.g. client.makeMove(...)` comments with actual calls using `submitMoveTx` from `frontend/lib/magicblock.ts`.

3. **Replace mock player addresses** with actual data from `useMatch(matchId)`. The `match` object from the SDK has `players: [whitePubkey, blackPubkey]`. Pass these to `PlayerCard`.

4. **Wire transaction status** -- replace `useState<"idle">("idle")` with `useMoveSubmit` hook. The hook (`frontend/hooks/useMoveSubmit.ts`) already has full tx lifecycle tracking with toasts.

5. **Sync board state from chain** -- the `useEffect` at line 54-60 needs to parse the on-chain board (from the `ChessMatch.board` array) and convert to FEN via `sdk/utils/fen.ts` (`boardToFen`). Also set `match.turn` to determine whose move it is.

### Priority 2: Lobby/Arena Wiring

1. **Replace `MOCK_MATCHES` array** in `frontend/app/arena/page.tsx` with `useMatches()` SDK hook. The hook is already imported in the SDK (`@magic-chess/sdk/react`).

2. **Wire `CreateMatchForm` submit** to `client.createMatch()`. Currently `onSubmit` just does `console.log`.

3. **Wire `Join` button** on `MatchCard` to `client.joinMatch()`. Route to `/play/[matchId]` after successful join.

4. **Wire `refreshLobbyAtom`** in `frontend/store/lobby.ts` (line 71) -- replace `// TODO: Fetch matches from SDK` with actual SDK call.

### Priority 3: Session Keys

1. **Session key generation UI** -- generate a Keypair, store in IndexedDB (use `idb` or localStorage), show expiry.
2. **Wire `setSessionKey`** before the first move.
3. **Wire `revokeSessionKey`** on game end / disconnect.
4. **Use session Keypair for signing ER moves** instead of wallet (gasless, no popups).

### Priority 4: BoardControls Actions

1. **Flip board** -- toggle orientation state in play page.
2. **Offer draw** -- needs a draw offer protocol (not yet in the program, but could be a social signal for now).
3. **Resign** -- wire `client.resign(matchId)`.

### Priority 5: Misc Polish

1. **Spectate page** -- wire `useMatch` + `useMatchEvents` to sync board from chain (read-only).
2. **Profile page** -- wire `usePlayerMatches` hook.
3. **Mobile responsiveness** -- test touch drag-and-drop on chess board.
4. **PWA manifest** -- already scaffolded, needs service worker.

---

## What NOT to Touch

These files are working and should be treated as reference implementations:

| File | Why |
|------|-----|
| `frontend/lib/magicblock.ts` | Canonical ER move submission. Tested on devnet. |
| `frontend/components/chess/ChessBoard.tsx` | Feature-complete chessboard with highlight, last-move, check indicators |
| `frontend/components/chess/ChessClock.tsx` | Polished clock display with urgency colors (`<10s` pulse, `<60s` amber) |
| `frontend/components/chess/MoveList.tsx` | PGN export, auto-scroll, current-move highlight |
| `frontend/components/chess/GameStatus.tsx` | Animated game-over modal with "Claim Winnings" CTA |
| `frontend/hooks/useChessClock.ts` | Real clock logic. Wire it; do not rewrite it. |
| `frontend/components/shared/SolanaProgramProvider.tsx` | Anchor Program wiring with Privy wallet. Complex but working. |
| `sdk/src/magicblock.ts` | Delegation status check and ER connection factory |
| `sdk/src/client.ts` | Full typed client for all 22 instructions |
| `sdk/src/react/index.tsx` | `useMatch`, `useMatches`, `usePlayerMatches`, `useMatchEvents` |
| `frontend/store/match.ts` | Jotai atoms with `hydrateMatchStateAtom` action ready to receive SDK data |

## SDK React Hooks Available

All from `@magic-chess/sdk/react`:

| Hook | Purpose | Returns |
|------|---------|---------|
| `useMagicChessClient(program?, wallet?)` | Get the SDK client | `MagicChessClient` |
| `useMatch(matchId)` | Fetch single match by ID | `{ match, loading, error, refetch }` |
| `useMatches(filters?)` | List joinable matches | `{ matches, loading, error }` |
| `usePlayerMatches(player)` | List matches for a player | `{ matches, loading, error }` |
| `useMatchEvents(matchId, callbacks)` | Subscribe to move/game-end events | Cleanup function |

**Important:** All hooks require a `MagicChessProvider` ancestor or direct `program + wallet` params. The provider is set up in `SolanaProgramProvider.tsx` which wraps the app layout.

## SDK Client Methods

From `MagicChessClient` (`sdk/src/client.ts`):

| Method | Signature | Layer |
|--------|-----------|-------|
| `createMatch(params)` | `Promise<{ match, signature }>` | Base RPC |
| `joinMatch(params)` | `Promise<{ signature }>` | Base RPC |
| `delegateMatch(matchPda)` | `Promise<{ signature }>` | Base RPC |
| `makeMove(matchId, move)` | `Promise<{ signature, result }>` | Base or ER |
| `resign(matchId)` | `Promise<{ signature }>` | Any |
| `claimTimeout(matchId)` | `Promise<{ signature }>` | Any |
| `settleMatch(matchId)` | `Promise<{ signature }>` | Base RPC |
| `getMatch(matchId)` | `Promise<ChessMatch>` | Read |
| `listJoinableMatches(filters?)` | `Promise<MatchInfo[]>` | Read |
| `getPlayerMatches(player)` | `Promise<MatchInfo[]>` | Read |

## What to Read First

1. **This file** -- you just did
2. **`frontend/lib/magicblock.ts`** -- the integration pattern to follow (real, tested on devnet)
3. **`frontend/app/play/[matchId]/page.tsx`** -- the play page you'll be wiring
4. **`frontend/hooks/useChessClock.ts`** -- the clock hook to wire into the play page
5. **`sdk/src/react/index.tsx`** -- available hooks and their signatures
6. **`magic-chess-program/tests/magicblock_session_test.ts`** -- E2E reference for session keys + ER moves

---

## Quick Start for Development

```bash
cd frontend
npm run dev        # Next.js dev server on port 3000
```

```bash
cd magic-chess-program
cargo test -p magic_chess                    # Unit tests (~0s)
cargo build-sbf --tools-version v1.52        # Build program
anchor deploy --provider.cluster devnet      # Deploy (if program changed)
```

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
```
