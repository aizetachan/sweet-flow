/**
 * The production's own folders on disk (docs/ARCHITECTURE.md §5.2): one per
 * sequence, scene and shot, named with `folderName()`, each with its
 * `_media/`. The tree is a projection of the log: the device that creates,
 * renames, renumbers or moves a node changes its folder, and the sync carries
 * it to the rest.
 */

import { folderPath, type Id, type ProdNode, type Production, type ShotGroup } from "@sweetflow/domain";
import { joinPath, type FolderFs } from "./fs";

export const MEDIA_DIR = "_media";

export class ProductionFiles {
  /**
   * Object URLs of files already read, by the file's own key (the media), not
   * its path: renaming or moving a node moves its folder, and what is on
   * screen must not go blank meanwhile.
   */
  private urls = new Map<string, string>();
  private loading = new Set<string>();

  constructor(
    readonly fs: FolderFs,
    private readonly base: () => string | null,
  ) {}

  /** Folder of a node, from the team folder's root. */
  nodeDir(p: Production, nodes: ProdNode[], node: ProdNode, groups: ShotGroup[] = []): string | null {
    const base = this.base();
    return base === null ? null : joinPath(base, folderPath(p, nodes, node, groups));
  }

  mediaPath(p: Production, nodes: ProdNode[], node: ProdNode, file: string, groups: ShotGroup[] = []): string | null {
    const dir = this.nodeDir(p, nodes, node, groups);
    return dir === null ? null : joinPath(dir, MEDIA_DIR, file);
  }

  async saveMedia(path: string, data: Blob, key = path): Promise<void> {
    await this.fs.writeBlob(path, data);
    const old = this.urls.get(key);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(key, URL.createObjectURL(data));
  }

  /**
   * URL to show a file: at once if already read (under `key`, wherever it is
   * now); otherwise reads it from `path` and calls `onReady`. Not there yet
   * (its folder is being moved): tried again on the next call.
   */
  url(path: string, onReady: () => void, key = path): string | undefined {
    const hit = this.urls.get(key);
    if (hit || this.loading.has(key)) return hit;
    this.loading.add(key);
    void this.fs
      .readBlob(path)
      .then((b) => {
        if (!b) return;
        this.urls.set(key, URL.createObjectURL(b));
        onReady();
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(key));
    return undefined;
  }

  /**
   * Makes the folders follow the tree after this device changed it: new nodes
   * get their folder, renamed/renumbered/moved ones are moved (parents first),
   * deleted ones are removed. Nodes in the trash keep their folder. Shots
   * follow their group's folder; a group folder left empty is removed.
   */
  async follow(p: Production, before: ProdNode[], after: ProdNode[], groupsBefore: ShotGroup[] = [], groupsAfter: ShotGroup[] = []): Promise<void> {
    const base = this.base();
    if (base === null) return;
    const prevById = new Map(before.map((n) => [n.id, n]));
    const nextById = new Map(after.map((n) => [n.id, n]));
    const pathIn = (nodes: ProdNode[], n: ProdNode, groups: ShotGroup[]) => joinPath(base, folderPath(p, nodes, n, groups));
    const was = new Map<Id, string>(before.map((n) => [n.id, pathIn(before, n, groupsBefore)]));
    const is = new Map<Id, string>(after.map((n) => [n.id, pathIn(after, n, groupsAfter)]));

    for (const n of before) {
      if (nextById.has(n.id)) continue;
      // Removed for good; a removed parent takes it along.
      if (n.parentId && !nextById.has(n.parentId) && prevById.has(n.parentId)) continue;
      await this.fs.remove(was.get(n.id)!);
    }
    const depth = (n: ProdNode) => is.get(n.id)!.split("/").length;
    const byDepth = [...after].sort((a, b) => depth(a) - depth(b));
    // Moves first: a shot cut into shots leaves for `_editados/` before the
    // first new shot (same code, often same title) makes its folder.
    for (const n of byDepth) {
      const to = is.get(n.id)!;
      const old = was.get(n.id);
      if (old === undefined || old === to) continue;
      // Where it is right now: under where its old parent is now (already
      // moved), at the same place inside it (its old name, or `_editados/` + name).
      const oldParent = prevById.get(n.id)!.parentId;
      const parentWas = oldParent ? was.get(oldParent)! : base;
      const parentNow = oldParent ? is.get(oldParent) ?? parentWas : base;
      const now = joinPath(parentNow, old.slice(parentWas.length).replace(/^\//, ""));
      if (now !== to) await this.fs.move(now, to);
    }
    for (const n of byDepth) if (!was.has(n.id)) await this.fs.mkdir(is.get(n.id)!);
    // Group folders nothing lives in any more (dissolved, renamed, emptied).
    const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
    const inUse = new Set([...is.values()].map(dirOf));
    const old = new Set(before.filter((n) => n.groupId && was.get(n.id) !== is.get(n.id)).map((n) => dirOf(was.get(n.id)!)));
    for (const dir of old) {
      if (inUse.has(dir)) continue;
      // Gone already when its scene moved; never removes anything still inside.
      const left = await this.fs.list(dir).catch(() => null);
      if (left && !left.length) await this.fs.remove(dir);
    }
  }
}
