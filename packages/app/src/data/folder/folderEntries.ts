/**
 * The dashboard (folders and productions) inside the team folder.
 *
 * - **State:** an event log per device, like a production's (docs/ARCHITECTURE.md
 *   §5.0), in `.sweetflow/library/<deviceId>/<YYYY-MM>.jsonl`. Per entry and
 *   field, the last write wins; a deleted entry stays deleted.
 * - **Folders on disk:** a projection of that state. Each dashboard folder and
 *   each production is a real folder named with `entryFolderNames()`; the
 *   device that renames or moves an entry moves its folder, and the sync
 *   carries it to everyone else.
 */

import {
  entryFolderNames,
  formatStamp,
  hlcObserve,
  hlcTick,
  parseStamp,
  ZERO_HLC,
  type Hlc,
  type Id,
  type Stamp,
} from "@sweetflow/domain";
import type { LibraryEntry } from "../library";
import { joinPath, type FolderFs } from "./fs";
import { POLL_MS } from "./FolderLogStore";

const LIB_DIR = ".sweetflow/library";
const VERSION = 1;

type EntryPatch = Partial<Omit<LibraryEntry, "id" | "trashedAt">> & { trashedAt?: number | null };

export type LibraryEvent =
  | { v: number; at: Stamp; userId: Id; type: "entry"; id: Id; patch: EntryPatch }
  | { v: number; at: Stamp; userId: Id; type: "entry.deleted"; id: Id };

