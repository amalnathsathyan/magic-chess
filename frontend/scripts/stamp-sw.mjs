// Writes the Next build id into out/sw.js so each deploy gets its own cache
// and the previous build's assets are dropped on activation.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const swPath = "out/sw.js";
if (!existsSync(swPath)) {
  console.warn("stamp-sw: out/sw.js not found, skipping");
  process.exit(0);
}
const buildId = existsSync(".next/BUILD_ID")
  ? readFileSync(".next/BUILD_ID", "utf8").trim()
  : Date.now().toString(36);
writeFileSync(swPath, readFileSync(swPath, "utf8").replaceAll("__BUILD_ID__", buildId));
console.log(`stamp-sw: cache zug-${buildId}`);
