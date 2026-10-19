/**
 * Library — what the dashboard shows (docs/INTERFAZ.md §1): folders and
 * productions, Drive style. A folder groups (a series); a production is a
 * working file that opens as a DataSource. Also the signed-in user's profile
 * and personal lists (recent, favourites).
 *
 * Implementations:
 * - demo (memory): the seeded "Mareas" episode plus anything created;
 * - browser (localStorage): shared by every tab/window of the same origin, so
 *   a production can be popped out to its own window;
 * - folder on disk / Dropbox (phase 1, step 3): folders are real folders and a
 *   production is a folder with `.sweetflow/` inside.
 */

import { IDENTITY_EVENT, IDENTITY_KEY, readIdentity, uidForEmail } from "../integrations/magnific/identity";
import {
  defaultLevels,
  defaultStatuses,
  foldLog,
  isUnit,
  parseLog,
  type Id,
  type LogState,
  type Member,
  type Millis,
} from "@sweetflow/domain";
import { LocalSource } from "./local/LocalSource";
import { BrowserLogStore, MemoryLogStore, type LogStore } from "./local/store";
import { FolderEntries } from "./folder/folderEntries";
import { FolderLogStore } from "./folder/FolderLogStore";
import type { FolderFs } from "./folder/fs";
import { ProductionFiles } from "./folder/ProductionFiles";
import type { Generator } from "./generation";
import type { DataSource } from "./source";

export type EntryKind = "folder" | "production";

export interface LibraryEntry {
  id: Id;
  kind: EntryKind;
  name: string;
  parentId: Id | null;
  createdAt: Millis;
  updatedAt: Millis;
  /** In the trash since then; its contents go with it. */
  trashedAt?: Millis;
}

/** What a production card shows without opening it. */
export interface ProductionSummary {
  format?: string;
  /** Units (last level) and how many are in a "done" status. */
  units: number;
  done: number;
  /** Units per status, in status order, for the progress bar. */
  byStatus: Array<{ color: string; name: string; count: number }>;
  members: string[];
  updatedAt?: Millis;
  thumbUrl?: string;
}

/**
 * Something the user keeps at hand in the side menu: a folder, a production,
 * or a scene/shot inside a production (docs/INTERFAZ.md §1).
 */
export interface Pin {
  entryId: Id;
  nodeId?: Id;
  /** Last seen code, title and level of the node: the menu shows them without opening the production. */
  code?: string;
  title?: string;
  level?: string;
}

export const pinKey = (p: Pick<Pin, "entryId" | "nodeId">): string => (p.nodeId ? `${p.entryId}/${p.nodeId}` : p.entryId);

/** The user's own lists; not shared with the team. */
export interface UserPrefs {
  /** In the order shown in the side menu. */
  pins: Pin[];
  /** Last time each entry was opened. */
  opened: Record<Id, Millis>;
}

export type StorageInfo =
  | { kind: "demo" | "browser" | "firebase" }
  | { kind: "folder"; provider: FolderFs["kind"]; name: string };

export type Profile = Pick<Member, "displayName" | "email">;

export interface LibraryState {
  /** Where the library lives, for the UI ("Dropbox/Estudio", "Este equipo"). */
  label: string;
  /** "demo" | "local" | "firebase": what Settings can offer. */
  mode: "demo" | "local" | "firebase";
  /** Where productions are kept, for Settings. */
  storage: StorageInfo;
  me: Member;
  entries: LibraryEntry[];
  summaries: Record<Id, ProductionSummary>;
  prefs: UserPrefs;
}

export interface Library {
  subscribe(cb: (s: LibraryState) => void): () => void;
  /** Stop watching for changes (switching to another storage). */
  dispose?(): void;
  createFolder(parentId: Id | null, name: string): Id;
  createProduction(parentId: Id | null, name: string): Promise<Id>;
  rename(id: Id, name: string): void;
  /** Move entries into a folder (null = root). Ignores moving a folder into itself or its subfolders. */
  move(ids: Id[], parentId: Id | null): void;
  trash(ids: Id[]): void;
  restore(ids: Id[]): void;
  /** Remove from the trash for good, with everything inside. */
  deleteForever(ids: Id[]): Promise<void>;
  /** Pin or unpin; pinning something already pinned refreshes its labels in place. */
  setPinned(pin: Pin, pinned: boolean): void;
  /** Move a pin to another position of the side menu. */
  movePin(key: string, toIndex: number): void;
  /** Record that the user opened an entry (Recientes). */
  touch(id: Id): void;
  setProfile(p: Profile): void;
  /** DataSource of a production. Caller disposes it when leaving. */
  open(id: Id): DataSource;
  /** Where an entry's folder is, inside the team folder (folder mode only). */
  pathOf?(id: Id): string | null;
}

