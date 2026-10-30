#!/usr/bin/env node
// `zug`: play ZUG Arena from a shell. Built for agents: every command prints
// one JSON object on stdout, and errors print {"error": "..."} on stderr with
// exit code 1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { Chess } from "chess.js";

import { connectMagicChess } from "./connect";
import {
  ZUG_DEVNET,
  isMatchOver,
  matchToFen,
  parseTokenAmount,
  playerColor,
  secondsLeftToMove,
  zugPlayUrl,
} from "./play";
import { formatRawTokenAmount } from "./wager";
import type { ChessMatch } from "./types";

const HELP = `zug: play ZUG Arena (on-chain chess on Solana devnet) from the command line.

Usage: zug <command> [args] [options]

Wallet
  wallet [--new]           Show the wallet address and SOL balance (--new creates the keypair file)
  airdrop [sol]            Request devnet SOL (default 1; the faucet is rate limited)

Matches
  open [--stake SOL] [--clock SECONDS]
                           Open a match as White (stake defaults to 0, clock to 300s a move)
  list                     Matches waiting for an opponent
  join <matchId>           Join as Black, putting in the same stake
  status <matchId>         Board (FEN), whose turn, clock and result
  wait <matchId> [--timeout SECONDS]
                           Wait for an opponent, then for your turn or the end of the game
  move <matchId> <uci>     Play a move, e.g. e2e4 or e7e8q
  claim <matchId>          Claim the win when the opponent's move clock ran out
  resign <matchId>         Resign
  cancel <matchId>         Cancel your open match before anyone joins (refunds your stake)
  finish <matchId>         Pay out a finished match (either player can)

Options
  --keypair PATH           Keypair JSON file (env ZUG_KEYPAIR, default ~/.config/solana/id.json)
  --rpc URL                Solana RPC (env ZUG_RPC_URL, default devnet)
  --no-indexer             Don't send indexing hints to the ZUG Arena backend
  -h, --help               Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    keypair: { type: "string" },
    rpc: { type: "string" },
    stake: { type: "string" },
    clock: { type: "string" },
    timeout: { type: "string" },
    new: { type: "boolean" },
    "no-indexer": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, ...args] = positionals;

function keypairPath(): string {
  const path = values.keypair ?? process.env.ZUG_KEYPAIR ?? "~/.config/solana/id.json";
  return resolve(path.replace(/^~(?=$|\/)/, homedir()));
}

function loadKeypair(): Keypair {
  const path = keypairPath();
  if (!existsSync(path)) {
    throw new Error(`No keypair at ${path}. Run "zug wallet --new" or pass --keypair.`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function client(keypair?: Keypair) {
  return connectMagicChess({
    keypair,
    rpcUrl: values.rpc ?? process.env.ZUG_RPC_URL,
    indexerUrl: values["no-indexer"] ? null : undefined,
  });
}

function requireArg(index: number, name: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing <${name}>. Run "zug --help".`);
  return value;
}

function stakeText(raw: bigint, mint: PublicKey): string {
  return mint.equals(NATIVE_MINT) ? `${formatRawTokenAmount(raw, 9)} SOL` : `${raw} raw units`;
}

/** Legal moves in UCI, so an agent never has to guess (the program rejects illegal ones anyway). */
function legalMoves(fen: string): string[] | null {
  try {
    return new Chess(fen)
      .moves({ verbose: true })
      .map((move) => move.from + move.to + (move.promotion ?? ""));
  } catch {
    return null;
  }
}

function describe(match: ChessMatch, me?: PublicKey) {
  const left = secondsLeftToMove(match);
  const fen = matchToFen(match);
  const you = me ? playerColor(match, me) : undefined;
  const yourTurn = match.gameStatus === "active" && you === match.currentTurn;
  return {
    matchId: match.matchId,
    status: match.gameStatus,
    endReason: match.gameEndReason,
    white: match.players[0].toBase58(),
    black: match.players[1].equals(PublicKey.default) ? null : match.players[1].toBase58(),
    you,
    turn: match.gameStatus === "active" ? match.currentTurn : null,
    yourTurn,
    fen,
    legalMoves: yourTurn ? legalMoves(fen) : undefined,
    secondsLeftToMove: left,
    moveClockSeconds: Number(match.moveTimeoutDuration),
    stakePerPlayer: stakeText(match.betAmountPlayerOne, match.bettingTokenMint),
    pot: stakeText(match.totalPot, match.bettingTokenMint),
    paidOut: match.payoutProcessed,
    onRollup: match.isDelegated,
    url: zugPlayUrl(match.matchId),
  };
}

