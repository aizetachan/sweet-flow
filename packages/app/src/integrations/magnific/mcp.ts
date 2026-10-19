/**
 * Minimal client for Magnific's MCP server (streamable HTTP, JSON-RPC 2.0):
 * initialize once, then call tools with the user's own session. No language
 * model in between: Sweet Flow calls the tools directly.
 *
 * In development the dev server relays the calls (vite.config.ts); the
 * desktop app will do it from its main process.
 */

import { decode } from "@toon-format/toon";
import { accessToken, NotConnected } from "./auth";

const ENDPOINT = "/magnific/mcp";
const PROTOCOL = "2025-06-18";

let session: Promise<string | null> | null = null;
let seq = 0;

export interface ToolResult {
  /** The tool's output as data (`structuredContent`, or its text read as JSON or TOON). */
  data: unknown;
  /** The tool's text output, as is. */
  text: string;
}

/** Calls a Magnific tool and returns its output. Throws with Magnific's message on errors. */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = (await rpc("tools/call", { name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const text = (res.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  if (res.isError) throw new Error(text || `Magnific ha fallado en ${name}.`);
  let data: unknown = res.structuredContent;
  if (data === undefined) data = parseText(text);
  return { data, text };
}

/** Magnific answers in JSON or in TOON (a compact JSON-like text); both become the same data. */
function parseText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // not JSON
  }
  try {
    return decode(text);
  } catch {
    return undefined;
  }
}

async function rpc(method: string, params: unknown, retried = false): Promise<unknown> {
  const sid = await (session ??= initialize());
  const r = await post({ jsonrpc: "2.0", id: ++seq, method, params }, sid);
  if ((r.status === 404 || r.status === 400) && sid && !retried) {
    // The server forgot the session: start a new one.
    session = null;
    return rpc(method, params, true);
  }
  if (r.status >= 500 && !retried) {
    // A server error with nothing said: once more, on a new session, after a moment.
    const raw = await r.clone().text().catch(() => "");
    if (!raw.trim()) {
      session = null;
      await new Promise((res) => setTimeout(res, 1500));
      return rpc(method, params, true);
    }
  }
  return result(r);
}

async function initialize(): Promise<string | null> {
  const r = await post({
    jsonrpc: "2.0",
    id: ++seq,
    method: "initialize",
    params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "sweet-flow", version: "0.1" } },
  });
  await result(r);
  const sid = r.headers.get("mcp-session-id");
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);
  return sid;
}

async function post(body: unknown, sid?: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${await accessToken()}`,
    "mcp-protocol-version": PROTOCOL,
  };
  if (sid) headers["mcp-session-id"] = sid;
  const r = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (r.status === 401) {
    session = null;
    throw new NotConnected();
  }
  return r;
}

/** The JSON-RPC result, from a JSON body or from the last `data:` message of an SSE stream. */
async function result(r: Response): Promise<unknown> {
  if (r.status === 202) return undefined;
  const raw = await r.text();
  if (!r.ok) throw new Error(`Magnific respondió ${r.status}: ${raw.slice(0, 200)}`);
  let msg: { result?: unknown; error?: { message?: string } } | undefined;
  if ((r.headers.get("content-type") ?? "").includes("text/event-stream")) {
    for (const block of raw.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data) continue;
      try {
        const m = JSON.parse(data) as typeof msg & { id?: number };
        if (m && ("result" in m || "error" in m)) msg = m;
      } catch {
        // keep-alive or partial event
      }
    }
  } else if (raw) {
    msg = JSON.parse(raw) as typeof msg;
  }
  if (msg?.error) throw new Error(msg.error.message ?? "Error de Magnific");
  return msg?.result;
}

/** URL that downloads a Magnific file through the relay (their CDN doesn't allow web pages). */
export const fileUrl = (url: string) => `/magnific/file?url=${encodeURIComponent(url)}`;
