// Dev loop: bundles main/preload/mirror in watch mode, waits for the
// renderer's Vite dev server and (re)launches Electron on every rebuild.
// The renderer itself hot-reloads through Vite.
import { context } from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { options, root } from "./bundle.mjs";

const RENDERER_URL = process.env.SWEETFLOW_RENDERER_URL ?? "http://localhost:5173/";
const electronBin = /** @type {string} */ (createRequire(import.meta.url)("electron"));

async function waitForRenderer(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Renderer dev server not reachable at ${url}`);
}

/** @type {import("node:child_process").ChildProcess | null} */
let electron = null;
let quitting = false;

function launch() {
  if (electron) {
    electron.removeAllListeners("exit");
    electron.kill();
  }
  electron = spawn(electronBin, ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, SWEETFLOW_RENDERER_URL: RENDERER_URL },
  });
  electron.on("exit", () => {
    // Closing the window ends the dev session.
    if (!quitting) process.exit(0);
  });
}

await waitForRenderer(RENDERER_URL);

const ctx = await context({
  ...options,
  plugins: [{ name: "relaunch", setup: (b) => b.onEnd((r) => (r.errors.length ? null : launch())) }],
});
await ctx.watch();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    quitting = true;
    electron?.kill();
    await ctx.dispose();
    process.exit(0);
  });
}
