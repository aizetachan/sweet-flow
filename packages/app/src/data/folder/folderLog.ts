/**
 * An event log kept in several folders at once (docs/USUARIOS.md §2): the
 * team folder and each folder shared on its own with someone. Every place
 * holds `<base>/.sweetflow/<name>/<deviceId>/<YYYY-MM>.jsonl`; an event is
 * written to every place it concerns and read from every place this device
 * can reach. Events are identified by their stamp, so the same event found in
 * two places counts once.
 */

import type { Stamp } from "@sweetflow/domain";
import { joinPath, logFiles, type FolderFs } from "./fs";

export class FolderLog<E extends { at: Stamp }> {
  private events = new Map<Stamp, E>();
  /** Size and date of each file when last read: unchanged files aren't read again. */
  private seen = new Map<string, string>();
  /** This device's files as written: appending needs no read. */
  private own = new Map<string, string>();
  private bases: string[] = [""];

  constructor(
    private readonly fs: FolderFs,
    /** "library" or "team". */
    private readonly name: string,
    private readonly deviceId: string,
  ) {}

  /** Where the log is kept: "" (the folder this device opened) and shared folders inside it. */
  setBases(bases: string[]): void {
    this.bases = [...new Set(["", ...bases])];
  }

  dir(base: string): string {
    return joinPath(base, ".sweetflow", this.name);
  }

  all(): E[] {
    return [...this.events.values()];
  }

  has(at: Stamp): boolean {
    return this.events.has(at);
  }

  /** Keep events made here before they are written. */
  add(events: E[]): void {
    for (const e of events) this.events.set(e.at, e);
  }

  /** Reads what changed in every place; true when there were new events. */
  async read(): Promise<boolean> {
    let changed = false;
    for (const base of this.bases) {
      for (const f of await logFiles(this.fs, this.dir(base)).catch(() => [])) {
        if (this.seen.get(f.path) === f.sig) continue;
        const text = (await this.fs.readText(f.path)) ?? "";
        this.seen.set(f.path, f.sig);
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line) as E;
            if (typeof e.at !== "string" || this.events.has(e.at)) continue;
            this.events.set(e.at, e);
            changed = true;
          } catch {
            // A line still being written by the sync client: complete on the next read.
          }
        }
      }
    }
    return changed;
  }

  /** What the polling compares: every log file of every place. */
  async signature(): Promise<string> {
    const parts: string[] = [];
    for (const base of this.bases) for (const f of await logFiles(this.fs, this.dir(base)).catch(() => [])) parts.push(`${f.path}:${f.sig}`);
    return parts.join("|");
  }

  /** Writes events to this device's file of the month in one place. */
  async append(base: string, events: E[], now = Date.now()): Promise<void> {
    if (!events.length) return;
    const d = new Date(now);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const path = joinPath(this.dir(base), this.deviceId, `${month}.jsonl`);
    const current = this.own.get(path) ?? (await this.fs.readText(path)) ?? "";
    const text = current + events.map((e) => JSON.stringify(e) + "\n").join("");
    await this.fs.writeText(path, text);
    this.own.set(path, text);
  }

  /** Forget what was written when a place moves (its files are elsewhere now). */
  forgetPlace(base: string): void {
    const dir = this.dir(base);
    for (const k of [...this.own.keys()]) if (k.startsWith(`${dir}/`)) this.own.delete(k);
    for (const k of [...this.seen.keys()]) if (k.startsWith(`${dir}/`)) this.seen.delete(k);
  }
}
