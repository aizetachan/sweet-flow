/**
 * Contract between the Electron main process and the renderer. The preload
 * exposes `SweetflowApi` as `window.sweetflow`; the main process answers the
 * IPC channels below. Renderer code must treat `window.sweetflow` as optional
 * (the same React app also runs in a plain browser).
 */

/** The team folder chosen in the desktop app. */
export interface TeamFolder {
  path: string;
  name: string;
}

export interface FolderEntry {
  name: string;
  kind: "file" | "dir";
  size?: number;
  modified?: number;
}

export type FolderOp = "list" | "listFiles" | "readText" | "readBytes" | "writeText" | "writeBytes" | "mkdir" | "move" | "remove";

export interface SweetflowApi {
  /** App version (package.json of the desktop shell). */
  readonly version: string;
  readonly platform: "darwin" | "win32" | "linux";
  /** Native folder picker. Resolves to the chosen absolute path, or null if cancelled. */
  pickFolder(): Promise<string | null>;
  /** Shows a file or folder in Finder / Explorer. */
  revealInFolder(path: string): Promise<void>;
  /** Puts a file on the system clipboard, as Finder / Explorer copy does, to paste it in another app. */
  copyFile(path: string): Promise<void>;
  /** Sign-in: starts listening on a loopback address for `path`; returns it as the redirect URI. */
  authRedirect(path: string): Promise<string>;
  /** Opens the sign-in page in the system browser; resolves with the callback's query string. */
  authOpen(url: string): Promise<string>;
  /** Google's token request (form body); the app's client secret is added by the main process. */
  googleToken(body: string): Promise<{ status: number; body: string }>;
  /** The remembered team folder (read and written by the app itself, no permission to give again). */
  teamFolder(): Promise<TeamFolder | null>;
  /** Native picker; remembers the folder. Null if cancelled. */
  pickTeamFolder(): Promise<TeamFolder | null>;
  forgetTeamFolder(): Promise<void>;
  /** The theme's accent (null: the corporate blue): the icon's frame takes it while the app runs. */
  setAccent(accent: string | null): Promise<void>;
  /** A file operation inside the team folder; paths relative to it. */
  folder(op: FolderOp, a?: string, b?: string | Uint8Array): Promise<unknown>;
  /** The assistant's terminal (docs/INTERFAZ.md §0.2): a real shell inside the app. */
  terminal: TerminalApi;
  /** The other side of the app's connector: the AI's requests, answered by the renderer. */
  agent: AgentApi;
}

/** A terminal session: the user's own shell, in the assistant's folder. */
export interface TerminalApi {
  open(cols: number, rows: number): Promise<{ id: string; cwd: string }>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  close(id: string): void;
  /** Output of a session; returns a function that stops listening. */
  onData(cb: (id: string, data: string) => void): () => void;
  onExit(cb: (id: string, code: number) => void): () => void;
}

/** A request of the connector, to run in the renderer. */
export type AgentCall = { kind: "list" } | { kind: "call"; name: string; args: Record<string, unknown> };

/** What a tool answers: text for the AI, and whether it failed. */
export interface AgentResult {
  text: string;
  isError?: boolean;
}

/** A tool of the connector, as the renderer describes it. */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentApi {
  /** This window runs the connector's requests (the main one: it has the production open). */
  serve(): void;
  /** Opens the assistant's own window, or brings it to the front. */
  openWindow(): Promise<void>;
  /** The requests, once this window serves them. */
  onCall(cb: (id: string, call: AgentCall) => void): () => void;
  reply(id: string, result: AgentResult | AgentTool[]): void;
}

export const IPC = {
  pickFolder: "sf:pick-folder",
  revealInFolder: "sf:reveal-in-folder",
  copyFile: "sf:copy-file",
  authRedirect: "sf:auth-redirect",
  authOpen: "sf:auth-open",
  googleToken: "sf:google-token",
  teamFolder: "sf:team-folder",
  pickTeamFolder: "sf:pick-team-folder",
  forgetTeamFolder: "sf:forget-team-folder",
  folder: "sf:folder",
  setAccent: "sf:set-accent",
  termOpen: "sf:term-open",
  termWrite: "sf:term-write",
  termResize: "sf:term-resize",
  termClose: "sf:term-close",
  termData: "sf:term-data",
  termExit: "sf:term-exit",
  agentCall: "sf:agent-call",
  agentReply: "sf:agent-reply",
  agentServe: "sf:agent-serve",
  agentWindow: "sf:agent-window",
} as const;

/** Passed to the renderer through `additionalArguments` (preload is sandboxed). */
export const VERSION_ARG = "--sf-version=";

declare global {
  interface Window {
    sweetflow?: SweetflowApi;
  }
}
