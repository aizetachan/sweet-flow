/**
 * The team folder in Dropbox, through its HTTP API (docs/ARCHITECTURE.md §2.2,
 * §5.4): no desktop client needed. Paths are relative to the chosen folder.
 *
 * - Team accounts: calls go to the account's root namespace, so team folders
 *   show next to the person's own (Dropbox-API-Path-Root).
 * - Change detection lists the log folders recursively in one call.
 * - Rate limits (429) and expired tokens are retried.
 */

import { cloudToken } from "../../integrations/oauth";
import { joinPath, type FolderFs, type FsEntry } from "./fs";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
/** Files bigger than this go up in chunks (the single upload stops at 150 MB). */
const CHUNK = 8 * 1024 * 1024;

/** Dropbox-API-Arg is a header: anything outside ASCII must be escaped (titles in Spanish have accents). */
const headerJson = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

interface DbxEntry {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
  rev?: string;
}

class DropboxError extends Error {
  constructor(readonly status: number, readonly summary: string) {
    super(`Dropbox: ${summary || status}`);
  }
  get notFound(): boolean {
    return this.status === 409 && /not_found/.test(this.summary);
  }
  get conflict(): boolean {
    return this.status === 409 && /conflict/.test(this.summary);
  }
}

/** The root namespace of the account (team space), asked once per session. */
let pathRoot: Promise<string | null> | null = null;

async function call(url: string, init: { body?: BodyInit; arg?: unknown; json?: unknown }): Promise<Response> {
  let expired = false;
  for (let attempt = 0; ; attempt++) {
    const token = await cloudToken("dropbox", expired);
    expired = false;
    const root = url.includes("/users/get_current_account") ? null : await rootNamespace();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (root) headers["Dropbox-API-Path-Root"] = headerJson({ ".tag": "root", root });
    if (init.arg !== undefined) headers["Dropbox-API-Arg"] = headerJson(init.arg);
    let body = init.body;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.arg !== undefined && body !== undefined) {
      headers["Content-Type"] = "application/octet-stream";
    }
    const r = await fetch(url, { method: "POST", headers, body });
    if (r.ok) return r;
    if (r.status === 401 && attempt === 0) {
      expired = true;
      continue;
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      const wait = Number(r.headers.get("Retry-After")) || 2 ** attempt;
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    const text = await r.text().catch(() => "");
    let summary = text;
    try {
      summary = (JSON.parse(text) as { error_summary?: string }).error_summary ?? text;
    } catch {
      // Not JSON: keep the text.
    }
    throw new DropboxError(r.status, summary);
  }
}

async function rpc<T>(route: string, args: unknown): Promise<T> {
  return (await (await call(`${API}/${route}`, { json: args })).json()) as T;
}

function rootNamespace(): Promise<string | null> {
  pathRoot ??= rpc<{ root_info?: { root_namespace_id?: string; home_namespace_id?: string } }>("users/get_current_account", null)
    .then((a) => (a.root_info?.root_namespace_id && a.root_info.root_namespace_id !== a.root_info.home_namespace_id ? a.root_info.root_namespace_id : null))
    .catch((e: unknown) => {
      pathRoot = null;
      throw e;
    });
  return pathRoot;
}

/** Who is connected (Settings). */
export async function dropboxAccount(): Promise<{ name: string; email: string }> {
  const a = await rpc<{ name?: { display_name?: string }; email?: string }>("users/get_current_account", null);
  return { name: a.name?.display_name ?? "", email: a.email ?? "" };
}

async function listAll(path: string, recursive = false): Promise<DbxEntry[]> {
  try {
    let page = await rpc<{ entries: DbxEntry[]; cursor: string; has_more: boolean }>("files/list_folder", { path, recursive, limit: 2000 });
    const out = [...page.entries];
    while (page.has_more) {
      page = await rpc("files/list_folder/continue", { cursor: page.cursor });
      out.push(...page.entries);
    }
    return out;
  } catch (e) {
    if (e instanceof DropboxError && e.notFound) return [];
    throw e;
  }
}

