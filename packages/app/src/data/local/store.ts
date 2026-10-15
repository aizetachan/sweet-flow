/**
 * Where LocalSource keeps a production's event log (docs/ARCHITECTURE.md
 * §5.0). Paths are relative to the production folder, e.g.
 * `.sweetflow/log/<deviceId>/2026-10.jsonl` (see `logFilePath`).
 *
 * - Desktop: the production folder on disk, usually inside a shared Dropbox
 *   folder (phase 1, step 3).
 * - Browser: localStorage, to try LocalSource without Electron.
 * - Tests: memory.
 */

export interface LogStore {
  /** Human-readable location shown in the UI (folder path). */
  readonly label: string;
  /** Contents of every log file of every device. */
  readAll(): Promise<string[]>;
  /** Append text to one file, creating it if needed. Only ever this device's files. */
  append(path: string, text: string): Promise<void>;
  /** Called when files change from elsewhere (another device, via sync). */
  watch(onChange: () => void): () => void;
}

/** In-memory store; several LocalSources can share one to act as devices. */
export class MemoryLogStore implements LogStore {
  readonly label = "memoria";
  readonly files = new Map<string, string>();
  private listeners = new Set<() => void>();

  async readAll(): Promise<string[]> {
    return [...this.files.values()];
  }

  async append(path: string, text: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + text);
  }

  watch(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Simulates the sync client delivering changes to every watcher. */
  notify(): void {
    for (const l of this.listeners) l();
  }
}

/**
 * localStorage store for development in the browser. Each tab is its own
 * device, and the `storage` event tells a tab when another one wrote, so two
 * tabs behave like two people sharing a Dropbox folder.
 */
export class BrowserLogStore implements LogStore {
  readonly label: string;
  private readonly prefix: string;

  constructor(name: string) {
    this.label = `navegador · ${name}`;
    this.prefix = `sweetflow:${name}:`;
  }

  async readAll(): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) out.push(localStorage.getItem(key) ?? "");
    }
    return out;
  }

  async append(path: string, text: string): Promise<void> {
    const key = this.prefix + path;
    localStorage.setItem(key, (localStorage.getItem(key) ?? "") + text);
  }

  watch(onChange: () => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith(this.prefix)) onChange();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
}
