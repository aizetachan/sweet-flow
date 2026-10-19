/**
 * Contract between the Electron main process and the renderer. The preload
 * exposes `SweetflowApi` as `window.sweetflow`; the main process answers the
 * IPC channels below. Renderer code must treat `window.sweetflow` as optional
 * (the same React app also runs in a plain browser).
 */

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
}

export const IPC = {
  pickFolder: "sf:pick-folder",
  revealInFolder: "sf:reveal-in-folder",
  copyFile: "sf:copy-file",
  authRedirect: "sf:auth-redirect",
  authOpen: "sf:auth-open",
} as const;

/** Passed to the renderer through `additionalArguments` (preload is sandboxed). */
export const VERSION_ARG = "--sf-version=";

declare global {
  interface Window {
    sweetflow?: SweetflowApi;
  }
}