/** Entry ids inside `rootIds` (themselves included), at any depth. */
export function withDescendants(entries: LibraryEntry[], rootIds: Id[]): Set<Id> {
  const out = new Set(rootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of entries) if (e.parentId && out.has(e.parentId) && !out.has(e.id)) (out.add(e.id), (grew = true));
  }
  return out;
}

/** True when the entry or any folder above it is in the trash. */
export function isInTrash(byId: Map<Id, LibraryEntry>, e: LibraryEntry): boolean {
  for (let cur: LibraryEntry | undefined = e; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.trashedAt) return true;
  return false;
}

// ---------- shared implementation ----------

interface Persisted<T> {
  load(): T;
  save(value: T): void;
}

interface EntryLibraryOptions {
  label: string;
  mode: LibraryState["mode"];
  storage: StorageInfo;
  entries: Persisted<LibraryEntry[]>;
  prefs: Persisted<UserPrefs>;
  profile: Persisted<Member>;
  /** Changes made elsewhere (another window). */
  watch: (cb: () => void) => () => void;
  logStoreFor: (productionId: Id) => LogStore;
  /** The production's folders in the team folder (folder mode only). */
  filesFor?: (productionId: Id) => ProductionFiles;
  /** An entry's folder inside the team folder (folder mode only). */
  pathOf?: (id: Id) => string | null;
  generator?: Generator;
  deviceId: Id;
  /** Productions handled outside the log (the demo episode). */
  special?: Record<Id, { open: () => DataSource; summary: ProductionSummary }>;
}

const newId = (p: string) => `${p}_${crypto.randomUUID()}`;

class EntryLibrary implements Library {
  private entries: LibraryEntry[];
  private prefs: UserPrefs;
  private me: Member;
  private summaries: Record<Id, ProductionSummary> = {};
  private listeners = new Set<(s: LibraryState) => void>();
  private unwatch: () => void = () => undefined;

  constructor(private readonly o: EntryLibraryOptions) {
    this.entries = o.entries.load();
    this.prefs = normalizePrefs(o.prefs.load());
    this.me = o.profile.load();
    for (const [id, sp] of Object.entries(o.special ?? {})) this.summaries[id] = sp.summary;
    this.unwatch = o.watch(() => {
      this.entries = o.entries.load();
      this.prefs = normalizePrefs(o.prefs.load());
      this.me = o.profile.load();
      void this.refreshSummaries();
    });
    void this.refreshSummaries();
  }

  dispose(): void {
    this.unwatch();
    this.listeners.clear();
  }

  subscribe(cb: (s: LibraryState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state());
    return () => this.listeners.delete(cb);
  }

  createFolder(parentId: Id | null, name: string): Id {
    const id = newId("f");
    this.commit([...this.entries, this.entry(id, "folder", name, parentId)]);
    return id;
  }

  async createProduction(parentId: Id | null, name: string): Promise<Id> {
    const id = newId("p");
    // The entry first: in a team folder it gives the production its folder.
    this.commit([...this.entries, this.entry(id, "production", name, parentId)]);
    const src = this.source(id, { id, name, levels: defaultLevels(newId), statuses: defaultStatuses(newId) });
    await src.ready;
    await src.flushed();
    src.dispose();
    void this.refreshSummaries();
    return id;
  }

  rename(id: Id, name: string): void {
    const e = this.entries.find((x) => x.id === id);
    name = name.trim();
    if (!e || !name || e.name === name) return;
    if (e.kind === "production" && !this.o.special?.[id]) {
      // The production's own name lives in its log; keep both in step. If it
      // is open, through that same source (never two writing at once).
      const open = this.opened.get(id);
      if (open) void open.ready.then(() => open.renameProduction(name));
      else {
        const src = this.source(id);
        void src.ready.then(() => src.renameProduction(name)).then(() => src.flushed()).finally(() => src.dispose());
      }
    }
    this.commit(this.entries.map((x) => (x.id === id ? { ...x, name, updatedAt: Date.now() } : x)));
  }