async function run(): Promise<unknown> {
  if (values.help || !command) return HELP;

  switch (command) {
    case "wallet": {
      const path = keypairPath();
      if (values.new && !existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)), {
          mode: 0o600,
        });
      }
      const keypair = loadKeypair();
      const lamports = await client().program.provider.connection.getBalance(keypair.publicKey);
      return {
        address: keypair.publicKey.toBase58(),
        keypair: path,
        sol: formatRawTokenAmount(BigInt(lamports), 9),
      };
    }
    case "airdrop": {
      const keypair = loadKeypair();
      const connection = client().program.provider.connection;
      const lamports = Number(parseTokenAmount(args[0] ?? "1", 9));
      const signature = await connection.requestAirdrop(keypair.publicKey, lamports);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      const balance = await connection.getBalance(keypair.publicKey);
      return { signature, sol: formatRawTokenAmount(BigInt(balance), 9) };
    }
    case "open": {
      const c = client(loadKeypair());
      const stake = parseTokenAmount(values.stake ?? "0", ZUG_DEVNET.stakeDecimals);
      const { matchId, signature } = await c.openMatch({
        stake,
        moveTimeoutSeconds: values.clock ? Number(values.clock) : undefined,
      });
      return { matchId, signature, stakePerPlayer: stakeText(stake, NATIVE_MINT), url: zugPlayUrl(matchId) };
    }
    case "list": {
      const matches = await client().listJoinableMatches();
      return matches.map((m) => ({
        matchId: m.matchId,
        white: m.players[0].toBase58(),
        stakePerPlayer: stakeText(m.betAmountPlayerOne, m.bettingTokenMint),
        moveClockSeconds: Number(m.moveTimeoutDuration),
        url: zugPlayUrl(m.matchId),
      }));
    }
    case "join": {
      const c = client(loadKeypair());
      const matchId = requireArg(0, "matchId");
      const { signature } = await c.joinOpenMatch(matchId);
      return { matchId, signature, you: "black", url: zugPlayUrl(matchId) };
    }
    case "status": {
      const keypair = existsSync(keypairPath()) ? loadKeypair() : undefined;
      const match = await client(keypair).getMatch(requireArg(0, "matchId"));
      if (!match) throw new Error("Match not found");
      return describe(match, keypair?.publicKey);
    }
    case "wait": {
      const keypair = loadKeypair();
      const c = client(keypair);
      const matchId = requireArg(0, "matchId");
      const timeoutMs = values.timeout ? Number(values.timeout) * 1000 : undefined;
      const started = Date.now();
      const current = await c.getMatch(matchId);
      if (current?.gameStatus === "waitingForOpponent") {
        await c.waitForOpponent(matchId, { timeoutMs });
      }
      const remaining = timeoutMs === undefined ? undefined : Math.max(0, timeoutMs - (Date.now() - started));
      const { state, match } = await c.waitForTurn(matchId, { timeoutMs: remaining });
      return { state, ...describe(match, keypair.publicKey) };
    }
    case "move": {
      const keypair = loadKeypair();
      const c = client(keypair);
      const matchId = requireArg(0, "matchId");
      const { result, signature } = await c.makeMoveUci(matchId, requireArg(1, "uci"));
      const match = await c.getMatch(matchId);
      return { result, signature, ...(match ? describe(match, keypair.publicKey) : {}) };
    }
    case "claim": {
      const { signature } = await client(loadKeypair()).claimTimeout(requireArg(0, "matchId"));
      return { signature };
    }
    case "resign": {
      const { signature } = await client(loadKeypair()).resign(requireArg(0, "matchId"));
      return { signature };
    }
    case "cancel": {
      return client(loadKeypair()).cancelOpenMatch(requireArg(0, "matchId"));
    }
    case "finish": {
      const c = client(loadKeypair());
      const matchId = requireArg(0, "matchId");
      const result = await c.finishMatch(matchId);
      const match = await c.getMatch(matchId);
      return { ...result, ...(match ? { status: match.gameStatus, pot: stakeText(match.totalPot, match.bettingTokenMint) } : {}) };
    }
    default:
      throw new Error(`Unknown command "${command}". Run "zug --help".`);
  }
}

// Exit explicitly (RPC sockets can linger), but only once stdout has flushed.
function exit(stream: NodeJS.WriteStream, text: string, code: number): void {
  stream.write(text, () => process.exit(code));
}

run().then(
  (output) =>
    exit(
      process.stdout,
      typeof output === "string"
        ? output
        : JSON.stringify(output, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2) + "\n",
      0
    ),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    exit(process.stderr, JSON.stringify({ error: message }) + "\n", 1);
  }
);
