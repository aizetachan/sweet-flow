import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Magnific in development (docs/ARCHITECTURE.md §6): its MCP server and its
 * file CDN don't accept calls from a web page, so the dev server relays them.
 * The packaged desktop app does the same from its main process.
 */
const MAGNIFIC_FILE_HOSTS = [/\.cdnpk\.net$/, /\.magnific\.com$/, /\.freepik\.com$/, /\.amazonaws\.com$/, /\.googleapis\.com$/];

function magnificFiles(): Plugin {
  return {
    name: "sweetflow-magnific-files",
    configureServer(server) {
      server.middlewares.use("/magnific/file", async (req, res) => {
        try {
          const target = new URL(new URL(req.url ?? "", "http://x").searchParams.get("url") ?? "");
          if (target.protocol !== "https:" || !MAGNIFIC_FILE_HOSTS.some((h) => h.test(target.hostname))) {
            res.statusCode = 400;
            return res.end("host not allowed");
          }
          const r = await fetch(target);
          res.statusCode = r.status;
          const type = r.headers.get("content-type");
          if (type) res.setHeader("content-type", type);
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

// Renderer of the desktop app. `base: "./"` so the same build loads from
// Electron (file://) and from any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), magnificFiles()],
  server: {
    port: 5173,
    proxy: {
      "/magnific/mcp": { target: "https://mcp.magnific.com", changeOrigin: true, rewrite: () => "/" },
    },
  },
});
