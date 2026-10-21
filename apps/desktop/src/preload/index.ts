/**
 * Sandboxed preload: the only bridge between the renderer and the main
 * process. Exposes a minimal typed API as `window.sweetflow`.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, VERSION_ARG, type AgentCall, type AgentContext, type SweetflowApi, type TeamFolder } from "../shared/api";

const versionArg = process.argv.find((a) => a.startsWith(VERSION_ARG));

const api: SweetflowApi = {
  version: versionArg ? versionArg.slice(VERSION_ARG.length) : "0.0.0",
  platform: process.platform as SweetflowApi["platform"],
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<string | null>,
  revealInFolder: (path) => ipcRenderer.invoke(IPC.revealInFolder, path) as Promise<void>,
  copyFile: (path) => ipcRenderer.invoke(IPC.copyFile, path) as Promise<void>,
  authRedirect: (path) => ipcRenderer.invoke(IPC.authRedirect, path) as Promise<string>,
  authOpen: (url) => ipcRenderer.invoke(IPC.authOpen, url) as Promise<string>,
  googleToken: (body) => ipcRenderer.invoke(IPC.googleToken, body) as Promise<{ status: number; body: string }>,
  teamFolder: () => ipcRenderer.invoke(IPC.teamFolder) as Promise<TeamFolder | null>,
  pickTeamFolder: () => ipcRenderer.invoke(IPC.pickTeamFolder) as Promise<TeamFolder | null>,
  forgetTeamFolder: () => ipcRenderer.invoke(IPC.forgetTeamFolder) as Promise<void>,
  folder: (op, a, b) => ipcRenderer.invoke(IPC.folder, op, a, b),
  setAccent: (accent) => ipcRenderer.invoke(IPC.setAccent, accent) as Promise<void>,
  terminal: {
    open: (cols, rows) => ipcRenderer.invoke(IPC.termOpen, cols, rows) as Promise<{ id: string; cwd: string }>,
    write: (id, data) => ipcRenderer.send(IPC.termWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.termResize, id, cols, rows),
    close: (id) => ipcRenderer.send(IPC.termClose, id),
    onData: (cb) => listen(IPC.termData, (id: string, data: string) => cb(id, data)),
    onExit: (cb) => listen(IPC.termExit, (id: string, code: number) => cb(id, code)),
  },
  chat: {
    available: (ai) => ipcRenderer.invoke(IPC.chatAvailable, ai) as Promise<boolean>,
    send: (req) => ipcRenderer.invoke(IPC.chatSend, req) as Promise<void>,
    stop: (conv) => ipcRenderer.send(IPC.chatStop, conv),
    onEvent: (cb) => listen(IPC.chatEvent, (conv: string, ev: unknown) => cb(conv, ev)),
    onExit: (cb) => listen(IPC.chatExit, (conv: string, code: number | null, err: string) => cb(conv, code, err)),
    onApprove: (cb) => listen(IPC.chatApprove, (conv: string, id: string, req: { tool_name: string; input: Record<string, unknown> }) => cb(conv, id, req)),
    answer: (id, allow) => ipcRenderer.send(IPC.chatAnswer, id, allow),
    load: (productionId) => ipcRenderer.invoke(IPC.chatLoad, productionId) as Promise<string | null>,
    save: (productionId, data) => ipcRenderer.invoke(IPC.chatSave, productionId, data) as Promise<void>,
  },
  agent: {
    serve: () => ipcRenderer.send(IPC.agentServe),
    context: (ctx) => ipcRenderer.send(IPC.agentContext, ctx),
    getContext: () => ipcRenderer.invoke(IPC.agentGetContext) as Promise<AgentContext | null>,
    onContext: (cb) => listen(IPC.agentContextChanged, (ctx: AgentContext | null) => cb(ctx)),
    goto: (node) => ipcRenderer.invoke(IPC.agentGoto, node) as Promise<void>,
    openWindow: () => ipcRenderer.invoke(IPC.agentWindow) as Promise<void>,
    onCall: (cb) => listen(IPC.agentCall, (id: string, call: AgentCall) => cb(id, call)),
    reply: (id, result) => ipcRenderer.send(IPC.agentReply, id, result),
  },
};

/** Listens to a channel from the main process; returns how to stop. */
function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const fn = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, fn);
  return () => void ipcRenderer.removeListener(channel, fn);
}

contextBridge.exposeInMainWorld("sweetflow", api);
