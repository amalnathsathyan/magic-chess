# @magic-chess/sdk

TypeScript client for [ZUG Arena](https://arena.chessmagic.workers.dev) (Magic Chess): FIDE chess on Solana with SPL-token wagers and gasless moves on MagicBlock Ephemeral Rollups.

- `MagicChessClient`: create, join, play, resign, settle. Routes each call to the base layer or the rollup.
- React hooks (`@magic-chess/sdk/react`)
- PDA, FEN, wager and MagicBlock helpers, plus the program IDL and types

Program `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` on **devnet**.

## Install

```bash
npm install @magic-chess/sdk @anchor-lang/core @solana/web3.js@1 @solana/spl-token
# React hooks only:
npm install react react-dom
```

## Quick start

```typescript
import { AnchorProvider, Program } from "@anchor-lang/core";
import { Connection } from "@solana/web3.js";
import { MagicChessClient, MAGIC_CHESS_IDL, type MagicChess } from "@magic-chess/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program<MagicChess>(MAGIC_CHESS_IDL, provider);
const client = new MagicChessClient(program, wallet);

const match = await client.getMatch("match-001");
const open = await client.listJoinableMatches();
```

Full reference: https://amalnathsathyan.github.io/magic-chess/docs/build/sdk/

## License

MIT