  move(ids: Id[], parentId: Id | null): void {
    const blocked = new Set<Id>();
    // A folder cannot go inside itself or any of its subfolders.
    for (let cur = parentId; cur; cur = this.entries.find((x) => x.id === cur)?.parentId ?? null) blocked.add(cur);
    const ok = new Set(ids.filter((id) => !blocked.has(id)));
    if (!ok.size) return;
    this.commit(this.entries.map((x) => (ok.has(x.id) ? { ...x, parentId, updatedAt: Date.now() } : x)));
  }

  trash(ids: Id[]): void {
    const set = new Set(ids);
    const now = Date.now();
    this.commit(this.entries.map((x) => (set.has(x.id) ? { ...x, trashedAt: now } : x)));
  }

  restore(ids: Id[]): void {
    const set = new Set(ids);
    // Back where it was; to the root if that folder no longer exists.
    this.commit(
      this.entries.map((x) => {
        if (!set.has(x.id)) return x;
        const { trashedAt: _t, ...rest } = x;
        const parentAlive = !x.parentId || this.entries.some((p) => p.id === x.parentId && !p.trashedAt);
        return { ...rest, parentId: parentAlive ? x.parentId : null, updatedAt: Date.now() };
      }),
    );
  }

  async deleteForever(ids: Id[]): Promise<void> {
    const gone = withDescendants(this.entries, ids);
    for (const e of this.entries) {
      if (gone.has(e.id) && e.kind === "production" && !this.o.special?.[e.id]) await this.o.logStoreFor(e.id).destroy();
    }
    for (const id of gone) delete this.summaries[id];
    this.prefs = { pins: this.prefs.pins.filter((x) => !gone.has(x.entryId)), opened: Object.fromEntries(Object.entries(this.prefs.opened).filter(([k]) => !gone.has(k))) };
    this.o.prefs.save(this.prefs);
    this.commit(this.entries.filter((x) => !gone.has(x.id)));
  }

  setPinned(pin: Pin, pinned: boolean): void {
    const key = pinKey(pin);
    const at = this.prefs.pins.findIndex((x) => pinKey(x) === key);
    const pins = [...this.prefs.pins];
    if (!pinned) {
      if (at < 0) return;
      pins.splice(at, 1);
    } else if (at < 0) {
      pins.push(pin);
    } else {
      const old = pins[at]!;
      if (old.code === pin.code && old.title === pin.title && old.level === pin.level) return;
      pins[at] = pin;
    }
    this.savePrefs({ ...this.prefs, pins });
  }

  movePin(key: string, toIndex: number): void {
    const pins = [...this.prefs.pins];
    const from = pins.findIndex((x) => pinKey(x) === key);
    if (from < 0) return;
    const [moved] = pins.splice(from, 1);
    pins.splice(Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, pins.length)), 0, moved!);
    this.savePrefs({ ...this.prefs, pins });
  }

  touch(id: Id): void {
    this.savePrefs({ ...this.prefs, opened: { ...this.prefs.opened, [id]: Date.now() } });
  }

  setProfile(p: Profile): void {
    const displayName = p.displayName.trim() || this.me.displayName;
    this.me = { ...this.me, displayName, email: p.email.trim() };
    this.o.profile.save(this.me);
    this.emit();
  }

  pathOf(id: Id): string | null {
    return this.o.pathOf?.(id) ?? null;
  }

  open(id: Id): DataSource {
    const special = this.o.special?.[id];
    if (special) return special.open();
    const src = this.source(id);
    this.opened.set(id, src);
    const dispose = src.dispose.bind(src);
    src.dispose = () => {
      if (this.opened.get(id) === src) this.opened.delete(id);
      dispose();
    };
    src.ready
      .then(() => {
        // One name inside and outside: the dashboard's wins when they differ (renamed while closed).
        const name = this.entries.find((x) => x.id === id)?.name;
        if (name) src.renameProduction(name);
      })
      .catch((err) => console.error("[library] no se pudo abrir la producción", err));
    return src;
  }

  // ---------- internals ----------

  /** Productions open right now, to rename them through their own source. */
  private opened = new Map<Id, LocalSource>();

  private source(id: Id, create?: ConstructorParameters<typeof LocalSource>[0]["create"]): LocalSource {
    return new LocalSource({ store: this.o.logStoreFor(id), deviceId: this.o.deviceId, me: this.me, create, files: this.o.filesFor?.(id), generator: this.o.generator });
  }

  private entry(id: Id, kind: EntryKind, name: string, parentId: Id | null): LibraryEntry {
    const now = Date.now();
    return { id, kind, name: name.trim() || (kind === "folder" ? "Carpeta sin nombre" : "Producción sin nombre"), parentId, createdAt: now, updatedAt: now };
  }

  private savePrefs(prefs: UserPrefs): void {
    this.prefs = prefs;
    this.o.prefs.save(prefs);
    this.emit();
  }

  private commit(entries: LibraryEntry[]): void {
    this.entries = entries;
    this.o.entries.save(entries);
    this.emit();
    void this.refreshSummaries();
  }

  private async refreshSummaries(): Promise<void> {
    for (const e of this.entries) {
      if (e.kind !== "production" || this.o.special?.[e.id]) continue;
      try {
        const files = await this.o.logStoreFor(e.id).readAll();
        this.summaries[e.id] = summarize(foldLog(files.flatMap((t) => parseLog(t).events)));
      } catch (err) {
        console.warn("[library] no se pudo leer el resumen de", e.name, err);
      }
    }
    this.emit();
  }

  private state(): LibraryState {
    return { label: this.o.label, mode: this.o.mode, storage: this.o.storage, me: this.me, entries: this.entries, summaries: { ...this.summaries }, prefs: this.prefs };
  }

  private emit(): void {
    const s = this.state();
    for (const l of this.listeners) l(s);
  }
}

