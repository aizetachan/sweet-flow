/**
 * Library — what the dashboard shows (docs/INTERFAZ.md §1): folders and
 * productions, Drive style. A folder groups (a series); a production is a
 * working file that opens as a DataSource.
 *
 * Implementations:
 * - demo (memory): the seeded "Mareas" episode plus anything created;
 * - browser (localStorage): shared by every tab/window of the same origin, so
 *   a production can be popped out to its own window;
 * - folder on disk / Dropbox (phase 1, step 3): folders are real folders and a
 *   production is a folder with `.sweetflow/` inside.
 */

import {
  defaultLevels,
  defaultStatuses,
  foldLog,
  isUnit,
  parseLog,
  type Id,
  type Member,
  type Millis,
  type LogState,
} from "@sweetflow/domain";
import { LocalSource } from "./local/LocalSource";
import { BrowserLogStore, MemoryLogStore, type LogStore } from "./local/store";
import type { DataSource } from "./source";

export type EntryKind = "folder" | "production";

export interface LibraryEntry {
  id: Id;
  kind: EntryKind;
  name: string;
  parentId: Id | null;
  createdAt: Millis;
  updatedAt: Millis;
  archived?: boolean;
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

export interface LibraryState {
  /** Where the library lives, for the UI ("Dropbox/Estudio", "navegador"). */
  label: string;
  entries: LibraryEntry[];
  summaries: Record<Id, ProductionSummary>;
}

export interface Library {
  subscribe(cb: (s: LibraryState) => void): () => void;
  createFolder(parentId: Id | null, name: string): Id;
  createProduction(parentId: Id | null, name: string): Promise<Id>;
  rename(id: Id, name: string): void;
  /** Move entries into a folder (null = root). Ignores moving a folder into itself or its subfolders. */
  move(ids: Id[], parentId: Id | null): void;
  setArchived(id: Id, archived: boolean): void;
  /** DataSource of a production. Caller disposes it when leaving. */
  open(id: Id): DataSource;
  /** Whether productions can be opened in other windows and stay in sync. */
  readonly canPopOut: boolean;
}

// ---------- shared implementation ----------

interface EntryPersistence {
  load(): LibraryEntry[];
  save(entries: LibraryEntry[]): void;
  /** Changes made elsewhere (another window). */
  watch(cb: () => void): () => void;
}

interface EntryLibraryOptions {
  label: string;
  persist: EntryPersistence;
  logStoreFor: (productionId: Id) => LogStore;
  me: Member;
  deviceId: Id;
  canPopOut: boolean;
  /** Productions handled outside the log (the demo episode). */
  special?: Record<Id, { open: () => DataSource; summary: ProductionSummary }>;
}

const newId = (p: string) => `${p}_${crypto.randomUUID()}`;

class EntryLibrary implements Library {
  readonly canPopOut: boolean;
  private entries: LibraryEntry[];
  private summaries: Record<Id, ProductionSummary> = {};
  private listeners = new Set<(s: LibraryState) => void>();

  constructor(private readonly o: EntryLibraryOptions) {
    this.canPopOut = o.canPopOut;
    this.entries = o.persist.load();
    for (const [id, sp] of Object.entries(o.special ?? {})) this.summaries[id] = sp.summary;
    o.persist.watch(() => {
      this.entries = o.persist.load();
      void this.refreshSummaries();
    });
    void this.refreshSummaries();
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
    const src = this.source(id, { id, name, levels: defaultLevels(newId), statuses: defaultStatuses(newId) });
    await src.ready;
    await src.flushed();
    src.dispose();
    this.commit([...this.entries, this.entry(id, "production", name, parentId)]);
    return id;
  }

