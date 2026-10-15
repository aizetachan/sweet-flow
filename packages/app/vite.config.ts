import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Renderer of the desktop app. `base: "./"` so the same build loads from
// Electron (file://) and from any static host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
});
