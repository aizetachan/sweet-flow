/**
 * The production's own folders on disk (docs/ARCHITECTURE.md §5.2): one per
 * sequence, scene and shot, named with `folderName()`, each with its
 * `_media/`. The tree is a projection of the log: the device that creates,
 * renames, renumbers or moves a node changes its folder, and the sync carries
 * it to the rest.
 */

import { folderPath, type Id, type ProdNode, type Production } from "@sweetflow/domain";
import { joinPath, type FolderFs } from "./fs";

export const MEDIA_DIR = "_media";

export class ProductionFiles {
  /** Object URLs of files already read, by path. */
  private urls = new Map<string, string>();
  private loading = new Set<string>();

  constructor(
    readonly fs: FolderFs,
    private readonly base: () => string | null,
  ) {}

  /** Folder of a node, from the team folder's root. */
  nodeDir(p: Production, nodes: ProdNode[], node: ProdNode): string | null {
    const base = this.base();
    return base === null ? null : joinPath(base, folderPath(p, nodes, node));
  }

  mediaPath(p: Production, nodes: ProdNode[], node: ProdNode, file: string): string | null {
    const dir = this.nodeDir(p, nodes, node);
    return dir === null ? null : joinPath(dir, MEDIA_DIR, file);
  }

  async saveMedia(path: string, data: Blob): Promise<void> {
    await this.fs.writeBlob(path, data);
    const old = this.urls.get(path);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(path, URL.createObjectURL(data));
  }

  /** URL to show a file: at once if already read; otherwise reads it and calls `onReady`. */
  url(path: string, onReady: () => void): string | undefined {
    const hit = this.urls.get(path);
    if (hit || this.loading.has(path)) return hit;
    this.loading.add(path);
    void this.fs
      .readBlob(path)
      .then((b) => {
        if (b) this.urls.set(path, URL.createObjectURL(b));
        if (b) onReady();
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(path));
    return undefined;
  }

  /**
   * Makes the folders follow the tree after this device changed it: new nodes
   * get their folder, renamed/renumbered/moved ones are moved (parents first),
   * deleted ones are removed. Nodes in the trash keep their folder.
   */
  async follow(p: Production, before: ProdNode[], after: ProdNode[]): Promise<void> {
    const base = this.base();
    if (base === null) return;
    const prevById = new Map(before.map((n) => [n.id, n]));
    const nextById = new Map(after.map((n) => [n.id, n]));
    const pathIn = (nodes: ProdNode[], n: ProdNode) => joinPath(base, folderPath(p, nodes, n));
    const was = new Map<Id, string>(before.map((n) => [n.id, pathIn(before, n)]));
    const is = new Map<Id, string>(after.map((n) => [n.id, pathIn(after, n)]));

    for (const n of before) {
      if (nextById.has(n.id)) continue;
      // Removed for good; a removed parent takes it along.
      if (n.parentId && !nextById.has(n.parentId) && prevById.has(n.parentId)) continue;
      await this.fs.remove(was.get(n.id)!);
    }
    const depth = (n: ProdNode) => is.get(n.id)!.split("/").length;
    for (const n of [...after].sort((a, b) => depth(a) - depth(b))) {
      const to = is.get(n.id)!;
      const old = was.get(n.id);
      if (old === undefined) {
        await this.fs.mkdir(to);
        continue;
      }
      if (old === to) continue;
      // Where it is right now: under where its old parent is now (already moved), with its old name.
      const oldParent = prevById.get(n.id)!.parentId;
      const parentNow = oldParent ? is.get(oldParent) ?? was.get(oldParent)! : base;
      const now = joinPath(parentNow, old.slice(old.lastIndexOf("/") + 1));
      if (now !== to) await this.fs.move(now, to);
    }
  }
}
