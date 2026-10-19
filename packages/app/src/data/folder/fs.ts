/**
 * The team folder, whatever holds it (docs/ARCHITECTURE.md §2.1 and §2.2):
 * a folder on this computer now, Dropbox and Google Drive through their APIs
 * next. Everything above it (event logs, the dashboard, folders on disk) is
 * written once against this interface.
 *
 * Paths are relative to the team folder, "/"-separated, with no leading slash
 * ("" is the folder itself).
 */

export interface FsEntry {
  name: string;
  kind: "file" | "dir";
  /** Files only: what changed detection compares. */
  size?: number;
  modified?: number;
}

export interface FolderFs {
  /** What the UI shows: the folder's name. */
  readonly label: string;
  readonly kind: "local" | "dropbox" | "drive" | "memory";
  /** Entries of a folder; [] when it does not exist. */
  list(dir: string): Promise<FsEntry[]>;
  /** null when the file does not exist. */
  readText(path: string): Promise<string | null>;
  /** Creates or replaces the file, and the folders above it. */
  writeText(path: string, text: string): Promise<void>;
  /** Binary files (images, video). Creates the folders above. */
  writeBlob(path: string, data: Blob): Promise<void>;
  /** null when the file does not exist. */
  readBlob(path: string): Promise<Blob | null>;
  mkdir(path: string): Promise<void>;
  /** Moves or renames a file or a folder (with its contents). */
  move(from: string, to: string): Promise<void>;
  /** Removes a file or a folder with everything inside; nothing if missing. */
  remove(path: string): Promise<void>;
  /** Every file under `dir`, at any depth, in one call (cloud APIs); paths relative to the team folder. */
  listFiles?(dir: string): Promise<Array<FsEntry & { path: string }>>;
  /** How often to look for other devices' changes; POLL_MS when absent. */
  readonly pollMs?: number;
  /**
   * Shares a folder ("" is the team folder) with someone's account at the
   * service, so it shows in their Dropbox or Drive; the service sends its own
   * notice. Absent on a folder of this computer (shared by hand there).
   */
  share?(path: string, email: string): Promise<void>;
  /** Takes the folder away from them again. */
  unshare?(path: string, email: string): Promise<void>;
}

/**
 * The `.jsonl` files of a log folder (`<dir>/<deviceId>/<YYYY-MM>.jsonl`),
 * with what change detection compares. One call where the folder allows it.
 */
export async function logFiles(fs: FolderFs, dir: string): Promise<Array<{ path: string; sig: string }>> {
  const out: Array<{ path: string; sig: string }> = [];
  if (fs.listFiles) {
    for (const f of await fs.listFiles(dir)) {
      const rest = f.path.slice(dir.length + 1).split("/");
      if (rest.length === 2 && f.name.endsWith(".jsonl")) out.push({ path: f.path, sig: `${f.size}:${f.modified}` });
    }
  } else {
    for (const device of await fs.list(dir)) {
      if (device.kind !== "dir") continue;
      for (const f of await fs.list(joinPath(dir, device.name))) {
        if (f.kind === "file" && f.name.endsWith(".jsonl")) out.push({ path: joinPath(dir, device.name, f.name), sig: `${f.size}:${f.modified}` });
      }
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/");

export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i), name: path.slice(i + 1) };
}

/** In-memory folder, for tests (several stores on one instance act as devices sharing a folder). */
export class MemoryFolderFs implements FolderFs {
  readonly label = "memoria";
  readonly kind = "memory" as const;
  readonly files = new Map<string, { text: string; modified: number }>();
  readonly dirs = new Set<string>([""]);
  readonly blobs = new Map<string, Blob>();
  private tick = 0;

  async list(dir: string): Promise<FsEntry[]> {
    const prefix = dir ? `${dir}/` : "";
    const out = new Map<string, FsEntry>();
    for (const d of this.dirs) {
      if (d === dir || !d.startsWith(prefix)) continue;
      const name = d.slice(prefix.length).split("/")[0]!;
      out.set(name, { name, kind: "dir" });
    }
    for (const [p, f] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes("/")) continue;
      out.set(rest, { name: rest, kind: "file", size: f.text.length, modified: f.modified });
    }
    return [...out.values()];
  }

  async readText(path: string): Promise<string | null> {
    return this.files.get(path)?.text ?? null;
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.mkdir(splitPath(path).dir);
    this.files.set(path, { text, modified: ++this.tick });
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    await this.mkdir(splitPath(path).dir);
    this.blobs.set(path, data);
    this.files.set(path, { text: "", modified: ++this.tick });
  }

  async readBlob(path: string): Promise<Blob | null> {
    return this.blobs.get(path) ?? null;
  }

  async mkdir(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) this.dirs.add(parts.slice(0, i).join("/"));
  }

  async move(from: string, to: string): Promise<void> {
    const under = (p: string) => p === from || p.startsWith(`${from}/`);
    const moved = (p: string) => to + p.slice(from.length);
    for (const [p, f] of [...this.files]) if (under(p)) (this.files.delete(p), this.files.set(moved(p), f));
    for (const [p, b] of [...this.blobs]) if (under(p)) (this.blobs.delete(p), this.blobs.set(moved(p), b));
    for (const d of [...this.dirs]) if (under(d)) (this.dirs.delete(d), this.dirs.add(moved(d)));
    await this.mkdir(splitPath(to).dir);
  }

  async remove(path: string): Promise<void> {
    const under = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const p of [...this.files.keys()]) if (under(p)) this.files.delete(p);
    for (const p of [...this.blobs.keys()]) if (under(p)) this.blobs.delete(p);
    for (const d of [...this.dirs]) if (d && under(d)) this.dirs.delete(d);
  }
}
