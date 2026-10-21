import { defineConfig } from "vite";

// In development `/api/*` goes to the Functions emulator (`pnpm emulators`),
// mirroring the Hosting rewrite in firebase.json. Point SWEETFLOW_API at a
// deployed function base URL to test against production instead.
const API_BASE =
  process.env.SWEETFLOW_API ?? "http://127.0.0.1:5002/sweetflow-landing/europe-west1";

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      "/api": { target: API_BASE, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
