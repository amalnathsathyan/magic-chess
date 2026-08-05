# MagicBlock Integration

Magic Chess uses [MagicBlock Ephemeral Rollups](https://magicblock.gg) for gasless, low-latency gameplay. Players delegate match state to an ephemeral rollup validator, play moves with no wallet popups, and commit final state back to Solana L1 when the game concludes.

## What MagicBlock Provides

| Feature | Benefit |
|---------|---------|
| **Gasless transactions** | Players never pay for moves. All ER transactions are free. |
| **~50ms latency** | Near-instant move confirmation vs. ~400ms on L1. |
| **Session keys** | Sign once, play forever. No wallet popups per move. |
| **Auto-settlement** | Crank chain automates timeout claims, payouts, and undelegation. |

## Architecture

```
┌──────────────┐     delegate_match     ┌──────────────────────┐
│  Solana L1   │ ◄───────────────────── │  Base Layer Account  │
│  (Devnet)    │                        │  (chessMatch PDA)    │
│              │     commit_state       │                      │
│              │ ◄───────────────────── │  State: "delegated"  │
└──────────────┘                        └──────────┬───────────┘
                                                   │
                                                   │ ER validator takes over
                                                   ▼
┌──────────────────────────────────────────────────────────────┐
│               MagicBlock Ephemeral Rollup                     │
│                                                               │
│  • All moves executed here (make_move, resign, claim_timeout) │
│  • Session keys sign moves — no wallet prompts                │
│  • Crank chain: move → schedule_timeout → claim → settle      │
│  • Final state committed back to L1 via commit_state          │
│  • Account undelegated via undelegate_match                   │
└──────────────────────────────────────────────────────────────┘
```

### Connection Routing

Three connection types are used depending on the operation:

| Connection | Purpose | Endpoint |
|-----------|---------|----------|
| **Base layer** | Delegate accounts | `https://rpc.magicblock.app/devnet` |
| **Router** | Check delegation status | `https://devnet-router.magicblock.app/` |
| **ER validator** | Execute moves on delegated account | `https://<fqdn>` (from router) |

### Key Program Addresses

| Program | Address |
|---------|---------|
| Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Magic Program (EPH) | `Magic11111111111111111111111111111111111111` |
| Magic Context | `MagicContext1111111111111111111111111111111` |

## Delegate Flow

### 1. Delegate a Match

After creating a match, Player 1 delegates it to MagicBlock so both players can play gaslessly.

```typescript
import {
  findChessMatchPda,
  MAGICBLOCK_DEVNET_RPC,
  getDelegationStatus,
  getERConnection,
} from "@magic-chess/sdk";

// 1a. Delegate on the base layer
const [chessMatchPda] = findChessMatchPda(matchId, programId);
const sig = await client.program.methods
  .delegateMatch(matchId)
  .accounts({ chessMatch: chessMatchPda })
  .rpc();

// 1b. Confirm delegation via the router
const status = await getDelegationStatus(chessMatchPda);
if (!status.delegated) {
  throw new Error("Delegation not confirmed");
}

// 1c. Create ER connection for gameplay
const erConnection = getERConnection(status.fqdn);
```

The `delegate_match` instruction delegates the `chessMatch` PDA to the MagicBlock ER. The base-layer account is locked; all subsequent writes happen on the ER.

### 2. Play on the Ephemeral Rollup

Once delegated, moves are sent to the ER validator connection. The on-chain `make_move` instruction works identically — the connection target determines whether it hits L1 or the ER.

```typescript
// Build the program instance pointed at the ER
const erProgram = new Program(idl, programId, { connection: erConnection });
const erClient = new MagicChessClient(erProgram, wallet);

// Make a move — executes on the ER with ~50ms latency
const { result } = await erClient.makeMove(matchId, {
  fromRow: 1, fromCol: 4, toRow: 3, toCol: 4,
});
```

### 3. Commit State

When the match concludes, commit the final state back to Solana L1:

```typescript
const sig = await client.program.methods
  .commitState()
  .accounts({ chessMatch: chessMatchPda })
  .rpc();
```

**Commit is required** before undelegation. It writes the ER state to the base-layer account.

### 4. Undelegate

After committing, undelegate to release the account back to the base layer:

```typescript
const sig = await client.program.methods
  .undelegateMatch()
  .accounts({ chessMatch: chessMatchPda })
  .rpc();
```

## Session Keys

Session keys eliminate per-move wallet approvals. Instead of signing every transaction with the user's main wallet, a temporary keypair is authorized to sign `make_move` and `resign_game` on the ER.

### Lifecycle

```
1. SET: Player signs ONCE on L1 to authorize a session key
   └─ set_session_key(session_signer, expires_at)
   
2. USE: Session key signs all moves on the ER
   └─ No wallet popups, \<50ms confirmations
   
3. REVOKE: Session key revoked at match end or expiry
   └─ revoke_session_key()
```

### Set a Session Key

```typescript
// Generate a session keypair (stored in IndexedDB for persistence)
import { Keypair } from "@solana/web3.js";
const sessionKeypair = Keypair.generate();

const sig = await client.program.methods
  .setSessionKey(sessionKeypair.publicKey, expiresAt)
  .accounts({ chessMatch: chessMatchPda, playerSigner: wallet.publicKey })
  .signers([wallet.payer, sessionKeypair])
  .rpc();
```

The `expires_at` is a Unix timestamp (seconds). Typical expiration: 24 hours or match end, whichever comes first.

### Use Session Key for Moves

```typescript
// On the ER, sign moves with the session key instead of the main wallet
const sig = await erClient.program.methods
  .makeMove(moveArgs)
  .accounts({ chessMatch: chessMatchPda, player: sessionKeypair.publicKey })
  .signers([sessionKeypair])
  .rpc();
```

**Scope:** Session keys are permitted only for `make_move` and `resign_game`. They cannot delegate, undelegate, settle, or manage other session keys.

### Revoke a Session Key

```typescript
// Automatically called at match end, or manually if the session is compromised
const sig = await client.program.methods
  .revokeSessionKey()
  .accounts({ chessMatch: chessMatchPda, playerSigner: wallet.publicKey })
  .rpc();
```

## Crank Chain: Auto-Settlement

MagicBlock's task scheduler automates the full settlement pipeline. No one needs to call `claim_timeout_win` or `settleMatch` manually.

```
make_move
  └─ schedule_timeout(taskId)    ← check opponent timeout at now + moveTimeoutDuration

Player 2 moves
  └─ cancel_timeout_task(taskId) ← cancel old timer
  └─ schedule_timeout(newTaskId) ← schedule new timer for Player 1

Timeout expires
  └─ crank executes claim_timeout_win()
    └─ Inside claim: schedule process_match_settlement
      └─ Crank executes settlement (payouts)
        └─ Inside settlement: schedule undelegate_match
          └─ Crank commits state → undelegates account → match complete
```

### Schedule a Timeout Check

After a move, a timeout crank task is scheduled to auto-claim if the opponent doesn't move in time.

```typescript
// Done inside make_move via CPI — no separate transaction needed
const sig = await client.program.methods
  .scheduleTimeout(new anchor.BN(taskId))
  .accounts({ chessMatch: chessMatchPda })
  .rpc();
```

### Cancel a Timeout Check

When the opponent moves, the previous timeout task is canceled.

```typescript
const sig = await client.program.methods
  .cancelTimeoutTask()
  .accounts({ chessMatch: chessMatchPda })
  .rpc();
```

## Endpoints

### Devnet

| Service | Endpoint |
|---------|----------|
| Base Layer RPC | `https://rpc.magicblock.app/devnet` |
| Router | `https://devnet-router.magicblock.app/` |
| ER Validator (US) | `https://devnet-us.magicblock.app` |
| ER Validator (EU) | `https://devnet-eu.magicblock.app` |
| ER Validator (Asia) | `https://devnet-as.magicblock.app` |

### Mainnet

| Service | Endpoint |
|---------|----------|
| Base Layer RPC | `https://rpc.magicblock.app/mainnet` |
| Router | `https://router.magicblock.app/` |

## Limits and Costs

### Free Tier

- **10 free commits** per delegated account per month.
- All ephemeral rollup transactions are free (no gas for moves).

### Gas Model

| Operation | Cost |
|-----------|------|
| ER transactions (make_move, resign) | **FREE** |
| Session close fee | ~0.0003 SOL ($0.06) |
| State commit fee | ~0.0001 SOL ($0.02) |
| **Total per match** | **~$0.06 - $0.16** |

The per-match cost varies based on move count (more moves = more session key transactions = more close fees) and whether the crank chain is used.

### Delegation Limits

- One delegation per account at a time.
- Delegated accounts cannot be modified on the base layer until undelegated.
- Commit requires the ER to be online and synced.

## SDK Integration

The `@magic-chess/sdk` exports MagicBlock constants and helpers:

```typescript
import {
  MAGICBLOCK_DEVNET_RPC,
  MAGICBLOCK_DEVNET_ROUTER,
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  getDelegationStatus,
  getERConnection,
} from "@magic-chess/sdk";
```

See [sdk.md](./sdk.md) for the full SDK API reference.

## Program Instructions (MagicBlock)

These instructions exist on the on-chain program and are called via the SDK or direct program interaction:

| Instruction | Description |
|------------|-------------|
| `delegate_match` | Delegate the match account to MagicBlock ER |
| `commit_state` | Commit ER state back to base layer |
| `undelegate_match` | Release the match from ER delegation |
| `schedule_timeout` | Schedule a crank task for timeout auto-claim |
| `cancel_timeout_task` | Cancel a pending timeout crank task |
| `set_session_key` | Authorize a session key for gasless moves |
| `revoke_session_key` | Revoke the active session key |
