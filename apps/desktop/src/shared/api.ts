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
  /** The remembered team folder (read and written by the app itself, no permission to give again). */
  teamFolder(): Promise<TeamFolder | null>;
  /** Native picker; remembers the folder. Null if cancelled. */
  pickTeamFolder(): Promise<TeamFolder | null>;
  forgetTeamFolder(): Promise<void>;
  /** A file operation inside the team folder; paths relative to it. */
  folder(op: FolderOp, a?: string, b?: string | Uint8Array): Promise<unknown>;
}

export const IPC = {
  pickFolder: "sf:pick-folder",
  revealInFolder: "sf:reveal-in-folder",
  copyFile: "sf:copy-file",
  authRedirect: "sf:auth-redirect",
  authOpen: "sf:auth-open",
  teamFolder: "sf:team-folder",
  pickTeamFolder: "sf:pick-team-folder",
  forgetTeamFolder: "sf:forget-team-folder",
  folder: "sf:folder",
} as const;

/** Passed to the renderer through `additionalArguments` (preload is sandboxed). */
export const VERSION_ARG = "--sf-version=";

declare global {
  interface Window {
    sweetflow?: SweetflowApi;
  }
}
