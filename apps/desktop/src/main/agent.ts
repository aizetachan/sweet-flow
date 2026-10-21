/**
 * The app's connector for AI assistants (docs/INTERFAZ.md §0.2): a Model
 * Context Protocol server on this computer only (127.0.0.1, with a key that
 * changes on every launch). Claude Code, Codex or any MCP client calls its
 * tools; each call goes to the main window (it asks for them: `serve`), which runs
 * it through the same DataSource as the interface: it shows live, it is in
 * the log as the user's, and ⌘Z undoes it.
 *
 * Also keeps the assistant's folder, where the terminal starts: what Sweet
 * Flow is (CLAUDE.md / AGENTS.md) and how to reach the connector (.mcp.json).
 */

import { app, ipcMain, type WebContents } from "electron";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { IPC, type AgentCall, type AgentResult, type AgentTool } from "../shared/api";
import { isAppUrl } from "./env";

const KEY = randomBytes(24).toString("hex");
let port = 0;
let host: WebContents | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>();
let seq = 0;


/** Asks the renderer (list the tools, or run one) and waits for its answer. */
function ask(call: AgentCall): Promise<unknown> {
  const wc = host;
  if (!wc || wc.isDestroyed()) return Promise.reject(new Error("La ventana principal de Sweetflow no está abierta."));
  const id = `c${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Sweetflow no ha respondido a tiempo."));
    }, 60_000);
    pending.set(id, { resolve, timer });
    wc.send(IPC.agentCall, id, call);
  });
}

// ---------- MCP over HTTP (JSON answers, no streams) ----------

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

async function handle(req: RpcRequest): Promise<unknown> {
  switch (req.method) {
    case "initialize": {
      const asked = typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : "";
      return {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "sweetflow", title: "Sweetflow", version: app.getVersion() },
        instructions: "Herramientas de Sweetflow: leen y cambian la producción abierta en la app, como lo haría el usuario. Empieza por get_context.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: (await ask({ kind: "list" })) as AgentTool[] };
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const r = (await ask({ kind: "call", name, args })) as AgentResult;
        return { content: [{ type: "text", text: r.text }], isError: !!r.isError };
      } catch (e) {
        return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Método desconocido: ${req.method}`), { code: -32601 });
  }
}

function authorized(req: IncomingMessage): boolean {
  const got = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(KEY);
  // Pages in a browser can't call it: no Origin is accepted (only programs on this computer).
  return !req.headers.origin && got.length === want.length && timingSafeEqual(got, want);
}

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) return void res.writeHead(401).end();
  if (req.url?.split("?")[0] !== "/mcp") return void res.writeHead(404).end();
  if (req.method === "DELETE") return void res.writeHead(200).end();
  if (req.method !== "POST") return void res.writeHead(405, { Allow: "POST" }).end();
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let body: RpcRequest | RpcRequest[];
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as RpcRequest | RpcRequest[];
  } catch {
    return void res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido" } }));
  }
  const list = Array.isArray(body) ? body : [body];
  const answers = await Promise.all(
    list.map(async (r) => {
      // Notifications (no id) get no answer.
      if (r.id === undefined || r.id === null) return null;
      try {
        return { jsonrpc: "2.0", id: r.id, result: await handle(r) };
      } catch (e) {
        const err = e as Error & { code?: number };
        return { jsonrpc: "2.0", id: r.id, error: { code: err.code ?? -32603, message: err.message } };
      }
    }),
  );
  const out = answers.filter(Boolean);
  if (!out.length) return void res.writeHead(202).end();
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(Array.isArray(body) ? out : out[0]));
}

/** Starts the connector (with the app) and takes the renderer's answers. */
export function startAgent(): void {
  const server = createServer((req, res) => {
    onRequest(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  server.listen(0, "127.0.0.1", () => {
    port = (server.address() as AddressInfo).port;
  });
  // The main window (with the production open) runs the tools; the terminal has its own window.
  ipcMain.on(IPC.agentServe, (e) => {
    if (isAppUrl(e.senderFrame?.url ?? "")) host = e.sender;
  });
  ipcMain.on(IPC.agentReply, (e, id: unknown, result: unknown) => {
    if (e.sender !== host || typeof id !== "string") return;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(result);
  });
  app.on("before-quit", () => server.close());
}

// ---------- the assistant's folder ----------

/** The tools that only read: Claude Code uses them without asking. The rest ask first. */
const READ_ONLY = ["get_context", "list_productions", "get_tree", "get_node", "navigate"];

/** Writes the assistant's folder (again on every terminal: the key changes with each launch). */
export function prepareWorkspace(): string {
  const dir = path.join(app.getPath("userData"), "Asistente");
  mkdirSync(path.join(dir, ".claude"), { recursive: true });
  const url = `http://127.0.0.1:${port}/mcp`;
  writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { sweetflow: { type: "http", url, headers: { Authorization: `Bearer ${KEY}` } } } }, null, 2));
  // Local settings (this computer's): the connector is approved, and its read-only tools need no confirmation.
  writeFileSync(
    path.join(dir, ".claude", "settings.local.json"),
    JSON.stringify({ enabledMcpjsonServers: ["sweetflow"], permissions: { allow: READ_ONLY.map((t) => `mcp__sweetflow__${t}`) } }, null, 2),
  );
  writeFileSync(path.join(dir, "CLAUDE.md"), CONTEXT);
  writeFileSync(path.join(dir, "AGENTS.md"), CONTEXT);
  return dir;
}

const CONTEXT = `# Sweetflow — asistente

Estás dentro de **Sweetflow**, una herramienta de producción audiovisual para
piezas largas (series, películas, spots). Esta terminal está abierta desde la
propia app, y la app te da un conector (**sweetflow**, por MCP) para leer y
cambiar la producción abierta como lo haría el usuario.

## Cómo es una producción

- Un **árbol de niveles**, normalmente Escena › Secuencia › Plano (cada
  producción define los suyos). Cada nodo tiene un **código** (SC010, SQ010,
  SH0010…) que sale de su nivel y su número, un título, notas, un **estado**
  (Pendiente, En curso, Aprobado… definidos por la producción) y personas
  asignadas.
- Los **planos** (el último nivel) tienen **versiones**: imágenes y vídeos,
  generados o importados. Una de ellas es la elegida.
- **Comentarios** sobre un nodo o una versión.
- Tres vistas: **Biblioteca** (personajes, espacios, props, estilos),
  **Producción** (el tablero con el árbol) y **Editor** (el montaje en una
  línea de tiempo, por nivel).

## Cómo trabajar

- Usa **solo las herramientas de sweetflow** para leer o cambiar la
  producción. **No** leas ni edites a mano los archivos de la carpeta del
  equipo (registros de eventos, vídeos): la app los sincroniza entre personas
  y se romperían.
- Empieza por \`get_context\` (qué hay abierto y quién eres) y \`get_tree\`.
- Para nombrar un nodo vale su id, su código (\`SH0010\`), su ruta de códigos
  (\`SC010/SQ010/SH0010\`) o su título exacto.
- Todo lo que cambias se ve al momento en la app, queda en el registro como
  hecho por el usuario y se deshace con ⌘Z (o con la herramienta \`undo\`).
- Antes de mandar cosas a la papelera o de cambios grandes, confírmalo con el
  usuario.
- Responde en **español**, breve.
`;
