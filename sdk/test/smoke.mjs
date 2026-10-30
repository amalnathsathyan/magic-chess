// Loads the built package through its exports map, ESM and CJS, the way an npm consumer would.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esm = await import("@magic-chess/sdk");
const cjs = require("@magic-chess/sdk");

for (const sdk of [esm, cjs]) {
  assert.equal(typeof sdk.MagicChessClient, "function");
  assert.equal(sdk.MAGIC_CHESS_IDL.address, "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
  assert.equal(sdk.formatRawTokenAmount(10_000_000n, 9), "0.01");
  assert.equal(typeof sdk.connectMagicChess, "function");
  assert.equal(sdk.ZUG_DEVNET.platformFeeBasisPoints, 100);
  assert.ok(sdk.connectMagicChess() instanceof sdk.MagicChessClient);
}
assert.equal(typeof (await import("@magic-chess/sdk/react")).useMatch, "function");
// The `zug` bin, resolved the way npx would.
const bin = require("@magic-chess/sdk/package.json").bin.zug;
const cli = new URL(bin, import.meta.resolve("@magic-chess/sdk/package.json"));
assert.match(execFileSync(process.execPath, [cli.pathname, "--help"], { encoding: "utf8" }), /^zug:/);
console.log("smoke ok");
