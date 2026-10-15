/**
 * A folder of this computer, through the browser's File System Access API
 * (Chrome and Edge). The folder handle is remembered in IndexedDB; after a
 * reload the browser may ask again for permission, which needs a click.
 */

import { splitPath, type FolderFs, type FsEntry } from "./fs";

// Parts of the API that TypeScript's DOM types don't include yet.
type Permission = "granted" | "denied" | "prompt";
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: "readwrite" }): Promise<Permission>;
  requestPermission(o: { mode: "readwrite" }): Promise<Permission>;
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
}
type Movable = { move?: (dir: FileSystemDirectoryHandle, name: string) => Promise<void> };

export const localFoldersSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export class BrowserFolderFs implements FolderFs {
  readonly kind = "local" as const;
  readonly label: string;

  constructor(private readonly root: DirHandle) {
    this.label = root.name;
  }

  async list(dir: string): Promise<FsEntry[]> {
    const d = await this.dir(dir, false);
    if (!d) return [];
    const out: FsEntry[] = [];
    for await (const h of (d as DirHandle).values()) {
      if (h.kind === "directory") out.push({ name: h.name, kind: "dir" });
      else {
        const f = await (h as FileSystemFileHandle).getFile();
        out.push({ name: h.name, kind: "file", size: f.size, modified: f.lastModified });
      }
    }
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const { dir, name } = splitPath(path);
    const d = await this.dir(dir, false);
    if (!d) return null;
    try {
      return await (await (await d.getFileHandle(name)).getFile()).text();
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    const { dir, name } = splitPath(path);
    const d = (await this.dir(dir, true))!;
    // createWritable writes to a temporary file and swaps it in on close: atomic.
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(path, true);
  }

  async move(from: string, to: string): Promise<void> {
    if (from === to) return;
    const src = splitPath(from);
    const dst = splitPath(to);
    const srcDir = await this.dir(src.dir, false);
    if (!srcDir) return;
    const handle = await srcDir.getDirectoryHandle(src.name).catch(() => srcDir.getFileHandle(src.name));
    const target = (await this.dir(dst.dir, true))!;
    const move = (handle as Movable).move;
    if (move) {
      try {
        return await move.call(handle, target, dst.name);
      } catch {
        // Some browsers only move files: copy and remove instead.
      }
    }
    await this.copy(handle, target, dst.name);
    await srcDir.removeEntry(src.name, { recursive: true });
  }

  async remove(path: string): Promise<void> {
    const { dir, name } = splitPath(path);
    const d = await this.dir(dir, false);
    if (!d) return;
    try {
      await d.removeEntry(name, { recursive: true });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  private async copy(h: FileSystemDirectoryHandle | FileSystemFileHandle, into: FileSystemDirectoryHandle, name: string): Promise<void> {
    if (h.kind === "file") {
      const w = await (await into.getFileHandle(name, { create: true })).createWritable();
      await w.write(await (h as FileSystemFileHandle).getFile());
      await w.close();
      return;
    }
    const d = await into.getDirectoryHandle(name, { create: true });
    for await (const c of (h as DirHandle).values()) await this.copy(c, d, c.name);
  }

  private async dir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let d: FileSystemDirectoryHandle = this.root;
    for (const part of path.split("/").filter(Boolean)) {
      try {
        d = await d.getDirectoryHandle(part, { create });
      } catch (e) {
        if (!create && (isNotFound(e) || isTypeMismatch(e))) return null;
        throw e;
      }
    }
    return d;
  }
}

const isNotFound = (e: unknown) => e instanceof DOMException && e.name === "NotFoundError";
const isTypeMismatch = (e: unknown) => e instanceof DOMException && e.name === "TypeMismatchError";

// ---------- remembering the folder ----------

const DB = "sweetflow";
const STORE = "handles";
const KEY = "teamFolder";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type LocalFolderState =
  | { status: "none" }
  | { status: "ready"; fs: BrowserFolderFs }
  /** Remembered, but the browser wants a click to allow it again. */
  | { status: "reconnect"; name: string };

/** The remembered folder, if any, without asking anything. */
export async function restoreLocalFolder(): Promise<LocalFolderState> {
  if (!localFoldersSupported()) return { status: "none" };
  try {
    const h = await idb<DirHandle | undefined>("readonly", (s) => s.get(KEY));
    if (!h) return { status: "none" };
    const p = await h.queryPermission({ mode: "readwrite" });
    return p === "granted" ? { status: "ready", fs: new BrowserFolderFs(h) } : { status: "reconnect", name: h.name };
  } catch (err) {
    console.error("[carpeta] no se pudo recuperar la carpeta", err);
    return { status: "none" };
  }
}

/** Asks again for the remembered folder (call from a click). */
export async function reconnectLocalFolder(): Promise<boolean> {
  const h = await idb<DirHandle | undefined>("readonly", (s) => s.get(KEY));
  return !!h && (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Lets the user pick a folder and remembers it (call from a click). Null if cancelled. */
export async function pickLocalFolder(): Promise<string | null> {
  const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker;
  try {
    const h = await picker.call(window, { id: "sweetflow-team", mode: "readwrite" });
    await idb("readwrite", (s) => s.put(h, KEY));
    return h.name;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

export async function forgetLocalFolder(): Promise<void> {
  await idb("readwrite", (s) => s.delete(KEY));
}
