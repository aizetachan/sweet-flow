/**
 * The assistant's chat (docs/INTERFAZ.md §0.2): each message runs the user's
 * own AI command line without its screen (Claude Code `-p`, Codex `exec`),
 * in the assistant's folder, with the app's connector. What it writes (JSON
 * events, one per line) goes to the chat window, which draws it. The next
 * message goes on with the same session of that AI.
 *
 * Permission prompts: Claude Code asks the connector's `approve` tool
 * (agent.ts) before anything not allowed yet; it comes here and the chat
 * shows the question. Conversations are kept per production in the
 * assistant's folder.
 */

import { app, ipcMain, type WebContents } from "electron";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { IPC, type ChatAi, type ChatSend } from "../shared/api";
import { assistantDir, connectorUrl, prepareWorkspace, READ_ONLY, setApprover } from "./agent";
import { isAppUrl } from "./env";

interface Run {
  child: ChildProcess;
  owner: WebContents;
}

const runs = new Map<string, Run>();
/** Permission questions waiting for the user. */
const asking = new Map<string, { conv: string; resolve: (ok: boolean) => void }>();
let askSeq = 0;

// ---------- finding the AI as the user's terminal does ----------

/** The user's PATH (an app opened from the Finder has a short one): read once from their login shell. */
let userPath: Promise<string> | null = null;
function loginPath(): Promise<string> {
  if (process.platform === "win32") return Promise.resolve(process.env.PATH ?? "");
  userPath ??= new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(shell, ["-lc", 'printf "%s" "$PATH"'], { timeout: 8000 }, (err, out) => resolve(err ? (process.env.PATH ?? "") : String(out).trim() || (process.env.PATH ?? "")));
  });
  return userPath;
}

const BIN: Record<ChatAi, string> = { claude: "claude", codex: "codex" };

