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
  /** Sign-in through the system browser (older desktop builds lack it). */
  authRedirect?(path: string): Promise<string>;
  authOpen?(url: string): Promise<string>;
  /** Google's token request with the app's secret added (older desktop builds lack it). */
  googleToken?(body: string): Promise<{ status: number; body: string }>;
  /** The team folder, read and written by the app (older desktop builds lack it). */
  teamFolder?(): Promise<{ path: string; name: string } | null>;
  pickTeamFolder?(): Promise<{ path: string; name: string } | null>;
  forgetTeamFolder?(): Promise<void>;
  /** The theme's accent (null: the corporate blue): the icon's frame takes it (older desktop builds lack it). */
  setAccent?(accent: string | null): Promise<void>;
  /** The assistant's terminal and the connector's requests (older desktop builds lack them). */
  terminal?: {
    open(cols: number, rows: number): Promise<{ id: string; cwd: string }>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    close(id: string): void;
    onData(cb: (id: string, data: string) => void): () => void;
    onExit(cb: (id: string, code: number) => void): () => void;
  };
  agent?: {
    serve?(): void;
    openWindow?(): Promise<void>;
    onCall(cb: (id: string, call: { kind: "list" } | { kind: "call"; name: string; args: Record<string, unknown> }) => void): () => void;
    reply(id: string, result: { text: string; isError?: boolean } | Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>): void;
  };
  folder?(op: "list" | "listFiles" | "readText" | "readBytes" | "writeText" | "writeBytes" | "mkdir" | "move" | "remove", a?: string, b?: string | Uint8Array): Promise<unknown>;
}

/** Desktop app: sign-ins open in the system browser and come back to a loopback address. */
export function desktopAuth(): { redirect(path: string): Promise<string>; open(url: string): Promise<string> } | null {
  const d = typeof window !== "undefined" ? window.sweetflow : undefined;
  if (!d?.authRedirect || !d.authOpen) return null;
  return { redirect: (p) => d.authRedirect!(p), open: (u) => d.authOpen!(u) };
}

declare global {
  interface Window {
    sweetflow?: DesktopBridge;
  }
}

export const isDesktop = () => typeof window !== "undefined" && !!window.sweetflow;
