/**
 * Picks the Library (dashboard) and therefore the DataSource of each
 * production (see docs/DEVELOPMENT.md):
 * - default (`pnpm dev`): in-memory demo with the seeded episode;
 * - local (`pnpm dev:local` (vite --mode localdata), VITE_DATA_SOURCE=local, and the desktop app):
 *   productions as event logs in localStorage, shared between windows. The
 *   desktop app moves to real folders (Dropbox) in phase 1, step 3;
 * - VITE_DATA_SOURCE=firebase: a single production from Firebase. Its SDK is
 *   loaded lazily, so the other builds don't ship it.
 */

import { isDesktop } from "../platform";
import { MagnificGenerator } from "../integrations/magnific/generator";
import { buildSeed } from "./mock/seed";
import { MockSource } from "./mock/MockSource";
import { browserLibrary, demoLibrary, folderLibrary, summarize, type Library, type LibraryState } from "./library";
import type { DataSource, Snapshot } from "./source";

export type DataMode = "demo" | "local" | "firebase";

export function dataMode(): DataMode {
  const env = import.meta.env.VITE_DATA_SOURCE || (import.meta.env.MODE === "localdata" ? "local" : "");
  if (env === "firebase" || env === "local") return env;
  return isDesktop() ? "local" : "demo";
}

let demo: MockSource | undefined;

/** Team folder state found at startup (local mode). */
export type StorageStatus = { status: "browser" } | { status: "folder"; name: string } | { status: "reconnect"; name: string };
let prepared: { library: Library; status: StorageStatus } | null = null;

/** Local and folder modes generate with Magnific, with each person's own account. */
const generator = new MagnificGenerator();

/**
 * Before the app renders: in local mode, open the remembered team folder.
 * If the browser wants a click to allow it again, the app starts on this
 * browser's own storage and Settings offers to reconnect.
 */
export async function initStorage(mode = dataMode()): Promise<void> {
  if (mode !== "local") return;
  // A popped-out window works on its main window's production: nothing to open here.
  if (location.hash.startsWith("#/ventana/") && window.opener) {
    prepared = { library: browserLibrary(generator), status: { status: "browser" } };
    return;
  }
  const { restoreLocalFolder } = await import("./folder/browserFs");
  const found = await restoreLocalFolder();
  if (found.status === "ready") {
    try {
      prepared = { library: await folderLibrary(found.fs, generator), status: { status: "folder", name: found.fs.label } };
      return;
    } catch (err) {
      console.error("[carpeta] no se pudo abrir la carpeta del equipo", err);
    }
  }
  prepared = { library: browserLibrary(generator), status: found.status === "reconnect" ? { status: "reconnect", name: found.name } : { status: "browser" } };
}

export function storageStatus(): StorageStatus {
  return prepared?.status ?? { status: "browser" };
}

/**
 * Switch to the remembered team folder (just picked or allowed again) without
 * reloading the app. Resolves the new library, or null if it can't be opened.
 */
export async function openTeamFolder(): Promise<Library | null> {
  const { restoreLocalFolder } = await import("./folder/browserFs");
  const found = await restoreLocalFolder();
  if (found.status !== "ready") return null;
  const library = await folderLibrary(found.fs, generator);
  prepared = { library, status: { status: "folder", name: found.fs.label } };
  return library;
}

/** Back to this browser's own storage (the folder is forgotten). */
export function switchToBrowserStorage(): Library {
  const library = browserLibrary(generator);
  prepared = { library, status: { status: "browser" } };
  return library;
}

export function createLibrary(mode = dataMode()): Library {
  if (mode === "local") return prepared?.library ?? browserLibrary(generator);
  if (mode === "firebase") {
    return singleLibrary("Firebase", () => deferred(() => import("./firebase/FirebaseSource").then((m) => new m.FirebaseSource())));
  }
  const seed = buildSeed();
  return demoLibrary({
    name: seed.production.name,
    me: seed.me,
    summary: summarize({ production: seed.production, nodes: seed.nodes, members: seed.members }),
    open: () => {
      // One demo episode per session: leaving and reopening it keeps its edits and node ids (pins rely on them).
      demo ??= new MockSource();
      const kept = demo;
      return new Proxy(kept, {
        get: (t, prop: keyof MockSource) => (prop === "dispose" ? () => undefined : typeof t[prop] === "function" ? (t[prop] as (...a: unknown[]) => unknown).bind(t) : t[prop]),
      });
    },
  });
}

/** A library with one production and nothing else (Firebase until stage C brings its own). */
function singleLibrary(name: string, open: () => DataSource): Library {
  const t = Date.now();
  const state: LibraryState = {
    label: name,
    mode: "firebase",
    storage: { kind: "firebase" },
    me: { uid: "", email: "", displayName: "Firebase", role: "viewer", magnificConnected: false },
    entries: [{ id: "p_single", kind: "production", name, parentId: null, createdAt: t, updatedAt: t }],
    summaries: {},
    prefs: { pins: [], opened: {} },
  };
  const unsupported = () => {
    throw new Error("No disponible con esta fuente de datos.");
  };
  const ignore = () => undefined;
  return {
    subscribe: (cb) => (cb(state), () => undefined),
    createFolder: unsupported,
    createProduction: unsupported,
    rename: unsupported,
    move: unsupported,
    trash: unsupported,
    restore: unsupported,
    deleteForever: unsupported,
    setPinned: ignore,
    movePin: ignore,
    touch: ignore,
    setProfile: ignore,
    open,
  };
}

/**
 * A DataSource usable before its implementation has loaded. Subscriptions
 * attach as soon as it is ready; intents need it loaded, which is always the
 * case in practice because the UI only acts after the first Snapshot.
 */
function deferred(load: () => Promise<DataSource>): DataSource {
  let inner: DataSource | null = null;
  const subs = new Map<(s: Snapshot) => void, () => void>();

  load()
    .then((src) => {
      inner = src;
      for (const cb of subs.keys()) subs.set(cb, src.subscribe(cb));
    })
    .catch((err) => console.error("[data] no se pudo cargar la fuente de datos", err));

  const subscribe = (cb: (s: Snapshot) => void) => {
    subs.set(cb, inner ? inner.subscribe(cb) : () => undefined);
    return () => {
      subs.get(cb)?.();
      subs.delete(cb);
    };
  };

  return new Proxy({ subscribe } as DataSource, {
    get(target, prop: keyof DataSource) {
      if (prop === "subscribe") return target.subscribe;
      if (prop === "dispose") return () => inner?.dispose?.();
      return (...args: unknown[]) => {
        if (!inner) throw new Error("La fuente de datos aún se está cargando.");
        return (inner[prop] as (...a: unknown[]) => unknown).apply(inner, args);
      };
    },
  });
}
