import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry } from "../library";
import { DropboxFolderFs } from "./dropboxFs";
import { FolderEntries } from "./folderEntries";
import { logFiles } from "./fs";

/**
 * The Dropbox folder against a pretend Dropbox (its HTTP API in memory), so
 * the same dashboard and logs work on it as on a folder of this computer.
 */
class FakeDropbox {
  files = new Map<string, { path: string; data: Uint8Array; at: number }>();
  dirs = new Map<string, string>([["", ""]]);
  tick = 0;

  private mkdirs(path: string) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const p = `/${parts.slice(0, i).join("/")}`;
      if (!this.dirs.has(p.toLowerCase())) this.dirs.set(p.toLowerCase(), p);
    }
  }
  private parent = (p: string) => p.slice(0, p.lastIndexOf("/"));
  private err = (summary: string) => new Response(JSON.stringify({ error_summary: summary }), { status: 409 });

  async handle(url: string, init: RequestInit): Promise<Response> {
    const h = init.headers as Record<string, string>;
    for (const v of Object.values(h)) if (/[^\x20-\x7e]/.test(v)) throw new TypeError("header with non-ASCII characters");
    const arg = h["Dropbox-API-Arg"] ? JSON.parse(h["Dropbox-API-Arg"]) : init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    const route = url.replace(/^https:\/\/(api|content)\.dropboxapi\.com\/2\//, "");
    const lower = (p: string) => p.toLowerCase();
    switch (route) {
      case "users/get_current_account":
        return Response.json({ name: { display_name: "Ana" }, email: "ana@estudio.com", root_info: { root_namespace_id: "1", home_namespace_id: "1" } });
      case "files/list_folder": {
        const base = lower(arg.path);
        if (!this.dirs.has(base)) return this.err("path/not_found/");
        const inside = (p: string) => p.startsWith(`${base}/`) && (arg.recursive || !p.slice(base.length + 1).includes("/"));
        const entries = [
          ...[...this.dirs.entries()].filter(([k]) => inside(k)).map(([, path]) => ({ ".tag": "folder", name: path.split("/").at(-1), path_display: path, path_lower: lower(path) })),
          ...[...this.files.entries()].filter(([k]) => inside(k)).map(([, f]) => ({ ".tag": "file", name: f.path.split("/").at(-1), path_display: f.path, path_lower: lower(f.path), size: f.data.length, server_modified: new Date(f.at * 1000).toISOString() })),
        ];
        return Response.json({ entries, cursor: "c", has_more: false });
      }
      case "files/download": {
        const f = this.files.get(lower(arg.path));
        return f ? new Response(new Blob([f.data as BlobPart])) : this.err("path/not_found/");
      }
      case "files/upload": {
        this.mkdirs(this.parent(arg.path));
        this.files.set(lower(arg.path), { path: arg.path, data: new Uint8Array(await new Response(init.body).arrayBuffer()), at: ++this.tick });
        return Response.json({});
      }
      case "files/create_folder_v2":
        if (this.dirs.has(lower(arg.path))) return this.err("path/conflict/folder/");
        this.mkdirs(arg.path);
        return Response.json({});
      case "files/move_v2": {
        const from = lower(arg.from_path);
        if (!this.dirs.has(from) && !this.files.has(from)) return this.err("from_lookup/not_found/");
        const re = (p: string) => arg.to_path + p.slice(arg.from_path.length);
        for (const [k, v] of [...this.dirs]) if (k === from || k.startsWith(`${from}/`)) (this.dirs.delete(k), this.dirs.set(lower(re(v)), re(v)));
        for (const [k, f] of [...this.files]) if (k === from || k.startsWith(`${from}/`)) (this.files.delete(k), this.files.set(lower(re(f.path)), { ...f, path: re(f.path) }));
        this.mkdirs(this.parent(arg.to_path));
        return Response.json({});
      }
      case "files/delete_v2": {
        const p = lower(arg.path);
        if (!this.dirs.has(p) && !this.files.has(p)) return this.err("path_lookup/not_found/");
        for (const k of [...this.dirs.keys()]) if (k === p || k.startsWith(`${p}/`)) this.dirs.delete(k);
        for (const k of [...this.files.keys()]) if (k === p || k.startsWith(`${p}/`)) this.files.delete(k);
        return Response.json({});
      }
    }
    return new Response("unknown route", { status: 400 });
  }
}

const entry = (id: string, kind: LibraryEntry["kind"], name: string, parentId: string | null, createdAt = 1): LibraryEntry => ({ id, kind, name, parentId, createdAt, updatedAt: createdAt });

describe("team folder in Dropbox", () => {
  let dbx: FakeDropbox;
  beforeEach(() => {
    dbx = new FakeDropbox();
    const store = new Map<string, string>([["sweetflow:dropbox:session", JSON.stringify({ accessToken: "t", expiresAt: Date.now() + 3_600_000 })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => dbx.handle(url, init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the dashboard as real folders, also under a folder with accents, and follows moves", async () => {
    const fs = new DropboxFolderFs("/Equipo/Producción");
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("f1", "folder", "Señales", null), entry("p1", "production", "Ep 01 · La canción", "f1")]);
    await lib.flushed();
    expect([...dbx.dirs.values()]).toContain("/Equipo/Producción/Senales/Ep-01-La-cancion");
    expect(await fs.readText("Senales/Ep-01-La-cancion/.sweetflow/production.json")).toContain("p1");

    lib.save(lib.load().map((e) => (e.id === "p1" ? { ...e, parentId: null } : e)));
    await lib.flushed();
    expect(await fs.readText("Ep-01-La-cancion/.sweetflow/production.json")).toContain("p1");
    expect(await fs.readText("Senales/Ep-01-La-cancion/.sweetflow/production.json")).toBeNull();
  });

  it("merges what two devices write, and lists the logs in one call", async () => {
    const a = new FolderEntries(new DropboxFolderFs("/Equipo"), "dev-a", () => "u1");
    const b = new FolderEntries(new DropboxFolderFs("/Equipo"), "dev-b", () => "u2");
    await a.init();
    await b.init();
    a.save([entry("f1", "folder", "Spots", null, 1)]);
    b.save([entry("f2", "folder", "Mareas", null, 2)]);
    await a.flushed();
    await b.flushed();
    const fs = new DropboxFolderFs("/Equipo");
    const c = new FolderEntries(fs, "dev-c", () => "u3");
    await c.init();
    expect(c.load().map((e) => e.name).sort()).toEqual(["Mareas", "Spots"]);
    expect((await logFiles(fs, ".sweetflow/library")).map((f) => f.path.split("/").slice(-2)[0]).sort()).toEqual(["dev-a", "dev-b"]);
  });

  it("treats what is missing as missing", async () => {
    const fs = new DropboxFolderFs("/Equipo");
    expect(await fs.list("nada")).toEqual([]);
    expect(await fs.readBlob("nada/x.png")).toBeNull();
    await fs.remove("nada");
    await fs.move("nada", "otra");
    await fs.mkdir("a/b");
    await fs.mkdir("a/b");
    expect((await fs.list("a")).map((e) => e.name)).toEqual(["b"]);
  });
});
