# @magic-chess/sdk

TypeScript SDK and command-line tool for [ZUG Arena](https://playzug.xyz) (Magic Chess): FIDE chess on Solana with SOL stakes and free, instant moves on MagicBlock Ephemeral Rollups. Built for apps, bots and AI agents.

- `connectMagicChess({ keypair })`: a ready client with ZUG Arena's devnet settings
- `MagicChessClient`: open, join, play, resign, claim timeouts and pay out. Routes each call to Solana or the rollup.
- `zug` CLI: the same flow from a shell, with JSON output for agents
- An agent skill (`skills/zug-arena/SKILL.md`)
- React hooks (`@magic-chess/sdk/react`), PDA, FEN and token helpers, the program IDL and types

Program `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` on **devnet**.

## Install

```bash
npm install @magic-chess/sdk @anchor-lang/core @solana/web3.js@1 @solana/spl-token
# React hooks only:
npm install react react-dom
```

## Agents and bots

Open a match with a 0.01 SOL stake, wait for someone to join, play it out and pay out:

```typescript
import { Keypair } from "@solana/web3.js";
import { connectMagicChess, zugPlayUrl } from "@magic-chess/sdk";

const client = connectMagicChess({ keypair: Keypair.fromSecretKey(secretKey) });

const { matchId } = await client.openMatch({ stake: 10_000_000n, moveTimeoutSeconds: 300 }); // lamports
console.log("Challenge link:", zugPlayUrl(matchId));

await client.waitForOpponent(matchId);
const final = await client.playMatch(matchId, async ({ fen, color }) => {
  return pickMove(fen); // your engine; return UCI such as "e2e4" or "e7e8q"
});
console.log(final.gameStatus, final.gameEndReason);
await client.finishMatch(matchId); // pot to the winner, 1% fee
```

Join someone else's match instead with `client.listJoinableMatches()` and `client.joinOpenMatch(matchId)`.
The wallet pays its own devnet fees and rent (about 0.03 SOL) plus the stake; moves on the rollup are free.
Matches use ZUG Arena's fee terms, so they show in the app's lobby and people can join them from a browser.

### Command line

```bash
npm install -g @magic-chess/sdk     # or prefix each command with: npx -y -p @magic-chess/sdk
zug wallet --new                    # create ~/.config/solana/id.json if missing, show address + balance
zug airdrop 1                       # devnet faucet
zug open --stake 0.01 --clock 300   # -> {"matchId": "...", "url": "https://playzug.xyz/play?id=..."}
zug wait <matchId>                  # -> {"state": "your-turn", "fen": "...", "legalMoves": [...]}
zug move <matchId> e2e4
zug finish <matchId>
```

Every command prints JSON. Set the keypair with `--keypair` or `ZUG_KEYPAIR`, the RPC with `--rpc` or `ZUG_RPC_URL`.

### Agent skill

`skills/zug-arena/SKILL.md` teaches an agent the whole flow. For Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -r node_modules/@magic-chess/sdk/skills/zug-arena ~/.claude/skills/
```

## Apps

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

Full reference: https://docs.playzug.xyz/docs/build/sdk/

Building bots: https://docs.playzug.xyz/docs/build/agents/

Source and issues: https://github.com/amalnathsathyan/magic-chess/tree/dev/sdk

## License

MIT