/** Card data for a production from its folded log. */
export function summarize(s: Pick<LogState, "production" | "nodes" | "members">): ProductionSummary {
  const p = s.production;
  if (!p) return { units: 0, done: 0, byStatus: [], members: [] };
  const units = s.nodes.filter((n) => isUnit(p, n));
  const statuses = [...p.statuses].sort((a, b) => a.order - b.order);
  return {
    format: p.format,
    units: units.length,
    done: units.filter((u) => statuses.find((x) => x.id === u.statusId)?.category === "done").length,
    byStatus: statuses.map((st) => ({ color: st.color, name: st.name, count: units.filter((u) => u.statusId === st.id).length })).filter((x) => x.count),
    members: s.members.map((m) => m.displayName),
    updatedAt: Math.max(p.updatedAt, ...s.nodes.map((n) => n.updatedAt)),
  };
}

// ---------- concrete libraries ----------

const memory = <T,>(initial: T): Persisted<T> => {
  let v = initial;
  return { load: () => v, save: (x) => void (v = x) };
};

const EMPTY_PREFS: UserPrefs = { pins: [], opened: {} };

/** Prefs saved before pins existed had "starred" entry ids: they become pins. */
function normalizePrefs(raw: UserPrefs & { starred?: Id[] }): UserPrefs {
  return { pins: raw.pins?.length || !raw.starred ? raw.pins ?? [] : raw.starred.map((entryId) => ({ entryId })), opened: raw.opened ?? {} };
}

/** In-memory demo: the seeded episode (MockSource) inside "Mareas", plus anything created. */
export function demoLibrary(mock: { open: () => DataSource; summary: ProductionSummary; name: string; me: Member }): Library {
  const t = Date.now() - 2 * 24 * 3600_000;
  const at = (kind: EntryKind, id: Id, name: string, parentId: Id | null): LibraryEntry => ({ id, kind, name, parentId, createdAt: t, updatedAt: t });
  const stores = new Map<Id, MemoryLogStore>();
  return new EntryLibrary({
    label: "Demo",
    mode: "demo",
    storage: { kind: "demo" },
    entries: memory([
      at("folder", "f_mareas", "Mareas", null),
      at("folder", "f_mareas_t1", "Temporada 1", "f_mareas"),
      at("production", "p_demo", mock.name, "f_mareas_t1"),
      at("folder", "f_spots", "Spots", null),
    ]),
    prefs: memory<UserPrefs>({ pins: [{ entryId: "f_mareas" }, { entryId: "p_demo" }], opened: { p_demo: t } }),
    profile: memory(mock.me),
    watch: () => () => undefined,
    logStoreFor: (id) => stores.get(id) ?? stores.set(id, new MemoryLogStore()).get(id)!,
    deviceId: "demo",
    special: { p_demo: { open: mock.open, summary: mock.summary } },
  });
}

