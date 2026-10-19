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
 * - **Shared on their own** (docs/USUARIOS.md §2): a folder or production
 *   shared with someone who doesn't have the whole team folder keeps its own
 *   copy of the log (`<its folder>/.sweetflow/library/`) and a
 *   `.sweetflow/share.json` that says which entry it is. Every change is
 *   written to the team folder and to each shared folder it falls in. Opening
 *   a shared folder shows only what is inside it, with the folder itself at
 *   the top.
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
import { FolderLog } from "./folderLog";
import { POLL_MS } from "./FolderLogStore";

const SHARE_FILE = ".sweetflow/share.json";
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

/**
 * Folder path of every entry, from its parents' names. With `rootId` (a
 * shared folder opened on its own), that entry is the folder itself ("") and
 * only what is inside it has a path.
 */
export function entryPaths(entries: LibraryEntry[], rootId: Id | null = null): Map<Id, string> {
  const byParent = new Map<Id | null, LibraryEntry[]>();
  for (const e of entries) byParent.set(e.parentId, [...(byParent.get(e.parentId) ?? []), e]);
  const out = new Map<Id, string>();
  if (rootId) out.set(rootId, "");
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
  walk(rootId, "", 0);
  return out;
}

/** Whether `inner` is `outer` or inside it. */
export function entryWithin(entries: LibraryEntry[], inner: Id, outer: Id): boolean {
  const byId = new Map(entries.map((e) => [e.id, e]));
  let cur: Id | null | undefined = inner;
  for (let d = 0; cur && d < 64; d++) {
    if (cur === outer) return true;
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

/**
 * Opening a team folder: the dashboard says where the shared folders are and
 * the team says which ones are shared, so read both until nothing new comes
 * in. Then give new shared folders their copies, and claim a folder nobody
 * owns.
 */
export async function openDashboard(lib: FolderEntries, team: { init(): Promise<void>; reread(): Promise<boolean>; refold(): void; syncShares(): Promise<void>; claimIfNeeded(): void }): Promise<void> {
  await team.init();
  for (let i = 0; i < 4; i++) {
    const a = await lib.reread();
    const b = await team.reread();
    team.refold();
    if (!a && !b) break;
  }
  await lib.syncShares();
  await team.syncShares();
  team.claimIfNeeded();
}

/** What `.sweetflow/share.json` says: which dashboard entry a shared folder is. */
export interface ShareInfo {
  v: number;
  entryId: Id;
  name: string;
  kind: LibraryEntry["kind"];
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
  private log: FolderLog<LibraryEvent>;
  /** Everything known (all places). */
  private all: LibraryEntry[] = [];
  /** What this device works with: everything, or the shared folder it opened. */
  private entries: LibraryEntry[] = [];
  private clock: Hlc = ZERO_HLC;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  /** The shared folder this device opened, when it is not the whole team folder. */
  private root: ShareInfo | null = null;
  /** Shared folders whose copy of the log this device has checked. */
  private seeded = new Set<Id>();

  constructor(
    private readonly fs: FolderFs,
    private readonly deviceId: Id,
    private readonly userId: () => Id,
    /** Dashboard entries shared on their own (from the team). */
    private readonly shareRoots: () => Id[] = () => [],
  ) {
    this.log = new FolderLog(fs, "library", deviceId);
  }

  /** Reads the log; call (and await) before using the entries. */
  async init(): Promise<void> {
    const share = await this.fs.readText(SHARE_FILE).catch(() => null);
    if (share) {
      try {
        this.root = JSON.parse(share) as ShareInfo;
      } catch {
        // Not readable yet (still syncing): open it as a team folder.
      }
    }
    await this.read();
    // Now that the dashboard is known, read the shared folders' copies too.
    if (this.sharedPlaces().length) await this.read();
  }

  /** The shared folder opened, when this device doesn't have the whole team folder. */
  get mounted(): ShareInfo | null {
    return this.root;
  }

  load(): LibraryEntry[] {
    return this.entries;
  }

  /** Whether `inner` is `outer` or inside it (everything known). */
  within(inner: Id, outer: Id): boolean {
    return entryWithin(this.all, inner, outer);
  }

  /** Records what changed and projects it onto the folders on disk. */
  save(next: LibraryEntry[]): void {
    const prev = this.entries;
    const prevById = new Map(prev.map((e) => [e.id, e]));
    const nextIds = new Set(next.map((e) => e.id));
    const bodies: Array<{ type: "entry"; id: Id; patch: EntryPatch } | { type: "entry.deleted"; id: Id }> = [];
    for (const e of next) {
      // The shared folder opened is at the top here, but stays where it is for everyone else.
      const was = prevById.get(e.id);
      const real = (x: LibraryEntry | undefined) => (x && this.root?.entryId === x.id ? { ...x, parentId: this.all.find((y) => y.id === x.id)?.parentId ?? null } : x);
      const patch = diff(real(was), real(e)!);
      if (patch) bodies.push({ type: "entry", id: e.id, patch });
    }
    for (const e of prev) if (!nextIds.has(e.id)) bodies.push({ type: "entry.deleted", id: e.id });
    if (!bodies.length) return;

    const now = Date.now();
    const fresh: LibraryEvent[] = bodies.map((b) => {
      this.clock = hlcTick(this.clock, now);
      return { ...b, v: VERSION, at: formatStamp(this.clock, this.deviceId), userId: this.userId() } as LibraryEvent;
    });
    const allBefore = this.all;
    this.log.add(fresh);
    this.refold();

    const current = this.entries;
    const before = entryPaths(prev, this.root?.entryId);
    const after = entryPaths(current, this.root?.entryId);
    const allAfter = this.all;
    this.writing = this.writing
      .then(() => this.project(prev, current, before, after))
      .then(() => this.write(fresh, allBefore, allAfter, now))
      .then(() => this.syncShares())
      .catch((err) => console.error("[carpeta] no se pudo guardar el dashboard", err));
  }

  /** Path of an entry's folder, from the current state. */
  pathOf(id: Id): string | null {
    return entryPaths(this.entries, this.root?.entryId).get(id) ?? null;
  }

  /** Where the logs of an entry go: here, and every shared folder (reachable from here) it is in. */
  placesFor(ids: Id[], lists: LibraryEntry[][] = [this.all]): string[] {
    const paths = entryPaths(this.entries, this.root?.entryId);
    const out = new Set<string>([""]);
    for (const r of this.shareRoots()) {
      if (r === this.root?.entryId) continue;
      const path = paths.get(r);
      if (path === undefined) continue;
      if (ids.some((id) => lists.some((l) => entryWithin(l, id, r) || entryWithin(l, r, id)))) out.add(path);
    }
    return [...out];
  }

  /** Every shared folder reachable from here, with its path. */
  sharedPlaces(): Array<{ id: Id; path: string }> {
    const paths = entryPaths(this.entries, this.root?.entryId);
    return this.shareRoots().flatMap((id) => {
      const path = paths.get(id);
      return path === undefined || id === this.root?.entryId ? [] : [{ id, path }];
    });
  }

  /**
   * Gives each shared folder its copy of the log the first time (or after it
   * was shared again): its `share.json` and every event about what is inside
   * it. Call when the team changes.
   */
  async syncShares(): Promise<void> {
    this.log.setBases(this.sharedPlaces().map((p) => p.path));
    for (const { id, path } of this.sharedPlaces()) {
      if (this.seeded.has(id)) continue;
      const entry = this.all.find((e) => e.id === id);
      if (!entry) continue;
      const file = joinPath(path, SHARE_FILE);
      if (!(await this.fs.readText(file).catch(() => null))) {
        const info: ShareInfo = { v: 1, entryId: id, name: entry.name, kind: entry.kind };
        await this.fs.writeText(file, JSON.stringify(info, null, 2) + "\n");
        await this.log.append(path, this.log.all().filter((e) => this.within(e.id, id)).sort((a, b) => (a.at < b.at ? -1 : 1)));
      }
      this.seeded.add(id);
    }
  }

  /** Reads again (after the team changed which folders are shared); true when something new came in. */
  async reread(): Promise<boolean> {
    const changed = await this.read();
    if (changed) for (const l of this.listeners) l();
    return changed;
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

  private refold(): void {
    this.all = foldLibrary(this.log.all());
    if (!this.root) {
      this.entries = this.all;
      return;
    }
    // Opened from a shared folder: only what is inside it, with it at the top.
    const rootId = this.root.entryId;
    this.entries = this.all.filter((e) => entryWithin(this.all, e.id, rootId)).map((e) => (e.id === rootId ? { ...e, parentId: null } : e));
  }

  /** Creates, renames, moves and removes folders so the disk matches `next`. */
  private async project(prev: LibraryEntry[], next: LibraryEntry[], before: Map<Id, string>, after: Map<Id, string>): Promise<void> {
    const nextById = new Map(next.map((e) => [e.id, e]));
    const prevById = new Map(prev.map((e) => [e.id, e]));
    const depth = (e: LibraryEntry) => {
      let d = 0;
      for (let p = e.parentId ? nextById.get(e.parentId) : undefined; p && d < 64; p = p.parentId ? nextById.get(p.parentId) : undefined) d++;
      return d;
    };
    // Removed for good (never the shared folder opened: it is this device's root).
    for (const e of prev) {
      const path = before.get(e.id);
      if (path && !nextById.has(e.id) && !prev.some((p) => p.id === e.parentId && !nextById.has(p.id))) await this.fs.remove(path);
    }
    // New, renamed or moved: parents first. Where an entry is now = where its old parent is now + its old folder name.
    const sorted = [...next].sort((a, b) => depth(a) - depth(b));
    for (const e of sorted) {
      const to = after.get(e.id);
      if (!to) continue; // the shared folder opened, or outside it
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

  /** Each event goes here and to every shared folder it concerns (before or after the change). */
  private async write(fresh: LibraryEvent[], before: LibraryEntry[], after: LibraryEntry[], now: number): Promise<void> {
    const byPlace = new Map<string, LibraryEvent[]>();
    for (const e of fresh) for (const place of this.placesFor([e.id], [before, after])) byPlace.set(place, [...(byPlace.get(place) ?? []), e]);
    for (const [place, events] of byPlace) await this.log.append(place, events, now);
  }

  private async read(): Promise<boolean> {
    this.log.setBases(this.sharedPlaces().map((p) => p.path));
    const changed = await this.log.read();
    if (changed) {
      this.refold();
      const last = this.log.all().map((e) => e.at).sort().at(-1);
      const seen = last ? parseStamp(last) : null;
      if (seen) this.clock = hlcObserve(this.clock, seen.clock, Date.now());
    }
    return changed;
  }

  private polling: ReturnType<typeof setTimeout> | null = null;

  /** Look for what other devices wrote, every POLL_MS, until `stopPolling`. */
  startPolling(): void {
    if (this.polling) return;
    let last = "";
    const tick = async () => {
      try {
        this.log.setBases(this.sharedPlaces().map((p) => p.path));
        const s = await this.log.signature();
        if (s !== last) {
          last = s;
          if (await this.read()) for (const l of this.listeners) l();
        }
      } catch (err) {
        console.warn("[carpeta] no se pudo revisar el dashboard", err);
      }
      if (this.polling) this.polling = setTimeout(tick, this.fs.pollMs ?? POLL_MS);
    };
    this.polling = setTimeout(tick, this.fs.pollMs ?? POLL_MS);
  }

  stopPolling(): void {
    if (this.polling) clearTimeout(this.polling);
    this.polling = null;
  }
}