/** Folders inside `path` ("" is the root), to choose the team folder. */
export async function browseDropbox(path: string): Promise<Array<{ name: string; path: string }>> {
  return (await listAll(path))
    .filter((e) => e[".tag"] === "folder")
    .map((e) => ({ name: e.name, path: e.path_display ?? `${path}/${e.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export class DropboxFolderFs implements FolderFs {
  readonly kind = "dropbox" as const;
  readonly label: string;
  /** Dropbox is a few calls away: look for changes less often than on disk. */
  readonly pollMs = 4000;

  /** `root`: the team folder's path in Dropbox ("/Equipo/Sweet Flow"). */
  constructor(private readonly root: string) {
    this.label = root.split("/").filter(Boolean).at(-1) ?? "Dropbox";
  }

  private abs(path: string): string {
    const p = joinPath(this.root.replace(/\/+$/, ""), path);
    return p.startsWith("/") ? p : `/${p}`;
  }

  async list(dir: string): Promise<FsEntry[]> {
    return (await listAll(this.abs(dir))).filter((e) => e[".tag"] !== "deleted").map(toEntry);
  }

  /** Every file under `dir`, in one go (change detection). */
  async listFiles(dir: string): Promise<Array<FsEntry & { path: string }>> {
    const base = this.abs(dir);
    return (await listAll(base, true))
      .filter((e) => e[".tag"] === "file")
      .map((e) => ({ ...toEntry(e), path: joinPath(dir, (e.path_display ?? "").slice(base.length + 1)) }));
  }

  async readText(path: string): Promise<string | null> {
    const b = await this.readBlob(path);
    return b ? b.text() : null;
  }

  async readBlob(path: string): Promise<Blob | null> {
    try {
      return await (await call(`${CONTENT}/files/download`, { arg: { path: this.abs(path) } })).blob();
    } catch (e) {
      if (e instanceof DropboxError && e.notFound) return null;
      throw e;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBlob(path, new Blob([text], { type: "text/plain" }));
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    const commit = { path: this.abs(path), mode: "overwrite", autorename: false, mute: true };
    if (data.size <= CHUNK) {
      await call(`${CONTENT}/files/upload`, { arg: commit, body: data });
      return;
    }
    const start = (await (await call(`${CONTENT}/files/upload_session/start`, { arg: { close: false }, body: data.slice(0, CHUNK) })).json()) as { session_id: string };
    let offset = CHUNK;
    while (data.size - offset > CHUNK) {
      await call(`${CONTENT}/files/upload_session/append_v2`, { arg: { cursor: { session_id: start.session_id, offset }, close: false }, body: data.slice(offset, offset + CHUNK) });
      offset += CHUNK;
    }
    await call(`${CONTENT}/files/upload_session/finish`, { arg: { cursor: { session_id: start.session_id, offset }, commit }, body: data.slice(offset) });
  }

  async mkdir(path: string): Promise<void> {
    if (!path) return;
    try {
      await rpc("files/create_folder_v2", { path: this.abs(path), autorename: false });
    } catch (e) {
      if (!(e instanceof DropboxError && e.conflict)) throw e;
    }
  }

  async move(from: string, to: string): Promise<void> {
    if (from === to) return;
    try {
      await rpc("files/move_v2", { from_path: this.abs(from), to_path: this.abs(to), autorename: false });
    } catch (e) {
      // Nothing there (never created, or already moved by someone else).
      if (e instanceof DropboxError && /from_lookup\/not_found/.test(e.summary)) return;
      throw e;
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await rpc("files/delete_v2", { path: this.abs(path) });
    } catch (e) {
      if (!(e instanceof DropboxError && e.notFound)) throw e;
    }
  }

  /** Makes the folder a Dropbox shared folder (if it isn't one) and adds them as editor. */
  async share(path: string, email: string): Promise<void> {
    const id = await this.sharedFolderId(path, true);
    try {
      await rpc("sharing/add_folder_member", {
        shared_folder_id: id,
        members: [{ member: { ".tag": "email", email }, access_level: { ".tag": "editor" } }],
        quiet: false,
      });
    } catch (e) {
      if (e instanceof DropboxError && /already/.test(e.summary)) return;
      throw e;
    }
  }

  async unshare(path: string, email: string): Promise<void> {
    const id = await this.sharedFolderId(path, false);
    if (!id) return;
    try {
      await rpc("sharing/remove_folder_member", { shared_folder_id: id, member: { ".tag": "email", email }, leave_a_copy: false });
    } catch (e) {
      if (!(e instanceof DropboxError && /not_a_member|member_error/.test(e.summary))) throw e;
    }
  }

  private async sharedFolderId(path: string, create: boolean): Promise<string | null> {
    const meta = await rpc<{ shared_folder_id?: string; sharing_info?: { shared_folder_id?: string } }>("files/get_metadata", { path: this.abs(path) });
    const known = meta.shared_folder_id ?? meta.sharing_info?.shared_folder_id;
    if (known || !create) return known ?? null;
    try {
      let r = await rpc<{ ".tag": string; shared_folder_id?: string; async_job_id?: string }>("sharing/share_folder", { path: this.abs(path), force_async: false });
      for (let i = 0; r[".tag"] === "async_job_id" && i < 20; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        r = await rpc("sharing/check_share_job_status", { async_job_id: r.async_job_id });
      }
      if (!r.shared_folder_id) throw new Error("Dropbox no ha terminado de compartir la carpeta.");
      return r.shared_folder_id;
    } catch (e) {
      // Dropbox doesn't share a folder inside another shared folder (docs/USUARIOS.md §2).
      if (e instanceof DropboxError && /inside_shared_folder|contains_shared_folder/.test(e.summary)) {
        throw new Error("Dropbox no deja compartir una carpeta que está dentro de otra ya compartida (ni una que contiene otra compartida). Comparte la carpeta de arriba o reorganiza las carpetas.");
      }
      throw e;
    }
  }
}

function toEntry(e: DbxEntry): FsEntry {
  return e[".tag"] === "folder"
    ? { name: e.name, kind: "dir" }
    : { name: e.name, kind: "file", size: e.size, modified: e.server_modified ? Date.parse(e.server_modified) : undefined };
}
