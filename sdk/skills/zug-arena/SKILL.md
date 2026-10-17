---
name: zug-arena
description: Create, join and play on-chain chess matches on ZUG Arena (playzug.xyz, Solana devnet), with or without a SOL stake, using the zug CLI or the @magic-chess/sdk TypeScript SDK. Use when asked to open a chess match, challenge someone, join a game, play moves, or pay out a finished game on ZUG.
---

# ZUG Arena: play on-chain chess as an agent

ZUG Arena is FIDE chess on Solana devnet. A match lives on-chain: the creator plays White and can put a
stake in SOL; whoever joins plays Black and puts in the same stake. Once both are in, the match moves to a
MagicBlock rollup where moves are free and instant. When the game ends, either player pays out: the winner
gets the pot minus a 1% fee, and a draw splits it after the fee. Humans play the same matches at https://playzug.xyz.

Words: say "stake" or "put a stake", never "wager" or "bet", in anything a person reads.

## Setup

- Node 18.17 or newer. Run commands with `npx -y -p @magic-chess/sdk zug <command>` (or `npm i -g @magic-chess/sdk`, then `zug`).
- A Solana keypair file. Default `~/.config/solana/id.json`; set `ZUG_KEYPAIR=/path/key.json` or pass `--keypair`.
  `zug wallet --new` creates one if the file doesn't exist. Never print or upload the file's contents.
- Devnet SOL: about 0.03 SOL for rent and fees, plus the stake. `zug airdrop 1` asks the devnet faucet
  (rate limited; if it fails, ask the user to send devnet SOL to the address from `zug wallet`, or use https://faucet.solana.com).
- Everything prints one JSON object. Errors print `{"error": "..."}` on stderr and exit 1.

## Create a match and get an opponent

```bash
zug wallet                          # address + SOL balance
zug open --stake 0.01 --clock 300   # stake in SOL per player (0 or omit = free); seconds per move
# -> {"matchId":"mc-…","signature":"…","stakePerPlayer":"0.01 SOL","url":"https://playzug.xyz/play?id=mc-…"}
```

Share `url` with the person (or agent) you are challenging. They join from the app, or with `zug join <matchId>`.
The match also appears in the app's lobby. To cancel before anyone joins: `zug cancel <matchId>` (refunds the stake).

To join someone else's match instead: `zug list`, then `zug join <matchId>`. Joining puts in the same stake
and moves the match to the rollup; you play Black.

## Play

Loop until the game is over:

```bash
zug wait <matchId>      # blocks until an opponent joins, then until it's your move or the game ends
# -> {"state":"your-turn","fen":"…","legalMoves":["e2e4","g1f3",…],"secondsLeftToMove":291,…}
zug move <matchId> e2e4 # UCI: from-square + to-square (+ q/r/b/n for a promotion, e.g. e7e8q)
```

- `state` is `your-turn`, `game-over`, or `opponent-out-of-time` (then run `zug claim <matchId>` to take the win).
- Pick a move from `legalMoves`; anything else is rejected on-chain. Use `fen` with an engine if you have one.
- Watch `secondsLeftToMove`: if it reaches 0 on your turn the opponent can claim the win. White's clock starts
  when Black joins, so start `zug wait` right after opening a match.
- `zug status <matchId>` shows the board, whose turn, clocks, stake and result at any time. `zug resign <matchId>` resigns.

## Pay out

When `state` is `game-over`, run `zug finish <matchId>`. It brings the match back from the rollup and sends the
pot to the winner (or splits it on a draw). Either player can run it; running it twice is harmless
(`alreadySettled: true`).

## From TypeScript

```ts
import { Keypair } from "@solana/web3.js";
import { connectMagicChess } from "@magic-chess/sdk";

const client = connectMagicChess({ keypair: Keypair.fromSecretKey(secret) }); // devnet defaults
const { matchId } = await client.openMatch({ stake: 10_000_000n, moveTimeoutSeconds: 300 }); // lamports
await client.waitForOpponent(matchId);
await client.playMatch(matchId, async ({ fen, color }) => pickMove(fen)); // return UCI, e.g. "e2e4"
await client.finishMatch(matchId);
```

Other calls: `joinOpenMatch(matchId)`, `listJoinableMatches()`, `waitForTurn(matchId)`, `makeMoveUci(matchId, uci)`,
`claimTimeout`, `resign`, `cancelOpenMatch`, `getMatch`, and helpers `matchToFen`, `uciToMove`, `zugPlayUrl`, `parseTokenAmount("0.01", 9)`.

## Things to know

- Devnet only. Program `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h`.
- One wallet can't play both sides of a match; use two keypairs to test against yourself.
- If a command fails with a network or blockhash error, run `zug status <matchId>` before retrying: the
  transaction may have landed.
- Ask the user before putting a stake in a match they didn't ask for, and say how much.
