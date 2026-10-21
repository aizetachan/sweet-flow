/**
 * The assistant's terminal (docs/INTERFAZ.md §0.2): the user's own shell,
 * running in a pseudo-terminal, shown by the renderer. It starts in the
 * assistant's folder (agent.ts), where Claude Code or Codex find what Sweet
 * Flow is and how to reach its connector. Each user signs in to their AI in
 * this shell, as in any terminal: the app never sees it.
 */

import { app, type WebContents } from "electron";
import { chmodSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { IPty } from "node-pty";
import { IPC } from "../shared/api";
import { prepareWorkspace, setAgentHost } from "./agent";

interface Session {
  pty: IPty;
  owner: WebContents;
}

const sessions = new Map<string, Session>();
let seq = 0;

/** node-pty, loaded on first use (a native module: only when a terminal opens). */
let ptyModule: typeof import("node-pty") | null = null;
function nodePty(): typeof import("node-pty") {
  if (ptyModule) return ptyModule;
  const req = createRequire(__filename);
  // Its macOS helper sometimes comes without the execute bit, and then no shell starts.
  if (process.platform === "darwin") {
    try {
      const dir = path.dirname(req.resolve("node-pty/package.json")).replace("app.asar", "app.asar.unpacked");
      const helper = path.join(dir, "prebuilds", `darwin-${process.arch}`, "spawn-helper");
      if ((statSync(helper).mode & 0o111) === 0) chmodSync(helper, 0o755);
    } catch {
      // Packaged with the bit already set (scripts/build.mjs).
    }
  }
  ptyModule = req("node-pty") as typeof import("node-pty");
  return ptyModule;
}

/** The environment of the shell: the user's, without Electron's, in UTF-8 with colours. */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  // Nor a Claude Code session's own settings, when the app was started from one.
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(ELECTRON_|CLAUDE_CODE|CLAUDECODE$)/.test(k)) env[k] = v;
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERM_PROGRAM = "Sweetflow";
  // Opened from the Finder, the app has no language: accents and symbols would break.
  if (!env.LANG) env.LANG = "es_ES.UTF-8";
  env.SWEETFLOW = "1";
  return env;
}

function shell(): { file: string; args: string[] } {
  if (process.platform === "win32") return { file: process.env.COMSPEC?.toLowerCase().includes("powershell") ? process.env.COMSPEC : "powershell.exe", args: ["-NoLogo"] };
  // A login shell: the same PATH as the user's own terminal (claude, codex…).
  return { file: process.env.SHELL || "/bin/zsh", args: ["-l"] };
}

export function openTerminal(owner: WebContents, cols: number, rows: number): { id: string; cwd: string } {
  const cwd = prepareWorkspace();
  const { file, args } = shell();
  const pty = nodePty().spawn(file, args, { name: "xterm-256color", cols: clamp(cols), rows: clamp(rows), cwd, env: shellEnv() });
  const id = `t${++seq}`;
  sessions.set(id, { pty, owner });
  // The window that opened it is the one the AI controls.
  setAgentHost(owner);
  pty.onData((data) => send(owner, IPC.termData, id, data));
  pty.onExit(({ exitCode }) => {
    sessions.delete(id);
    send(owner, IPC.termExit, id, exitCode);
  });
  watchOwner(owner);
  return { id, cwd };
}

/** To the window, if it is still there (a page reloading or gone can't take it). */
function send(owner: WebContents, channel: string, ...args: unknown[]): void {
  if (owner.isDestroyed()) return;
  try {
    owner.send(channel, ...args);
  } catch {
    // Its page is going away: closeOwned ends the session.
  }
}

/** A window's sessions end with its page: closed, reloaded or crashed (a new page opens its own). */
const watched = new WeakSet<WebContents>();
function watchOwner(owner: WebContents): void {
  if (watched.has(owner)) return;
  watched.add(owner);
  const closeOwned = () => {
    for (const [id, s] of sessions) if (s.owner === owner) closeTerminal(id);
  };
  owner.once("destroyed", closeOwned);
  owner.on("render-process-gone", closeOwned);
  owner.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeOwned();
  });
}

export function writeTerminal(owner: WebContents, id: string, data: string): void {
  const s = sessions.get(id);
  if (s && s.owner === owner) s.pty.write(data);
}

export function resizeTerminal(owner: WebContents, id: string, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (s && s.owner === owner) s.pty.resize(clamp(cols), clamp(rows));
}

export function closeTerminal(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try {
    s.pty.kill();
  } catch {
    // Already gone.
  }
}

const clamp = (n: number) => Math.max(2, Math.min(500, Math.floor(Number.isFinite(n) ? n : 80)));

app.on("before-quit", () => {
  for (const id of [...sessions.keys()]) closeTerminal(id);
});
