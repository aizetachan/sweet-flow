import { defineConfig, loadEnv, type Plugin } from "vite";
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

/**
 * Google's token endpoint wants the app's secret even with PKCE. The dev
 * server adds it here, from GOOGLE_CLIENT_SECRET in .env.local (no VITE_
 * prefix: it never reaches the page). The desktop app will do the same from
 * its main process. docs/DEVELOPMENT.md explains how to get it.
 */
function googleToken(secret: string | undefined): Plugin {
  return {
    name: "sweetflow-google-token",
    configureServer(server) {
      server.middlewares.use("/google/token", async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const params = new URLSearchParams(Buffer.concat(chunks).toString());
          if (secret) params.set("client_secret", secret);
          const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
          res.statusCode = r.status;
          res.setHeader("content-type", r.headers.get("content-type") ?? "application/json");
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

const dropOrigin = (proxy: { on(e: "proxyReq", cb: (req: { removeHeader(h: string): void }) => void): void }) =>
  proxy.on("proxyReq", (req) => {
    req.removeHeader("origin");
    req.removeHeader("referer");
  });

// Renderer of the desktop app. `base: "./"` so the same build loads from
// Electron (file://) and from any static host.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), magnificFiles(), googleToken(loadEnv(mode, process.cwd(), "").GOOGLE_CLIENT_SECRET)],
  server: {
    port: 5173,
    proxy: {
      // Without the page's Origin: Magnific's sign-in rejects token requests from web pages ("Invalid origin").
      "/magnific/mcp": { target: "https://mcp.magnific.com", changeOrigin: true, rewrite: () => "/", configure: dropOrigin },
      "/magnific/token": { target: "https://auth.magnific.com", changeOrigin: true, rewrite: () => "/realms/mcp/protocol/openid-connect/token", configure: dropOrigin },
    },
  },
}));
