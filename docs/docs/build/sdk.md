# TypeScript SDK

`@magic-chess/sdk` is the TypeScript client for the Magic Chess program. The ZUG Arena frontend uses it for everything on-chain. It includes:

- `MagicChessClient`, a typed wrapper around the Anchor program that routes each call to the base layer or the Ephemeral Rollup
- React hooks
- PDA, FEN, wager and MagicBlock helpers
- the program IDL and types

:::note
The SDK is not on npm yet. Use it from the monorepo (`"@magic-chess/sdk": "file:../sdk"`) or copy `sdk/` into your project. It ships TypeScript source (`main: src/index.ts`), so your bundler compiles it.
:::

## Install

Peer dependencies:

```bash
npm install @anchor-lang/core @solana/web3.js@1 @solana/spl-token
# React hooks only:
npm install react react-dom
```

`@magicblock-labs/ephemeral-rollups-kit` is a direct dependency, so it installs with the SDK.

## Quick start

```typescript
import { AnchorProvider, Program } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { MagicChessClient, MAGIC_CHESS_IDL, type MagicChess } from "@magic-chess/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program<MagicChess>(MAGIC_CHESS_IDL, provider);

const client = new MagicChessClient(program, wallet);

// White creates a 3-minute-per-move match
await client.createMatch({
  matchId: "match-001",
  betAmount: 10_000_000n,          // raw token units; 0 = free match
  moveTimeoutDuration: 180,
  platformFeeBasisPoints: 100,     // 1%
  platformFeeWallet: feeWallet,
  bettingTokenMint: mint,
  playerTokenAccount: whiteAta,
});

// Black joins (the SDK reads the wager from chain)
await client.joinMatch({ matchId: "match-001", playerTokenAccount: blackAta });

// Move the match to the Ephemeral Rollup, then play e2-e4
await client.delegateMatch("match-001");
const { result } = await client.makeMove("match-001", { fromRow: 1, fromCol: 4, toRow: 3, toCol: 4 });

// After the game ends: bring state back to L1 and pay out
await client.undelegateMatch("match-001");
await client.settleMatch("match-001", whiteAta, blackAta, feeAta);
```

`wallet` is any `MagicChessWallet`: an object with `publicKey`, `signTransaction` and `signAllTransactions`. Anchor wallets, wallet-adapter wallets and Privy Solana wallets all fit.

## `MagicChessClient`

```typescript
new MagicChessClient(
  program: Program<MagicChess>,
  wallet?: MagicChessWallet,
  options?: { routerEndpoint?: string } // defaults to MAGICBLOCK_DEVNET_ROUTER
)
```

The client needs a wallet only for methods that sign. Reads work without one.

**Routing.** Calls that act on gameplay state (`makeMove`, `resign`, `claimTimeout`, `setSessionKey`, `subscribeToMatch`) first look up where the match account lives. If the delegation program owns it on L1, the client asks the MagicBlock router for the rollup's endpoint and sends there. Otherwise it sends to the base connection. Calls that move tokens (`createMatch`, `joinMatch`, `abortMatch`, `settleMatch`, prediction methods) refuse to run while the match is delegated.

### Match lifecycle

| Method | Runs on | Returns |
|--------|---------|---------|
| `createMatch(params: CreateMatchParams)` | L1 | `{ match, signature }` |
| `joinMatch({ matchId, playerTokenAccount, betAmount? })` | L1 | `{ signature }` |
| `abortMatch(matchId, playerTokenAccount, extras?)` | L1 | `{ signature }`: creator cancels an unjoined match and gets the wager back |
| `delegateMatch(matchId, rentPayer?)` | L1 | `{ signature, ephemeralRpcEndpoint }` |
| `commitState(matchId)` | ER | `{ signature, baseCommitmentSignature, rpcEndpoint }` |
| `undelegateMatch(matchId)` | ER | `{ signature, baseCommitmentSignature, rpcEndpoint }` |
| `settleMatch(matchId, playerOneAta, playerTwoAta, platformFeeAta, options?)` | L1 | `{ signature }`. Anyone can call it once the game is over. `options.rentRecipient` receives the closed escrow's rent. |

`CreateMatchParams`:

| Field | Type | Notes |
|-------|------|-------|
| `matchId` | `string` | Unique, at most 32 bytes |
| `betAmount` | `IntegerInput` | Raw units per player; `0` makes a free match |
| `moveTimeoutDuration` | `IntegerInput` | Seconds per move |
| `platformFeeBasisPoints` | `number` | 0–10000 |
| `platformFeeWallet` | `PublicKey` | Owner of the fee token account |
| `bettingTokenMint` | `PublicKey` | SPL mint for the wager |
| `playerTokenAccount` | `PublicKey` | Creator's token account for that mint |
| `rentPayer?` | `PublicKey` | Pays account rent (used for gas sponsorship) |
| `preInstructions?` / `postInstructions?` | `TransactionInstruction[]` | Run in the same transaction, e.g. create the ATA first or `set_session_key` after |
| `signers?` | `Signer[]` | Extra signers |
| `predictionEnabled?` | `boolean` | Opens a spectator prediction pool; defaults to `false` |

