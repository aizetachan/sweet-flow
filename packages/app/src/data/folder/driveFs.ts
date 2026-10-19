/**
 * The team folder in Google Drive, through its API v3 (docs/ARCHITECTURE.md
 * §2.2, §5.4): a folder of My Drive, shared with me, or of a shared drive.
 *
 * Drive has ids, not paths: each path is resolved folder by folder and the
 * ids are remembered (forgotten when something moves or goes away). Two
 * devices may create the same folder at once; the oldest one wins. Removing
 * sends to Drive's trash, so it can be recovered there.
 */

import { cloudToken } from "../../integrations/oauth";
import { joinPath, splitPath, type FolderFs, type FsEntry } from "./fs";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
/** Above this, uploads go resumable (one PUT after opening the session). */
const SIMPLE_MAX = 5 * 1024 * 1024;
const ALL = "supportsAllDrives=true";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/** Where the team folder is: its id, and its shared drive if it is in one. */
export interface DriveRoot {
  id: string;
  driveId?: string;
}

class DriveError extends Error {
  constructor(readonly status: number, message: string) {
    super(`Google Drive: ${message || status}`);
  }
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  let expired = false;
  for (let attempt = 0; ; attempt++) {
    const token = await cloudToken("google", expired);
    expired = false;
    const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
    if (r.ok) return r;
    if (r.status === 401 && attempt === 0) {
      expired = true;
      continue;
    }
    if ((r.status === 429 || r.status === 403 || r.status >= 500) && attempt < 4) {
      const text = await r.clone().text().catch(() => "");
      if (r.status !== 403 || /rate|quota/i.test(text)) {
        await new Promise((res) => setTimeout(res, 2 ** attempt * 1000));
        continue;
      }
    }
    const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new DriveError(r.status, body?.error?.message ?? "");
  }
}