/** What stays in this browser whatever holds the productions: who I am, my pins and recents, this window's device id. */
function personal() {
  const KEYS = { prefs: "sweetflow:prefs", profile: "sweetflow:profile" };
  const remembered = (storage: Storage, key: string) => {
    let v = storage.getItem(key);
    if (!v) storage.setItem(key, (v = crypto.randomUUID().slice(0, 8)));
    return v;
  };
  const json = <T,>(key: string, fallback: T): Persisted<T> => ({
    load: () => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
      } catch {
        return fallback;
      }
    },
    save: (v) => localStorage.setItem(key, JSON.stringify(v)),
  });
  const browserUid = `u_${remembered(localStorage, "sweetflow:uid")}`;
  const defaultMe: Member = { uid: browserUid, email: "", displayName: `Usuario ${browserUid.slice(2, 6)}`, role: "owner", magnificConnected: false };
  const profile = json<Member>(KEYS.profile, defaultMe);
  return {
    keys: [...Object.values(KEYS), IDENTITY_KEY],
    prefs: json(KEYS.prefs, EMPTY_PREFS),
    // Who I am: my Magnific account when it is known (same id on every
    // computer, docs/USUARIOS.md §1); else this browser's own id and the
    // name written in Ajustes › Perfil.
    profile: {
      load: () => {
        const id = readIdentity();
        const saved = profile.load();
        return id
          ? { ...saved, uid: uidForEmail(id.email), email: id.email, displayName: id.name, ...(id.avatarUrl ? { photoUrl: id.avatarUrl } : {}), role: "owner" as const }
          : { ...saved, uid: browserUid, role: "owner" as const };
      },
      save: profile.save,
    },
    // sessionStorage is per window: every window writes its own log file. A
    // popped window inherits its opener's sessionStorage, so it gets a fresh id
    // (it normally borrows the opener's source and writes nothing itself).
    deviceId: location.hash.startsWith("#/ventana/") ? `win-${crypto.randomUUID().slice(0, 8)}` : `win-${remembered(sessionStorage, "sweetflow:device")}`,
  };
}

/** localStorage library: one user per browser profile, one device per window. */
export function browserLibrary(generator?: Generator): Library {
  const ENTRIES = "sweetflow:library";
  const me = personal();
  return new EntryLibrary({
    label: "Este navegador",
    mode: "local",
    storage: { kind: "browser" },
    entries: {
      load: () => {
        try {
          return JSON.parse(localStorage.getItem(ENTRIES) ?? "[]") as LibraryEntry[];
        } catch {
          return [];
        }
      },
      save: (entries) => localStorage.setItem(ENTRIES, JSON.stringify(entries)),
    },
    prefs: me.prefs,
    profile: me.profile,
    watch: (cb) => {
      const h = (e: StorageEvent) => ([ENTRIES, ...me.keys].includes(e.key ?? "") || e.key?.startsWith("sweetflow:prod:")) && cb();
      window.addEventListener("storage", h);
      window.addEventListener(IDENTITY_EVENT, cb);
      return () => {
        window.removeEventListener("storage", h);
        window.removeEventListener(IDENTITY_EVENT, cb);
      };
    },
    logStoreFor: (id) => new BrowserLogStore(`prod:${id}`),
    generator,
    deviceId: me.deviceId,
  });
}

/**
 * The team folder (docs/ARCHITECTURE.md §5): the dashboard and every
 * production live in it, as event logs and real folders. Same code for a
 * folder of this computer now and for Dropbox or Drive next.
 */
export async function folderLibrary(fs: FolderFs, generator?: Generator): Promise<Library> {
  const me = personal();
  const entries = new FolderEntries(fs, me.deviceId, () => me.profile.load().uid);
  await entries.init();
  return new EntryLibrary({
    label: fs.label,
    mode: "local",
    storage: { kind: "folder", provider: fs.kind, name: fs.label },
    entries,
    prefs: me.prefs,
    profile: me.profile,
    watch: (cb) => {
      const off = entries.watch(cb);
      entries.startPolling();
      const h = (e: StorageEvent) => me.keys.includes(e.key ?? "") && cb();
      window.addEventListener("storage", h);
      window.addEventListener(IDENTITY_EVENT, cb);
      return () => {
        off();
        entries.stopPolling();
        window.removeEventListener("storage", h);
        window.removeEventListener(IDENTITY_EVENT, cb);
      };
    },
    logStoreFor: (id) => new FolderLogStore(fs, () => entries.pathOf(id)),
    filesFor: (id) => new ProductionFiles(fs, () => entries.pathOf(id)),
    pathOf: (id) => entries.pathOf(id),
    generator,
    deviceId: me.deviceId,
  });
}
