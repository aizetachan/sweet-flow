import { describe, expect, it } from "vitest";
import { defaultLevels, defaultStatuses, type Member } from "@sweetflow/domain";
import type { LibraryEntry } from "../library";
import { LocalSource } from "../local/LocalSource";
import { FolderEntries } from "./folderEntries";
import { FolderLogStore } from "./FolderLogStore";
import { MemoryFolderFs } from "./fs";

const entry = (id: string, kind: LibraryEntry["kind"], name: string, parentId: string | null, createdAt = 1): LibraryEntry => ({ id, kind, name, parentId, createdAt, updatedAt: createdAt });
const me: Member = { uid: "u1", email: "", displayName: "Uno", role: "owner", magnificConnected: false };

describe("team folder", () => {
  it("projects the dashboard onto real folders and follows renames and moves", async () => {
    const fs = new MemoryFolderFs();
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("f1", "folder", "Mareas", null), entry("f2", "folder", "Temporada 1", "f1")]);
    lib.save([...lib.load(), entry("p1", "production", "Ep 01 · La partida", "f2")]);
    await lib.flushed();
    expect(fs.dirs.has("Mareas/Temporada-1/Ep-01-La-partida")).toBe(true);
    expect(fs.files.has("Mareas/Temporada-1/Ep-01-La-partida/.sweetflow/production.json")).toBe(true);

    // Rename the series and move the season to the top: folders follow, contents too.
    lib.save(lib.load().map((e) => (e.id === "f1" ? { ...e, name: "Mareas (serie)" } : e)));
    lib.save(lib.load().map((e) => (e.id === "f2" ? { ...e, parentId: null } : e)));
    await lib.flushed();
    expect(fs.dirs.has("Mareas-(serie)")).toBe(true);
    expect(fs.files.has("Temporada-1/Ep-01-La-partida/.sweetflow/production.json")).toBe(true);
    expect(lib.pathOf("p1")).toBe("Temporada-1/Ep-01-La-partida");

    // Deleted for good: the folder goes.
    lib.save(lib.load().filter((e) => e.id !== "f1"));
    await lib.flushed();
    expect(fs.dirs.has("Mareas-(serie)")).toBe(false);
  });

  it("merges what two devices write in the same folder", async () => {
    const fs = new MemoryFolderFs();
    const a = new FolderEntries(fs, "dev-a", () => "u1");
    const b = new FolderEntries(fs, "dev-b", () => "u2");
    await a.init();
    await b.init();
    a.save([entry("f1", "folder", "Spots", null, 1)]);
    b.save([entry("f2", "folder", "Mareas", null, 2)]);
    await a.flushed();
    await b.flushed();
    const c = new FolderEntries(fs, "dev-c", () => "u3");
    await c.init();
    expect(c.load().map((e) => e.name).sort()).toEqual(["Mareas", "Spots"]);
  });

  it("keeps a production's log inside its folder, wherever it moves", async () => {
    const fs = new MemoryFolderFs();
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("f1", "folder", "Spots", null), entry("p1", "production", "Anuncio", "f1")]);
    const store = new FolderLogStore(fs, () => lib.pathOf("p1"));
    const src = new LocalSource({ store, deviceId: "dev-a", me, create: { id: "p1", name: "Anuncio", levels: defaultLevels((p) => `${p}1`), statuses: defaultStatuses((p) => `${p}2`) } });
    await src.ready;
    src.createNode(null, "Apertura");
    await src.flushed();
    src.dispose();
    await lib.flushed();
    expect([...fs.files.keys()].some((p) => p.startsWith("Spots/Anuncio/.sweetflow/log/dev-a/"))).toBe(true);

    lib.save(lib.load().map((e) => (e.id === "p1" ? { ...e, parentId: null } : e)));
    await lib.flushed();
    const reopened = new LocalSource({ store: new FolderLogStore(fs, () => lib.pathOf("p1")), deviceId: "dev-b", me });
    await reopened.ready;
    let titles: string[] = [];
    reopened.subscribe((s) => (titles = s.nodes.map((n) => n.title)));
    expect(titles).toEqual(["Apertura"]);
    reopened.dispose();
  });
});