const json = async <T>(url: string, init?: RequestInit) => (await (await call(url, init)).json()) as T;
const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function query(q: string, root: DriveRoot | null, fields = "id,name,mimeType,size,modifiedTime"): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${fields})`,
      pageSize: "1000",
      orderBy: "createdTime",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(root?.driveId ? { corpora: "drive", driveId: root.driveId } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await json<{ files: DriveFile[]; nextPageToken?: string }>(`${API}/files?${p}`);
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/** Who is connected (Settings). */
export async function driveAccount(): Promise<{ name: string; email: string }> {
  const a = await json<{ user?: { displayName?: string; emailAddress?: string } }>(`${API}/about?fields=user(displayName,emailAddress)`);
  return { name: a.user?.displayName ?? "", email: a.user?.emailAddress ?? "" };
}

/** A place to choose the team folder in. */
export interface DrivePlace {
  name: string;
  root: DriveRoot;
}

/**
 * Folders to choose from: at the top, My Drive, «Compartido conmigo» and the
 * shared drives; inside one, its folders.
 */
export async function browseDrive(at: DrivePlace | null): Promise<DrivePlace[]> {
  const byName = (a: DrivePlace, b: DrivePlace) => a.name.localeCompare(b.name, "es");
  if (!at) {
    const drives = await json<{ drives?: Array<{ id: string; name: string }> }>(`${API}/drives?pageSize=100`).catch(() => ({ drives: [] }));
    return [
      { name: "Mi unidad", root: { id: "root" } },
      { name: "Compartido conmigo", root: { id: "shared" } },
      ...(drives.drives ?? []).map((d) => ({ name: d.name, root: { id: d.id, driveId: d.id } })).sort(byName),
    ];
  }
  const q = at.root.id === "shared" ? `sharedWithMe and mimeType='${FOLDER}' and trashed=false` : `${quote(at.root.id)} in parents and mimeType='${FOLDER}' and trashed=false`;
  return (await query(q, at.root.id === "shared" ? null : at.root, "id,name,mimeType"))
    .map((f) => ({ name: f.name, root: { id: f.id, ...(at.root.driveId ? { driveId: at.root.driveId } : {}) } }))
    .sort(byName);
}

export class DriveFolderFs implements FolderFs {
  readonly kind = "drive" as const;
  /** Drive is many calls away: look for changes less often than on disk. */
  readonly pollMs = 5000;
  /** Folder ids by path ("" is the team folder). */
  private ids = new Map<string, string>();
  private making = new Map<string, Promise<string>>();

  constructor(private readonly root: DriveRoot, readonly label: string) {
    this.ids.set("", root.id);
  }

  async list(dir: string): Promise<FsEntry[]> {
    const id = await this.folder(dir, false);
    if (!id) return [];
    const seen = new Set<string>();
    const out: FsEntry[] = [];
    for (const f of await this.children(id)) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      if (f.mimeType === FOLDER) {
        this.ids.set(joinPath(dir, f.name), f.id);
        out.push({ name: f.name, kind: "dir" });
      } else {
        out.push({ name: f.name, kind: "file", size: f.size ? Number(f.size) : undefined, modified: f.modifiedTime ? Date.parse(f.modifiedTime) : undefined });
      }
    }
    return out;
  }

  async readText(path: string): Promise<string | null> {
    const b = await this.readBlob(path);
    return b ? b.text() : null;
  }

  async readBlob(path: string): Promise<Blob | null> {
    const f = await this.file(path);
    if (!f) return null;
    return (await call(`${API}/files/${f.id}?alt=media&${ALL}`)).blob();
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBlob(path, new Blob([text], { type: "text/plain" }));
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const { dir, name } = splitPath(path);
    const parent = (await this.folder(dir, true))!;
    const existing = await this.file(path);
    const type = data.type || "application/octet-stream";
    if (existing) {
      if (data.size <= SIMPLE_MAX) {
        await call(`${UPLOAD}/files/${existing.id}?uploadType=media&${ALL}`, { method: "PATCH", headers: { "Content-Type": type }, body: data });
      } else {
        await this.resumable(`${UPLOAD}/files/${existing.id}?uploadType=resumable&${ALL}`, "PATCH", {}, data);
      }
      return;
    }
    const meta = { name, parents: [parent] };
    if (data.size <= SIMPLE_MAX) {
      const body = new FormData();
      body.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      body.append("file", data);
      await call(`${UPLOAD}/files?uploadType=multipart&${ALL}`, { method: "POST", body });
    } else {
      await this.resumable(`${UPLOAD}/files?uploadType=resumable&${ALL}`, "POST", meta, data);
    }
  }

  private async resumable(url: string, method: string, meta: object, data: Blob): Promise<void> {
    const start = await call(url, { method, headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": data.type || "application/octet-stream" }, body: JSON.stringify(meta) });
    const session = start.headers.get("Location");
    if (!session) throw new DriveError(0, "no ha abierto la subida.");
    await call(session, { method: "PUT", body: data });
  }

  async mkdir(path: string): Promise<void> {
    await this.folder(path, true);
  }

  async move(from: string, to: string): Promise<void> {
    if (from === to) return;
    const src = splitPath(from);
    const dst = splitPath(to);
    const item = (await this.folder(from, false)) ?? (await this.file(from))?.id;
    if (!item) return; // nothing there (never created, or already moved)
    const oldParent = (await this.folder(src.dir, false))!;
    const newParent = (await this.folder(dst.dir, true))!;
    const p = new URLSearchParams({ supportsAllDrives: "true", ...(oldParent !== newParent ? { addParents: newParent, removeParents: oldParent } : {}) });
    await call(`${API}/files/${item}?${p}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: dst.name }) });
    this.forget(from);
  }

  async remove(path: string): Promise<void> {
    const id = (await this.folder(path, false)) ?? (await this.file(path))?.id;
    if (!id || id === this.root.id) return;
    await call(`${API}/files/${id}?${ALL}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    this.forget(path);
  }

  /** Gives their Google account edit access to the folder; Drive emails them. */
  async share(path: string, email: string): Promise<void> {
    const id = await this.folder(path, false);
    if (!id) throw new DriveError(404, "no se encuentra la carpeta que compartir.");
    await call(`${API}/files/${id}/permissions?${ALL}&sendNotificationEmail=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
    });
  }

  async unshare(path: string, email: string): Promise<void> {
    const id = await this.folder(path, false);
    if (!id) return;
    const list = await json<{ permissions?: Array<{ id: string; emailAddress?: string }> }>(`${API}/files/${id}/permissions?${ALL}&fields=permissions(id,emailAddress)`);
    for (const p of list.permissions ?? []) {
      if (p.emailAddress?.toLowerCase() === email.toLowerCase()) await call(`${API}/files/${id}/permissions/${p.id}?${ALL}`, { method: "DELETE" });
    }
  }

  private children(parent: string, extra = ""): Promise<DriveFile[]> {
    return query(`${quote(parent)} in parents and trashed=false${extra}`, this.root);
  }

  private async file(path: string): Promise<DriveFile | null> {
    const { dir, name } = splitPath(path);
    const parent = await this.folder(dir, false);
    if (!parent) return null;
    const found = await this.children(parent, ` and name=${quote(name)} and mimeType!='${FOLDER}'`);
    return found[0] ?? null;
  }

  /** The id of the folder at `path`, creating what is missing when `create`. */
  private async folder(path: string, create: boolean): Promise<string | null> {
    const known = this.ids.get(path);
    if (known) return known;
    const { dir, name } = splitPath(path);
    const parent = await this.folder(dir, create);
    if (!parent) return null;
    const found = await this.children(parent, ` and name=${quote(name)} and mimeType='${FOLDER}'`);
    if (found[0]) {
      this.ids.set(path, found[0].id);
      return found[0].id;
    }
    if (!create) return null;
    let made = this.making.get(path);
    if (!made) {
      made = json<{ id: string }>(`${API}/files?${ALL}&fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) })
        .then((f) => f.id)
        .finally(() => this.making.delete(path));
      this.making.set(path, made);
    }
    const id = await made;
    this.ids.set(path, id);
    return id;
  }

  private forget(path: string): void {
    for (const p of [...this.ids.keys()]) if (p && (p === path || p.startsWith(`${path}/`))) this.ids.delete(p);
  }
}
