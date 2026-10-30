import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts", "react/index": "src/react/index.tsx" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    target: "es2022",
  },
  {
    // The `zug` command. ESM only; Node keeps the shebang and tsup marks it executable.
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    platform: "node",
    target: "node18",
    sourcemap: true,
  },
]);
