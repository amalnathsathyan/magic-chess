import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "react/index": "src/react/index.tsx" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
