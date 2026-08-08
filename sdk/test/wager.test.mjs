import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/wager.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { formatRawTokenAmount, isFreeWager } = await import(moduleUrl);

test("free state is derived only from a zero on-chain wager", () => {
  assert.equal(isFreeWager(0n), true);
  assert.equal(isFreeWager(1n), false);
});

test("formats raw token units without precision loss", () => {
  assert.equal(formatRawTokenAmount(0n, 9), "0");
  assert.equal(formatRawTokenAmount(10_000_000n, 9), "0.01");
  assert.equal(
    formatRawTokenAmount(18_446_744_073_709_551_615n, 9),
    "18446744073.709551615"
  );
});

test("rejects invalid display inputs", () => {
  assert.throws(() => formatRawTokenAmount(-1n, 9), /cannot be negative/);
  assert.throws(() => formatRawTokenAmount(1n, -1), /decimals/);
});