  rename(id: Id, name: string): void {
    const e = this.entries.find((x) => x.id === id);
    if (!e || !name.trim() || e.name === name) return;
    if (e.kind === "production" && !this.o.special?.[id]) {
      // The production's own name lives in its log; keep both in step.
      const src = this.source(id);
      void src.ready.then(() => src.renameProduction(name)).then(() => src.flushed()).finally(() => src.dispose());
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

  setArchived(id: Id, archived: boolean): void {
    this.commit(this.entries.map((x) => (x.id === id ? { ...x, archived, updatedAt: Date.now() } : x)));
  }

  open(id: Id): DataSource {
    const special = this.o.special?.[id];
    if (special) return special.open();
    const src = this.source(id);
    src.ready.catch((err) => console.error("[library] no se pudo abrir la producción", err));
    return src;
  }

  // ---------- internals ----------

  private source(id: Id, create?: ConstructorParameters<typeof LocalSource>[0]["create"]): LocalSource {
    return new LocalSource({ store: this.o.logStoreFor(id), deviceId: this.o.deviceId, me: this.o.me, create });
  }

  private entry(id: Id, kind: EntryKind, name: string, parentId: Id | null): LibraryEntry {
    const now = Date.now();
    return { id, kind, name: name.trim() || (kind === "folder" ? "Carpeta sin nombre" : "Producción sin nombre"), parentId, createdAt: now, updatedAt: now };
  }

  private commit(entries: LibraryEntry[]): void {
    this.entries = entries;
    this.o.persist.save(entries);
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
    return { label: this.o.label, entries: this.entries, summaries: { ...this.summaries } };
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

const memoryPersistence = (initial: LibraryEntry[]): EntryPersistence => {
  let entries = initial;
  return { load: () => entries, save: (e) => void (entries = e), watch: () => () => undefined };
};

/** In-memory demo: the seeded episode (MockSource) inside "Mareas", plus anything created. */
export function demoLibrary(mock: { open: () => DataSource; summary: ProductionSummary; name: string }): Library {
  const t = Date.now() - 2 * 24 * 3600_000;
  const at = (kind: EntryKind, id: Id, name: string, parentId: Id | null): LibraryEntry => ({ id, kind, name, parentId, createdAt: t, updatedAt: t });
  const stores = new Map<Id, MemoryLogStore>();
  const me: Member = { uid: "u_me", email: "tu@estudio.com", displayName: "Tú", role: "owner", magnificConnected: false };
  return new EntryLibrary({
    label: "Demo",
    persist: memoryPersistence([
      at("folder", "f_mareas", "Mareas", null),
      at("folder", "f_mareas_t1", "Temporada 1", "f_mareas"),
      at("production", "p_demo", mock.name, "f_mareas_t1"),
      at("folder", "f_spots", "Spots", null),
    ]),
    logStoreFor: (id) => stores.get(id) ?? stores.set(id, new MemoryLogStore()).get(id)!,
    me,
    deviceId: "demo",
    canPopOut: false,
    special: { p_demo: { open: mock.open, summary: mock.summary } },
  });
}

/** localStorage library: one user per browser profile, one device per window. */
export function browserLibrary(): Library {
  const KEY = "sweetflow:library";
  const remembered = (storage: Storage, key: string) => {
    let v = storage.getItem(key);
    if (!v) storage.setItem(key, (v = crypto.randomUUID().slice(0, 8)));
    return v;
  };
  const uid = `u_${remembered(localStorage, "sweetflow:uid")}`;
  const me: Member = { uid, email: "", displayName: `Usuario ${uid.slice(2, 6)}`, role: "owner", magnificConnected: false };
  return new EntryLibrary({
    label: "Este equipo",
    persist: {
      load: () => {
        try {
          return JSON.parse(localStorage.getItem(KEY) ?? "[]") as LibraryEntry[];
        } catch {
          return [];
        }
      },
      save: (entries) => localStorage.setItem(KEY, JSON.stringify(entries)),
      watch: (cb) => {
        const h = (e: StorageEvent) => (e.key === KEY || e.key?.startsWith("sweetflow:prod:")) && cb();
        window.addEventListener("storage", h);
        return () => window.removeEventListener("storage", h);
      },
    },
    logStoreFor: (id) => new BrowserLogStore(`prod:${id}`),
    me,
    // sessionStorage is per window: every window writes its own log file.
    deviceId: `win-${remembered(sessionStorage, "sweetflow:device")}`,
    canPopOut: true,
  });
}