`IntegerInput` is `number | bigint | BN`.

### Gameplay

| Method | Returns |
|--------|---------|
| `makeMove(matchId, move, session?)` | `{ result: MoveResult, signature, rpcEndpoint }` |
| `resign(matchId)` | `{ signature, rpcEndpoint }`. The wallet must sign; a session key can't resign. |
| `claimTimeout(matchId)` | `{ signature, rpcEndpoint }`. The wallet must sign. |

`Move` uses 0-indexed coordinates: row 0 is rank 1 and column 0 is the a-file. Set `promotion?: PieceType` to promote to something other than a queen.

`MoveResult` is one of `normal`, `checkmate`, `stalemate`, `threefoldRepetition`, `insufficientMaterial` or `fiftyMoveRule`.

### Session keys (moves without wallet popups)

Session keys only work on a delegated match.

```typescript
import { Keypair } from "@solana/web3.js";

const sessionSigner = Keypair.generate();
const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

// Either send it on its own…
await client.setSessionKey(matchId, sessionSigner.publicKey, expiresAt);
// …or add it to create/join so the player approves once:
const ix = await client.buildSetSessionKeyInstruction(matchId, sessionSigner.publicKey, expiresAt);
await client.createMatch({ ...params, postInstructions: [ix] });

// Moves signed by the session key
await client.makeMove(matchId, move, { signer: sessionSigner, expiresAt });
```

To use a gum `SessionTokenV2` instead of the program's own session key, pass `token` in the session object.

### Reads

| Method | Returns |
|--------|---------|
| `getMatch(matchId)` | `ChessMatch \| null`, read from wherever the match currently lives |
| `getMatchWager(matchId)` | `WagerInfo \| null`: mint, decimals, raw amounts, display strings and `isFree` |
| `listJoinableMatches({ mint? })` | `MatchInfo[]` waiting for an opponent |
| `getPlayerMatches(player)` | `MatchInfo[]` where the player is White or Black |
| `subscribeToMatch(matchId, onUpdate)` | An unsubscribe function. Delegated matches stream from the rollup. |

### Prediction pool

| Method | Notes |
|--------|-------|
| `initializePredictionPool(matchId, platformFeeBps)` | Only for matches created with `predictionEnabled` |
| `placePredictionBet(matchId, outcome, amount, bettorTokenAccount)` | `outcome`: 0 = White, 1 = Black, 2 = Draw |
| `cancelPredictionBet(matchId, bettorTokenAccount)` | Refund before the opponent joins, after an abort, or when nobody backed the actual result |
| `claimPredictionWinnings(matchId, bettorTokenAccount)` | After the pool settles |

See [Prediction market](../features/prediction-market.md) for the payout math.

## React hooks

Import them from `@magic-chess/sdk/react`.

```tsx
import { MagicChessProvider, useMatch } from "@magic-chess/sdk/react";

<MagicChessProvider program={program} wallet={wallet}>
  <Game id="match-001" />
</MagicChessProvider>;

function Game({ id }: { id: string }) {
  const { match, loading, error, refetch } = useMatch(id);
  // …
}
```

| Hook | Returns |
|------|---------|
| `useMagicChessClient(program?, wallet?, routerEndpoint?)` | The provider's client, or a new one |
| `useMatch(matchId \| null)` | `{ match, loading, error, refetch }` |
| `useMatches({ mint? })` | Joinable matches with `loading`, `error` and `refetch` |
| `usePlayerMatches(player \| null)` | The player's matches with `loading`, `error` and `refetch` |

## Helpers

```typescript
import {
  findChessMatchPda, findMatchEscrowPda, findPredictionPoolPda,
  boardToFen, fenToBoard,
  formatRawTokenAmount, isFreeWager,
  getDelegationStatus, resolveAccountRuntime, waitForDelegation, waitForUndelegation,
  MAGICBLOCK_DEVNET_ROUTER, MAGICBLOCK_DEVNET_RPC, DELEGATION_PROGRAM_ID,
} from "@magic-chess/sdk";

const [matchPda] = findChessMatchPda("match-001", program.programId);
const fen = boardToFen(board, "white", castlingRights, null, 0, 1);
formatRawTokenAmount(10_000_000n, 9); // "0.01"
const status = await getDelegationStatus(matchPda); // asks the router; returns isDelegated and the ER FQDN
```

## Keeping the IDL in sync

After you change the program, rebuild it and copy the IDL into the SDK:

```bash
cd magic-chess-program && anchor build
cd ../sdk && npm run sync-idl && npm run typecheck
```
