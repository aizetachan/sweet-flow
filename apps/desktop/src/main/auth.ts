/**
 * Sign-ins (Magnific, Dropbox, Google) from the desktop app: the service's page
 * opens in the system browser and comes back to a loopback address served
 * here (RFC 8252). The renderer gets the callback's query and finishes PKCE.
 */

import { BrowserWindow, shell } from "electron";
import http from "node:http";
import type { AddressInfo } from "node:net";

/** Fixed, so the address can be registered with services that need it; another one if taken. */
export const AUTH_PORT = 53134;
const TIMEOUT_MS = 10 * 60_000;

const PAGE = `<!doctype html><meta charset="utf-8"><title>Sweet Flow</title>
<body style="font:15px -apple-system,system-ui,sans-serif;background:#0b0b0c;color:#e8e8ea;display:grid;place-items:center;height:100vh;margin:0">
<p>Listo. Ya puedes volver a Sweet Flow y cerrar esta pestaña.</p></body>`;

let server: http.Server | null = null;
let waiting: { path: string; done: Promise<string>; resolve: (q: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;

function stop(reason?: string): void {
  if (waiting) {
    clearTimeout(waiting.timer);
    if (reason) waiting.reject(new Error(reason));
    waiting = null;
  }
  server?.close();
  server = null;
}

function listen(s: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => resolve((s.address() as AddressInfo).port));
  });
}

/** Starts listening for `path` and returns the address to give the service as redirect URI. */
export async function authRedirect(path: string): Promise<string> {
  stop("Se ha empezado otro inicio de sesión.");
  let resolve!: (q: string) => void;
  let reject!: (e: Error) => void;
  const done = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
  done.catch(() => {});
  const timer = setTimeout(() => stop("El inicio de sesión ha tardado demasiado."), TIMEOUT_MS);
  waiting = { path, done, resolve, reject, timer };

  const s = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!waiting || url.pathname !== waiting.path) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    waiting.resolve(url.search);
    stop();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  server = s;
  const port = await listen(s, AUTH_PORT).catch(() => listen(s, 0));
  return `http://127.0.0.1:${port}${path}`;
}

/** Opens the sign-in page in the system browser; resolves with the callback's query string. */
export async function authOpen(url: string): Promise<string> {
  if (!waiting) throw new Error("No hay ningún inicio de sesión en marcha.");
  if (!/^https:\/\//.test(url)) throw new Error("Dirección de inicio de sesión no válida.");
  await shell.openExternal(url);
  return waiting.done;
}

/**
 * Google's token request (code or refresh), with Sweet Flow's client secret
 * added here so it never reaches the page. Only ever posts to Google.
 */
export async function googleToken(body: string): Promise<{ status: number; body: string }> {
  const params = new URLSearchParams(body);
  const secret = process.env.SF_GOOGLE_CLIENT_SECRET;
  if (secret) params.set("client_secret", secret);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  return { status: r.status, body: await r.text() };
}
