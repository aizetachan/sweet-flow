// Shared esbuild setup for the Electron entries (main, preload, mirror).
// Everything is bundled into out/*.cjs so the packaged app needs no
// node_modules; only `electron` itself stays external.
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const outDir = path.join(root, "out");

/** @type {import("esbuild").BuildOptions} */
export const options = {
  absWorkingDir: root,
  entryPoints: {
    main: "src/main/index.ts",
    preload: "src/preload/index.ts",
    mirror: "src/mirror/index.ts",
  },
  outdir: outDir,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};