/** Entries from events of any number of devices, in any order. Deterministic. */
export function foldLibrary(events: Iterable<LibraryEvent>): LibraryEntry[] {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const byId = new Map<Id, Partial<LibraryEntry> & { id: Id }>();
  const deleted = new Set<Id>();
  for (const e of sorted) {
    if (deleted.has(e.id)) continue;
    if (e.type === "entry.deleted") {
      deleted.add(e.id);
      byId.delete(e.id);
      continue;
    }
    const cur = byId.get(e.id) ?? { id: e.id };
    const next: Partial<LibraryEntry> & { id: Id } = { ...cur };
    for (const [k, v] of Object.entries(e.patch)) {
      // null clears `trashedAt` (restored); for `parentId` it is a value (top level).
      if (v === null && k === "trashedAt") delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    byId.set(e.id, next);
  }
  const complete = [...byId.values()].filter((e): e is LibraryEntry => !!e.kind && typeof e.name === "string" && e.createdAt !== undefined);
  // A parent deleted by someone else while this was created in it: show it at the top.
  const ids = new Set(complete.map((e) => e.id));
  return complete.map((e) => (e.parentId && !ids.has(e.parentId) ? { ...e, parentId: null } : e));
}

/** Folder path of every entry, from its parents' names. */
export function entryPaths(entries: LibraryEntry[]): Map<Id, string> {
  const byParent = new Map<Id | null, LibraryEntry[]>();
  for (const e of entries) byParent.set(e.parentId, [...(byParent.get(e.parentId) ?? []), e]);
  const out = new Map<Id, string>();
  const walk = (parentId: Id | null, base: string, depth: number) => {
    if (depth > 64) return;
    const kids = byParent.get(parentId) ?? [];
    const names = entryFolderNames(kids);
    for (const k of kids) {
      const path = joinPath(base, names.get(k.id)!);
      out.set(k.id, path);
      walk(k.id, path, depth + 1);
    }
  };
  walk(null, "", 0);
  return out;
}

const FIELDS = ["kind", "name", "parentId", "createdAt", "updatedAt", "trashedAt"] as const;

function diff(prev: LibraryEntry | undefined, next: LibraryEntry): EntryPatch | null {
  const patch: EntryPatch = {};
  for (const f of FIELDS) {
    const a = prev?.[f];
    const b = next[f];
    if (a !== b) (patch as Record<string, unknown>)[f] = b === undefined ? null : b;
  }
  return Object.keys(patch).length ? patch : null;
}

export class FolderEntries {
  private events = new Map<Stamp, LibraryEvent>();
  private entries: LibraryEntry[] = [];
  private clock: Hlc = ZERO_HLC;
  /** This device's library file as written. */
  private own = new Map<string, string>();
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly fs: FolderFs,
    private readonly deviceId: Id,
    private readonly userId: () => Id,
  ) {}

  /** Reads the log; call (and await) before using the entries. */
  async init(): Promise<void> {
    await this.read();
    this.poll();
  }

  load(): LibraryEntry[] {
    return this.entries;
  }

  /** Records what changed and projects it onto the folders on disk. */
  save(next: LibraryEntry[]): void {
    const prev = this.entries;
    const prevById = new Map(prev.map((e) => [e.id, e]));
    const nextIds = new Set(next.map((e) => e.id));
    const bodies: Array<{ type: "entry"; id: Id; patch: EntryPatch } | { type: "entry.deleted"; id: Id }> = [];
    for (const e of next) {
      const patch = diff(prevById.get(e.id), e);
      if (patch) bodies.push({ type: "entry", id: e.id, patch });
    }
    for (const e of prev) if (!nextIds.has(e.id)) bodies.push({ type: "entry.deleted", id: e.id });
    if (!bodies.length) return;

    const now = Date.now();
    const fresh: LibraryEvent[] = bodies.map((b) => {
      this.clock = hlcTick(this.clock, now);
      return { ...b, v: VERSION, at: formatStamp(this.clock, this.deviceId), userId: this.userId() } as LibraryEvent;
    });
    for (const e of fresh) this.events.set(e.at, e);
    this.entries = foldLibrary(this.events.values());

    const current = this.entries;
    const before = entryPaths(prev);
    const after = entryPaths(current);
    this.writing = this.writing
      .then(() => this.project(prev, current, before, after))
      .then(() => this.append(fresh, now))
      .catch((err) => console.error("[carpeta] no se pudo guardar el dashboard", err));
  }

  /** Path of an entry's folder, from the current state. */
  pathOf(id: Id): string | null {
    return entryPaths(this.entries).get(id) ?? null;
  }

  /** Waits for pending writes (tests, and before leaving). */
  flushed(): Promise<void> {
    return this.writing;
  }

  watch(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---------- internals ----------

  /** Creates, renames, moves and removes folders so the disk matches `next`. */
  private async project(prev: LibraryEntry[], next: LibraryEntry[], before: Map<Id, string>, after: Map<Id, string>): Promise<void> {
    const nextById = new Map(next.map((e) => [e.id, e]));
    const prevById = new Map(prev.map((e) => [e.id, e]));
    const depth = (e: LibraryEntry) => {
      let d = 0;
      for (let p = e.parentId ? nextById.get(e.parentId) : undefined; p && d < 64; p = p.parentId ? nextById.get(p.parentId) : undefined) d++;
      return d;
    };
    // Removed for good.
    for (const e of prev) if (!nextById.has(e.id) && !prev.some((p) => p.id === e.parentId && !nextById.has(p.id))) await this.fs.remove(before.get(e.id)!);
    // New, renamed or moved: parents first. Where an entry is now = where its old parent is now + its old folder name.
    const sorted = [...next].sort((a, b) => depth(a) - depth(b));
    for (const e of sorted) {
      const to = after.get(e.id)!;
      const old = before.get(e.id);
      if (!prevById.has(e.id) || old === undefined) {
        await this.fs.mkdir(to);
        if (e.kind === "production") await this.fs.writeText(joinPath(to, ".sweetflow/production.json"), JSON.stringify({ id: e.id, name: e.name }, null, 2) + "\n");
        continue;
      }
      const oldName = old.slice(old.lastIndexOf("/") + 1);
      // Its old parent has already been put in place (parents go first).
      const oldParent = prevById.get(e.id)!.parentId;
      const parentNow = oldParent ? after.get(oldParent) ?? before.get(oldParent) ?? "" : "";
      const now = joinPath(parentNow, oldName);
      if (now !== to) await this.fs.move(now, to);
    }
  }

  private async append(fresh: LibraryEvent[], now: number): Promise<void> {
    const d = new Date(now);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const path = joinPath(LIB_DIR, this.deviceId, `${month}.jsonl`);
    const current = this.own.get(path) ?? (await this.fs.readText(path)) ?? "";
    const text = current + fresh.map((e) => JSON.stringify(e) + "\n").join("");
    await this.fs.writeText(path, text);
    this.own.set(path, text);
  }

  private async read(): Promise<boolean> {
    let changed = false;
    for (const device of await this.fs.list(LIB_DIR)) {
      if (device.kind !== "dir") continue;
      for (const f of await this.fs.list(joinPath(LIB_DIR, device.name))) {
        if (f.kind !== "file" || !f.name.endsWith(".jsonl")) continue;
        const text = (await this.fs.readText(joinPath(LIB_DIR, device.name, f.name))) ?? "";
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line) as LibraryEvent;
            if (typeof e.at !== "string" || !parseStamp(e.at) || this.events.has(e.at)) continue;
            this.events.set(e.at, e);
            changed = true;
          } catch {
            // A line being written by the sync client: it will be complete on the next read.
          }
        }
      }
    }
    if (changed) {
      this.entries = foldLibrary(this.events.values());
      const last = [...this.events.keys()].sort().at(-1);
      const seen = last ? parseStamp(last) : null;
      if (seen) this.clock = hlcObserve(this.clock, seen.clock, Date.now());
    }
    return changed;
  }

  private poll(): void {
    let last = "";
    const tick = async () => {
      try {
        const sig: string[] = [];
        for (const device of await this.fs.list(LIB_DIR)) {
          if (device.kind !== "dir") continue;
          for (const f of await this.fs.list(joinPath(LIB_DIR, device.name))) sig.push(`${device.name}/${f.name}:${f.size}:${f.modified}`);
        }
        const s = sig.sort().join("|");
        if (s !== last) {
          last = s;
          if (await this.read()) for (const l of this.listeners) l();
        }
      } catch (err) {
        console.warn("[carpeta] no se pudo revisar el dashboard", err);
      }
      setTimeout(tick, POLL_MS);
    };
    setTimeout(tick, POLL_MS);
  }
}
