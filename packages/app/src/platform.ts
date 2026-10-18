/**
 * What the renderer may use from the desktop shell. Mirrors the subset of
 * `apps/desktop/src/shared/api.ts` the app relies on; absent in a browser.
 */

export interface DesktopBridge {
  readonly version: string;
  readonly platform: "darwin" | "win32" | "linux";
  pickFolder(): Promise<string | null>;
  revealInFolder(path: string): Promise<void>;
  /** Older desktop builds lack it. */
  copyFile?(path: string): Promise<void>;
}

declare global {
  interface Window {
    sweetflow?: DesktopBridge;
  }
}

export const isDesktop = () => typeof window !== "undefined" && !!window.sweetflow;
