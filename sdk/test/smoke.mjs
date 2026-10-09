// Loads the built package through its exports map, ESM and CJS, the way an npm consumer would.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esm = await import("@magic-chess/sdk");
const cjs = require("@magic-chess/sdk");

for (const sdk of [esm, cjs]) {
  assert.equal(typeof sdk.MagicChessClient, "function");
  assert.equal(sdk.MAGIC_CHESS_IDL.address, "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h");
  assert.equal(sdk.formatRawTokenAmount(10_000_000n, 9), "0.01");
}
assert.equal(typeof (await import("@magic-chess/sdk/react")).useMatch, "function");
console.log("smoke ok");
