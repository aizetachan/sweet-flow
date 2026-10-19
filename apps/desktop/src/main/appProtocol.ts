/**
 * The installed app serves its renderer from `sf-app://app/` rather than
 * file://, so the page has a stable origin of its own and the same relays the
 * Vite dev server gives it in development (packages/app/vite.config.ts):
 * Magnific's MCP server, token endpoint and file CDN don't accept calls from a
 * web page, and Google's token endpoint wants the app's secret.
 */

import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { googleToken } from "./auth";

export const APP_SCHEME = "sf-app";
export const APP_ORIGIN = `${APP_SCHEME}://app`;

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

const MAGNIFIC_FILE_HOSTS = [/\.cdnpk\.net$/, /\.magnific\.com$/, /\.freepik\.com$/, /\.amazonaws\.com$/, /\.googleapis\.com$/];

/** Forwards a request without the page's Origin (Magnific's sign-in rejects it). */
async function relay(req: Request, target: string): Promise<Response> {
  const headers = new Headers(req.headers);
  for (const h of ["origin", "referer", "host"]) headers.delete(h);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const r = await net.fetch(target, { method: req.method, headers, body });
  // The body comes decoded: drop what described the encoded one.
  const out = new Headers(r.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(r.body, { status: r.status, headers: out });
}

export function serveApp(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (req) => {
    const url = new URL(req.url);
    try {
      switch (url.pathname) {
        case "/magnific/mcp":
          return await relay(req, "https://mcp.magnific.com/");
        case "/magnific/token":
          return await relay(req, "https://auth.magnific.com/realms/mcp/protocol/openid-connect/token");
        case "/magnific/file": {
          const target = new URL(url.searchParams.get("url") ?? "");
          if (target.protocol !== "https:" || !MAGNIFIC_FILE_HOSTS.some((h) => h.test(target.hostname))) {
            return new Response("host not allowed", { status: 400 });
          }
          return await relay(req, target.toString());
        }
        case "/google/token": {
          const r = await googleToken(await req.text());
          return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
        }
      }
    } catch (err) {
      return new Response(String(err), { status: 502 });
    }
    // The renderer's own files, never anything outside its folder.
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(rendererDir, rel);
    if (file !== rendererDir && !file.startsWith(rendererDir + path.sep)) return new Response("not found", { status: 404 });
    const r = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
    if (r?.ok) return r;
    // Not a file (a page path such as /auth/…): the app itself.
    return net.fetch(pathToFileURL(path.join(rendererDir, "index.html")).toString());
  });
}
