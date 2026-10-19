// Shared esbuild setup for the Electron entries (main, preload, mirror).
// Everything is bundled into out/*.cjs so the packaged app needs no
// node_modules; only `electron` itself stays external.
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const outDir = path.join(root, "out");

/**
 * Google's token endpoint wants Sweet Flow's client secret (it is not really
 * secret in an installed app, Google says so; it is kept out of the repo and
 * of the page). Taken from the environment (CI) or packages/app/.env.local,
 * and built into the main process, which adds it when asking for tokens.
 */
function googleClientSecret() {
  if (process.env.GOOGLE_CLIENT_SECRET) return process.env.GOOGLE_CLIENT_SECRET;
  try {
    const env = readFileSync(path.resolve(root, "../../packages/app/.env.local"), "utf8");
    return /^GOOGLE_CLIENT_SECRET=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  } catch {
    return "";
  }
}

export const define = { "process.env.SF_GOOGLE_CLIENT_SECRET": JSON.stringify(googleClientSecret()) };

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
  define,
};
