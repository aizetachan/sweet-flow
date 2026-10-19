// Production bundle: out/{main,preload,mirror}.cjs + out/renderer (copied
// from the @sweetflow/app build, which must exist: `pnpm build:desktop`
// at the repo root builds both in order).
import { build } from "esbuild";
import { cp, rm, stat } from "node:fs/promises";
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
console.log(`Desktop bundle ready in ${path.relative(process.cwd(), outDir) || "."}`);
