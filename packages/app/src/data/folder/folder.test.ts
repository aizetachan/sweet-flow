import { describe, expect, it } from "vitest";
import { defaultLevels, defaultStatuses, type Member } from "@sweetflow/domain";
import type { LibraryEntry } from "../library";
import { LocalSource } from "../local/LocalSource";
import { FolderEntries } from "./folderEntries";
import { FolderLogStore } from "./FolderLogStore";
import { MemoryFolderFs } from "./fs";
import { ProductionFiles } from "./ProductionFiles";
import type { GenerationRequest, Generator } from "../generation";

const entry = (id: string, kind: LibraryEntry["kind"], name: string, parentId: string | null, createdAt = 1): LibraryEntry => ({ id, kind, name, parentId, createdAt, updatedAt: createdAt });
let seq = 0;
const uniq = (p: string) => `${p}${++seq}`;
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

  it("generates into the shot's _media folder and the folders follow renames", async () => {
    const fs = new MemoryFolderFs();
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("p1", "production", "Anuncio", null)]);
    const asked: GenerationRequest[] = [];
    let polls = 0;
    const generator: Generator = {
      provider: "test",
      connected: () => true,
      estimate: async () => 60,
      start: async (req) => (asked.push(req), { id: "c1", folder: "ref" }),
      poll: async () => (++polls < 2 ? { status: "pending", progress: 40 } : { status: "done", url: "https://cdn/x.png", width: 1920, height: 1080 }),
      download: async () => new Blob(["png"], { type: "image/png" }),
      viewUrl: (u) => u,
    };
    const base = () => lib.pathOf("p1");
    const src = new LocalSource({
      store: new FolderLogStore(fs, base),
      files: new ProductionFiles(fs, base),
      generator,
      deviceId: "dev-a",
      me,
      create: { id: "p1", name: "Anuncio", levels: defaultLevels(uniq), statuses: defaultStatuses(uniq) },
    });
    await src.ready;
    const sq = src.createNode(null, "Apertura");
    const sc = src.createNode(sq, "Puerto");
    const sh = src.createNode(sc, "Faro");
    src.generate({ nodeId: sh, kind: "image", prompt: "un faro", model: "Recraft V4.1" });
    for (let i = 0; i < 100 && !fs.blobs.size; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 10));

    expect(asked[0]!.folderPath).toEqual(["Anuncio", "SQ010_Apertura", "SC010_Puerto", "SH0010_Faro"]);
    expect([...fs.blobs.keys()]).toEqual(["Anuncio/SQ010_Apertura/SC010_Puerto/SH0010_Faro/_media/SH0010_img_v001.png"]);
    let media: Array<{ status: string; file?: string; version: number }> = [];
    src.subscribe((s) => (media = s.media));
    expect(media).toMatchObject([{ status: "ready", file: "SH0010_img_v001.png", version: 1 }]);

    let urls: Array<string | undefined> = [];
    src.subscribe((s) => (urls = s.media.map((m) => m.url)));
    expect(urls[0]).toMatch(/^blob:/);
    const shown = urls[0];

    // Renaming the scene moves its folder, with the shot and its media inside.
    src.updateNode(sc, { title: "Muelle" });
    // What is on screen keeps showing meanwhile (and after).
    expect(urls[0]).toBe(shown);
    await src.flushed();
    await new Promise((r) => setTimeout(r, 20));
    expect([...fs.blobs.keys()]).toEqual(["Anuncio/SQ010_Apertura/SC010_Muelle/SH0010_Faro/_media/SH0010_img_v001.png"]);
    expect(urls[0]).toBe(shown);
    src.dispose();
  });

  it("cuts a shot into shots: the original and its video go to the scene's _editados", async () => {
    const fs = new MemoryFolderFs();
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("p1", "production", "Anuncio", null)]);
    const generator: Generator = {
      provider: "test",
      connected: () => true,
      estimate: async () => 1,
      start: async () => ({ id: "c1" }),
      poll: async () => ({ status: "done", url: "https://cdn/x.mp4", durationSec: 10 }),
      download: async () => new Blob(["mp4"], { type: "video/mp4" }),
      viewUrl: (u) => u,
    };
    const base = () => lib.pathOf("p1");
    const src = new LocalSource({ store: new FolderLogStore(fs, base), files: new ProductionFiles(fs, base), generator, deviceId: "dev-a", me, create: { id: "p1", name: "Anuncio", levels: defaultLevels(uniq), statuses: defaultStatuses(uniq) } });
    await src.ready;
    const sc = src.createNode(src.createNode(null, "Apertura"), "Puerto");
    const sh = src.createNode(sc, "Faro");
    src.generate({ nodeId: sh, kind: "video", prompt: "un faro", model: "Kling 2.5", durationSec: 10 });
    for (let i = 0; i < 100 && !fs.blobs.size; i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 10));
    let snap: Parameters<Parameters<LocalSource["subscribe"]>[0]>[0] | undefined;
    src.subscribe((s) => (snap = s));
    const video = snap!.media[0]!;

    const ids = src.splitIntoShots(video.id, [{ inSec: 0, outSec: 4 }, { inSec: 6, outSec: 10 }]);
    await src.flushed();
    await new Promise((r) => setTimeout(r, 20));
    expect(snap!.nodes.filter((n) => n.parentId === sc).map((n) => n.number)).toEqual([10, 20]);
    expect(snap!.shelf.map((n) => n.id)).toEqual([sh]);
    expect(snap!.takes.map((t) => `${t.nodeId === ids[0] ? "a" : "b"}:${t.inSec}-${t.outSec}`)).toEqual(["a:0-4", "b:6-10"]);
    expect([...fs.blobs.keys()]).toEqual(["Anuncio/SQ010_Apertura/SC010_Puerto/_editados/SH0010_Faro/_media/SH0010_vid_v001.mp4"]);
    expect(fs.dirs.has("Anuncio/SQ010_Apertura/SC010_Puerto/SH0010_Faro")).toBe(true);
    expect(fs.dirs.has("Anuncio/SQ010_Apertura/SC010_Puerto/SH0020_Faro")).toBe(true);
    // Still playable from the shelf: the new shots' takes point at it.
    expect(snap!.media[0]!.file).toBe("SH0010_vid_v001.mp4");

    // Back on the row (as SH0030: its code is taken), out of _editados.
    expect(src.unshelveNode(sh)).toBe(30);
    await src.flushed();
    await new Promise((r) => setTimeout(r, 20));
    expect([...fs.blobs.keys()]).toEqual(["Anuncio/SQ010_Apertura/SC010_Puerto/SH0030_Faro/_media/SH0010_vid_v001.mp4"]);
    src.dispose();
  });

  it("keeps a group of shots as a folder inside the scene, following renames and undo", async () => {
    const fs = new MemoryFolderFs();
    const lib = new FolderEntries(fs, "dev-a", () => "u1");
    await lib.init();
    lib.save([entry("p1", "production", "Anuncio", null)]);
    const base = () => lib.pathOf("p1");
    const src = new LocalSource({ store: new FolderLogStore(fs, base), files: new ProductionFiles(fs, base), deviceId: "dev-a", me, create: { id: "p1", name: "Anuncio", levels: defaultLevels(uniq), statuses: defaultStatuses(uniq) } });
    await src.ready;
    const sc = src.createNode(src.createNode(null, "Apertura"), "Puerto");
    const a = src.createNode(sc, "Faro");
    const b = src.createNode(sc, "Muelle");
    const settle = async () => { await src.flushed(); await new Promise((r) => setTimeout(r, 20)); };
    await settle();
    const scene = "Anuncio/SQ010_Apertura/SC010_Puerto";

    const g = src.groupShots([b], { shotId: a })!;
    await settle();
    expect(fs.dirs.has(`${scene}/Grupo-1/SH0010_Faro`)).toBe(true);
    expect(fs.dirs.has(`${scene}/Grupo-1/SH0020_Muelle`)).toBe(true);
    expect(fs.dirs.has(`${scene}/SH0010_Faro`)).toBe(false);

    src.renameGroup(g, "Por decidir");
    await settle();
    expect(fs.dirs.has(`${scene}/Por-decidir/SH0020_Muelle`)).toBe(true);
    expect(fs.dirs.has(`${scene}/Grupo-1`)).toBe(false);

    src.dissolveGroup(g);
    await settle();
    expect(fs.dirs.has(`${scene}/SH0010_Faro`)).toBe(true);
    expect(fs.dirs.has(`${scene}/SH0020_Muelle`)).toBe(true);
    expect(fs.dirs.has(`${scene}/Por-decidir`)).toBe(false);
    src.dispose();
  });
});
