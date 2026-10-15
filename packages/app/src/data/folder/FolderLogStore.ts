/**
 * A production's event log inside the team folder (docs/ARCHITECTURE.md §5.0):
 * `<production folder>/.sweetflow/log/<deviceId>/<YYYY-MM>.jsonl`.
 *
 * The production folder can change name or place (renamed or moved in the
 * dashboard), so its path is asked for on every operation.
 */

import type { LogStore } from "../local/store";
import { joinPath, type FolderFs } from "./fs";

const LOG_DIR = ".sweetflow/log";
/** How often to look for files other devices wrote (no file events through the API or the browser). */
export const POLL_MS = 2500;

export class FolderLogStore implements LogStore {
  /** Last read of each file, reused while its size and date don't change. */
  private cache = new Map<string, { sig: string; text: string }>();
  /** This device's files as written: appending needs no read. */
  private own = new Map<string, string>();

  constructor(
    private readonly fs: FolderFs,
    private readonly base: () => string | null,
  ) {}

  get label(): string {
    return joinPath(this.fs.label, this.base() ?? "");
  }

  async readAll(): Promise<string[]> {
    const files = await this.files();
    const out: string[] = [];
    for (const f of files) {
      const hit = this.cache.get(f.path);
      if (hit && hit.sig === f.sig) {
        out.push(hit.text);
        continue;
      }
      const text = (await this.fs.readText(f.path)) ?? "";
      this.cache.set(f.path, { sig: f.sig, text });
      out.push(text);
    }
    return out;
  }

  async append(path: string, text: string): Promise<void> {
    const base = this.base();
    if (base === null) throw new Error("No se encuentra la carpeta de la producción.");
    const full = joinPath(base, path);
    // Neither the browser nor the cloud APIs append: the device's file is written whole.
    const current = this.own.get(full) ?? (await this.fs.readText(full)) ?? "";
    const next = current + text;
    await this.fs.writeText(full, next);
    this.own.set(full, next);
  }

  watch(onChange: () => void): () => void {
    let last: string | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const sig = (await this.files()).map((f) => `${f.path}:${f.sig}`).join("|");
        if (last !== null && sig !== last) onChange();
        last = sig;
      } catch (err) {
        console.warn("[carpeta] no se pudo revisar el registro", err);
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }

  async destroy(): Promise<void> {
    const base = this.base();
    if (base !== null) await this.fs.remove(joinPath(base, LOG_DIR));
  }

  private async files(): Promise<Array<{ path: string; sig: string }>> {
    const base = this.base();
    if (base === null) return [];
    const dir = joinPath(base, LOG_DIR);
    const out: Array<{ path: string; sig: string }> = [];
    for (const device of await this.fs.list(dir)) {
      if (device.kind !== "dir") continue;
      for (const f of await this.fs.list(joinPath(dir, device.name))) {
        if (f.kind === "file" && f.name.endsWith(".jsonl")) out.push({ path: joinPath(dir, device.name, f.name), sig: `${f.size}:${f.modified}` });
      }
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  }
}
