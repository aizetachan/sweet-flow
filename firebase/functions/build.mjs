// Bundles the Functions into lib/index.js. @sweetflow/domain is inlined (it
// is a workspace package, not published to npm); firebase-* stay external and
// are installed by Cloud Build from `dependencies` at deploy time.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["firebase-admin", "firebase-admin/*", "firebase-functions", "firebase-functions/*"],
  sourcemap: true,
  logLevel: "info",
});
