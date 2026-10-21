// Production bundle: out/{main,preload,mirror}.cjs + out/renderer (copied
// from the @sweetflow/app build, which must exist: `pnpm build:desktop`
// at the repo root builds both in order).
import { build } from "esbuild";
import { chmod, cp, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { define, options, outDir, root } from "./bundle.mjs";

const rendererDist = path.resolve(root, "../../packages/app/dist");

try {
  await stat(path.join(rendererDist, "index.html"));
} catch {
  console.error(`Renderer build not found at ${rendererDist}. Run: pnpm --filter @sweetflow/app build`);
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await build({ ...options, minify: true, define: { ...define, "process.env.NODE_ENV": '"production"' } });
await cp(rendererDist, path.join(outDir, "renderer"), { recursive: true });
// The icon the theme recolours while the app runs (src/main/appIcon.ts).
for (const name of ["icon.png", "icon-win.png"]) await cp(path.join(root, "build", name), path.join(outDir, "icons", name));
// The assistant's terminal (src/main/terminal.ts): node-pty with its prebuilt binaries for
// macOS and Windows (N-API: no rebuild for Electron). Unpacked from the asar (electron-builder.yml).
const ptyDir = path.dirname(createRequire(path.join(root, "package.json")).resolve("node-pty/package.json"));
const ptyOut = path.join(outDir, "node_modules", "node-pty");
await cp(path.join(ptyDir, "package.json"), path.join(ptyOut, "package.json"));
await cp(path.join(ptyDir, "lib"), path.join(ptyOut, "lib"), { recursive: true, filter: (f) => !/\.(test\.js|map)$/.test(f) });
for (const plat of ["darwin-arm64", "darwin-x64", "win32-x64", "win32-arm64"]) {
  await cp(path.join(ptyDir, "prebuilds", plat), path.join(ptyOut, "prebuilds", plat), { recursive: true, filter: (f) => !f.endsWith(".pdb") });
}
// The package loses the helper's execute bit; without it no shell starts on macOS.
for (const plat of ["darwin-arm64", "darwin-x64"]) await chmod(path.join(ptyOut, "prebuilds", plat, "spawn-helper"), 0o755);
console.log(`Desktop bundle ready in ${path.relative(process.cwd(), outDir) || "."}`);
