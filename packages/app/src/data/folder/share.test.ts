import { describe, expect, it } from "vitest";
import { shareRoots } from "@sweetflow/domain";
import type { LibraryEntry } from "../library";
import { FolderEntries, openDashboard } from "./folderEntries";
import { joinPath, MemoryFolderFs, type FolderFs, type FsEntry } from "./fs";
import { TeamLog } from "./teamLog";

/** A folder inside another, as someone who only has that folder sees it in their Dropbox or Drive. */
class SubFolderFs implements FolderFs {
  readonly kind = "memory" as const;
  readonly label: string;
  constructor(private readonly inner: MemoryFolderFs, private readonly at: string) {
    this.label = at;
  }
  private p = (path: string) => joinPath(this.at, path);
  list = (dir: string): Promise<FsEntry[]> => this.inner.list(this.p(dir));
  readText = (path: string) => this.inner.readText(this.p(path));
  writeText = (path: string, text: string) => this.inner.writeText(this.p(path), text);
  readBlob = (path: string) => this.inner.readBlob(this.p(path));
  writeBlob = (path: string, b: Blob) => this.inner.writeBlob(this.p(path), b);
  mkdir = (path: string) => this.inner.mkdir(this.p(path));
  move = (from: string, to: string) => this.inner.move(this.p(from), this.p(to));
  remove = (path: string) => this.inner.remove(this.p(path));
}

const entry = (id: string, kind: LibraryEntry["kind"], name: string, parentId: string | null): LibraryEntry => ({ id, kind, name, parentId, createdAt: 1, updatedAt: 1 });

/** Like folderLibrary(): the dashboard and the team, wired together. */
async function open(fs: FolderFs, device: string, email: string) {
  let team: TeamLog | null = null;
  const lib = new FolderEntries(fs, device, () => email, () => (team ? shareRoots(team.state()) : []));
  await lib.init();
  team = new TeamLog(fs, device, lib, () => ({ email, name: email.split("@")[0]! }));
  await openDashboard(lib, team);
  const sync = async () => {
    await lib.flushed();
    await team!.flushed();
    await lib.syncShares();
    await team!.syncShares();
  };
  return { lib, team, sync };
}

describe("a folder shared on its own", () => {
  it("is all its member sees, and changes go both ways", async () => {
    const disk = new MemoryFolderFs();
    const ana = await open(disk, "dev-ana", "ana@x.com");
    ana.lib.save([entry("f1", "folder", "Mareas", null), entry("p1", "production", "Ep 01", "f1"), entry("f2", "folder", "Spots", null)]);
    await ana.sync();
    expect(ana.team.state().owner?.email).toBe("ana@x.com");

    // Ana invites Bea to «Mareas» only: the folder gets its own copy of the logs.
    ana.team.invite({ email: "bea@x.com", access: ["f1"] });
    await ana.sync();
    expect(disk.files.has("Mareas/.sweetflow/share.json")).toBe(true);

    // Bea has just that folder in her Dropbox: she sees «Mareas» at the top and what is inside.
    const bea = await open(new SubFolderFs(disk, "Mareas"), "dev-bea", "bea@x.com");
    expect(bea.lib.mounted?.entryId).toBe("f1");
    expect(bea.lib.load().map((e) => [e.id, e.parentId])).toEqual([["f1", null], ["p1", "f1"]]);
    expect(bea.lib.pathOf("p1")).toBe("Ep-01");
    // She knows the team (who owns it, that she is in it) and doesn't claim it.
    expect(bea.team.state().owner?.email).toBe("ana@x.com");
    expect(bea.team.state().members.map((m) => m.email)).toEqual(["bea@x.com"]);

    // Bea creates a production inside: its folder is in «Mareas», and Ana sees it.
    bea.lib.save([...bea.lib.load(), entry("p2", "production", "Ep 02", "f1")]);
    await bea.sync();
    expect(disk.files.has("Mareas/Ep-02/.sweetflow/production.json")).toBe(true);
    await ana.lib.reread();
    expect(ana.lib.load().find((e) => e.id === "p2")?.parentId).toBe("f1");

    // Ana renames the episode: Bea sees it, and the folder moved only once.
    ana.lib.save(ana.lib.load().map((e) => (e.id === "p1" ? { ...e, name: "Ep 01 La partida" } : e)));
    await ana.sync();
    await bea.lib.reread();
    expect(bea.lib.load().find((e) => e.id === "p1")?.name).toBe("Ep 01 La partida");
    expect(disk.dirs.has("Mareas/Ep-01-La-partida")).toBe(true);
    // «Spots» never reached Bea's copy.
    expect(bea.lib.load().some((e) => e.id === "f2")).toBe(false);
  });

  it("a member invites to what they have, if the owner allows it", async () => {
    const disk = new MemoryFolderFs();
    const ana = await open(disk, "dev-ana", "ana@x.com");
    ana.lib.save([entry("f1", "folder", "Mareas", null), entry("p1", "production", "Ep 01", "f1")]);
    ana.team.invite({ email: "bea@x.com", access: ["f1"] });
    await ana.sync();
    const bea = await open(new SubFolderFs(disk, "Mareas"), "dev-bea", "bea@x.com");
    expect(bea.team.canInvite()).toBe(true);
    bea.team.invite({ email: "cris@x.com", access: ["p1"] });
    await bea.sync();
    // The episode is now shared on its own too, with its own copy.
    expect(disk.files.has("Mareas/Ep-01/.sweetflow/share.json")).toBe(true);
    const ana2 = await open(disk, "dev-ana2", "ana@x.com");
    expect(ana2.team.state().members.map((m) => m.email)).toEqual(["bea@x.com", "cris@x.com"]);

    ana2.team.setMembersCanInvite(false);
    await ana2.sync();
    await bea.team.reread();
    expect(bea.team.canInvite()).toBe(false);
  });
});