/** The AI's program, if installed. */
async function findBin(ai: ChatAi): Promise<string | null> {
  const PATH = await loginPath();
  const names = process.platform === "win32" ? [`${BIN[ai]}.cmd`, `${BIN[ai]}.exe`, BIN[ai]] : [BIN[ai]];
  for (const dir of PATH.split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

async function childEnv(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(ELECTRON_|CLAUDE_CODE|CLAUDECODE$)/.test(k)) env[k] = v;
  env.PATH = await loginPath();
  if (!env.LANG) env.LANG = "es_ES.UTF-8";
  env.SWEETFLOW = "1";
  return env;
}

// ---------- running a message ----------

/** The connector for one conversation, as Claude Code reads it (a file: no quoting problems on Windows). */
function mcpFile(conv: string): string {
  const dir = path.join(assistantDir(), "chats", "mcp");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${conv}.json`);
  writeFileSync(file, JSON.stringify({ mcpServers: { sweetflow: { type: "http", url: connectorUrl(conv) } } }));
  return file;
}

function argsFor(req: ChatSend): string[] {
  if (req.ai === "claude") {
    return [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--mcp-config", mcpFile(req.conv),
      "--strict-mcp-config",
      "--permission-prompt-tool", "mcp__sweetflow__approve",
      "--allowedTools", READ_ONLY.map((t) => `mcp__sweetflow__${t}`).join(","),
      ...(req.permission === "auto" ? ["--permission-mode", "auto"] : []),
      ...(req.model ? ["--model", req.model] : []),
      ...(req.session ? ["--resume", req.session] : []),
    ];
  }
  // Codex: its own non-interactive mode, the connector given on the command line.
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "-c", `mcp_servers.sweetflow.url="${connectorUrl(req.conv)}"`,
    ...(req.permission === "auto" ? ["--full-auto"] : []),
    ...(req.model ? ["-m", req.model] : []),
    ...(req.session ? ["resume", req.session] : []),
    "-",
  ];
}

async function send(owner: WebContents, req: ChatSend): Promise<void> {
  if (runs.has(req.conv)) throw new Error("Esta conversación ya está trabajando.");
  const bin = await findBin(req.ai);
  if (!bin) throw new Error(req.ai === "claude" ? "No encuentro Claude Code en este ordenador. Instálalo y entra con tu cuenta en la terminal." : "No encuentro Codex en este ordenador. Instálalo y entra con tu cuenta en la terminal.");
  const cwd = prepareWorkspace();
  const child = spawn(bin, argsFor(req), { cwd, env: await childEnv(), shell: process.platform === "win32", windowsHide: true });
  runs.set(req.conv, { child, owner });
  // The message through its input: no length or quoting limits.
  child.stdin?.end(req.text);
  let buf = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("{")) continue;
      try {
        out(owner, IPC.chatEvent, req.conv, JSON.parse(line));
      } catch {
        // Not one of its events (a login shell's greeting…).
      }
    }
  });
  let err = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    err = (err + chunk).slice(-4000);
  });
  const done = (code: number | null) => {
    if (runs.get(req.conv)?.child !== child) return;
    runs.delete(req.conv);
    // Its questions die with it.
    for (const [id, a] of asking) if (a.conv === req.conv) (asking.delete(id), a.resolve(false));
    out(owner, IPC.chatExit, req.conv, code, err.trim());
  };
  child.on("error", (e) => {
    err += `\n${e.message}`;
    done(null);
  });
  child.on("close", (code) => done(code));
}

function stop(conv: string): void {
  const r = runs.get(conv);
  if (!r) return;
  r.child.kill("SIGINT");
  setTimeout(() => {
    if (runs.get(conv)?.child === r.child) r.child.kill("SIGTERM");
  }, 2500);
}

function out(owner: WebContents, channel: string, ...args: unknown[]): void {
  if (owner.isDestroyed()) return;
  try {
    owner.send(channel, ...args);
  } catch {
    // The window is going away.
  }
}

// ---------- conversations kept per production ----------

const chatsFile = (productionId: string) => {
  if (!/^[\w-]{1,128}$/.test(productionId)) throw new Error("Producción no válida");
  return path.join(assistantDir(), "chats", `${productionId}.json`);
};

export function startChat(): void {
  setApprover(
    (conv, req) =>
      new Promise((resolve) => {
        const r = runs.get(conv);
        if (!r || r.owner.isDestroyed()) return resolve(false);
        const id = `q${++askSeq}`;
        asking.set(id, { conv, resolve });
        out(r.owner, IPC.chatApprove, conv, id, req);
      }),
  );
  const trusted = (e: { senderFrame?: { url: string } | null }) => {
    if (!isAppUrl(e.senderFrame?.url ?? "")) throw new Error("IPC rejected");
  };
  ipcMain.handle(IPC.chatAvailable, async (e, ai: unknown) => (trusted(e), ai === "claude" || ai === "codex" ? !!(await findBin(ai)) : false));
  ipcMain.handle(IPC.chatSend, (e, req: ChatSend) => {
    trusted(e);
    if (!req || typeof req.conv !== "string" || !/^[\w-]{1,64}$/.test(req.conv) || (req.ai !== "claude" && req.ai !== "codex") || typeof req.text !== "string") throw new Error("Mensaje no válido");
    if (req.model && !/^[\w.:-]{1,64}$/.test(req.model)) throw new Error("Modelo no válido");
    if (req.session && !/^[\w-]{1,128}$/.test(req.session)) throw new Error("Sesión no válida");
    return send(e.sender, req);
  });
  ipcMain.on(IPC.chatStop, (e, conv: unknown) => {
    trusted(e);
    if (typeof conv === "string" && runs.get(conv)?.owner === e.sender) stop(conv);
  });
  ipcMain.on(IPC.chatAnswer, (e, id: unknown, allow: unknown) => {
    trusted(e);
    const a = typeof id === "string" ? asking.get(id) : undefined;
    if (!a || runs.get(a.conv)?.owner !== e.sender) return;
    asking.delete(id as string);
    a.resolve(allow === true);
  });
  ipcMain.handle(IPC.chatLoad, (e, productionId: unknown) => {
    trusted(e);
    const f = chatsFile(String(productionId));
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  });
  ipcMain.handle(IPC.chatSave, (e, productionId: unknown, data: unknown) => {
    trusted(e);
    if (typeof data !== "string" || data.length > 20_000_000) throw new Error("Datos no válidos");
    const f = chatsFile(String(productionId));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, data);
  });
  app.on("before-quit", () => {
    for (const conv of [...runs.keys()]) stop(conv);
  });
}
