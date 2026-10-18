/**
 * Tree queries over a production's nodes. Pure functions over plain arrays so
 * they run the same in the UI, in Cloud Functions and in the folder mirror.
 */

import { codeFor, folderName, SHELF_DIR } from "./naming";
import type { Id, LevelDef, ProdNode, Production } from "./types";

export type LevelRole = "group" | "production" | "unit";

export function levelIndex(p: Production, n: ProdNode): number {
  return p.levels.findIndex((l) => l.id === n.levelId);
}

export function levelOf(p: Production, n: ProdNode): LevelDef {
  const l = p.levels.find((x) => x.id === n.levelId);
  if (!l) throw new Error(`Unknown level ${n.levelId}`);
  return l;
}

export const isUnit = (p: Production, n: ProdNode) => levelIndex(p, n) === p.levels.length - 1;

/** unit = last level (cards); production = can generate; group = folder/montage. */
export function roleOf(p: Production, n: ProdNode): LevelRole {
  if (isUnit(p, n)) return "unit";
  return levelOf(p, n).canGenerate ? "production" : "group";
}

export const codeOf = (p: Production, n: ProdNode) => codeFor(levelOf(p, n), n.number);
export const folderOf = (p: Production, n: ProdNode) => folderName(codeOf(p, n), n.title);

export function byNumber(a: ProdNode, b: ProdNode): number {
  return a.number - b.number;
}

/** Visual position: the hand-set order, or the number for nodes never reordered. */
export const sortValue = (n: ProdNode) => n.order ?? n.number;

/** Display order among siblings (ties: code, then id, so every device agrees). */
export function byPosition(a: ProdNode, b: ProdNode): number {
  return sortValue(a) - sortValue(b) || a.number - b.number || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function childrenOf(nodes: ProdNode[], parentId: Id | null): ProdNode[] {
  return nodes.filter((n) => n.parentId === parentId).sort(byPosition);
}

export function ancestorsOf(nodes: ProdNode[], n: ProdNode): ProdNode[] {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const out: ProdNode[] = [];
  let cur: ProdNode | undefined = n;
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export function descendantsOf(nodes: ProdNode[], id: Id): ProdNode[] {
  const out: ProdNode[] = [];
  const walk = (pid: Id) => {
    for (const c of childrenOf(nodes, pid)) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** "SQ010 · SC010 · SH0010" */
export function codePath(p: Production, nodes: ProdNode[], n: ProdNode): string[] {
  return ancestorsOf(nodes, n).map((a) => codeOf(p, a));
}

/**
 * Folder path relative to the production root, identical on macOS & Windows.
 * A shelved node lives in its parent's `_editados/`.
 */
export function folderPath(p: Production, nodes: ProdNode[], n: ProdNode): string {
  return ancestorsOf(nodes, n).map((a) => (a.shelvedAt !== undefined ? `${SHELF_DIR}/${folderOf(p, a)}` : folderOf(p, a))).join("/");
}

/** Stable global sort key (depth-first order). */
export function sortKey(nodes: ProdNode[], n: ProdNode): string {
  return ancestorsOf(nodes, n).map((a) => String(a.number).padStart(6, "0")).join("/");
}

/** Number for a new last child: next multiple of the level step. */
export function nextNumber(siblings: ProdNode[], step: number): number {
  const last = siblings.reduce((m, s) => Math.max(m, s.number), 0);
  return Math.floor(last / step) * step + step;
}

/**
 * Number to insert right after `after` using the gap (010 → 015 → 020).
 * Returns null when there is no gap left (caller must renumber first).
 */
export function numberBetween(after: ProdNode, next: ProdNode | undefined, step: number): number | null {
  if (!next) return Math.floor(after.number / step) * step + step;
  const gap = next.number - after.number;
  return gap >= 2 ? after.number + Math.floor(gap / 2) : null;
}

/** Fresh numbers for a sibling list (010, 020, 030…), preserving order. */
export function renumbered(siblings: ProdNode[], step: number): Map<Id, number> {
  return new Map([...siblings].sort(byNumber).map((s, i) => [s.id, (i + 1) * step]));
}

/**
 * Board and trash (docs/INTERFAZ.md §2.2): a node is in the trash when it or
 * an ancestor was trashed. `roots` are the trashed nodes not inside another
 * trashed node — what the trash lists and restores. `shelf`: shelved nodes
 * not in the trash (the «Vídeos editados» of each scene), off the board too.
 */
export function splitTrash(nodes: ProdNode[]): { live: ProdNode[]; trash: ProdNode[]; roots: ProdNode[]; shelf: ProdNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<Id, boolean>();
  const trashed = (n: ProdNode, depth = 0): boolean => {
    const known = memo.get(n.id);
    if (known !== undefined) return known;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const v = n.trashedAt !== undefined || (!!parent && depth < 64 && trashed(parent, depth + 1));
    memo.set(n.id, v);
    return v;
  };
  const live: ProdNode[] = [];
  const trash: ProdNode[] = [];
  const shelf: ProdNode[] = [];
  for (const n of nodes) (trashed(n) ? trash : n.shelvedAt !== undefined ? shelf : live).push(n);
  const roots = trash.filter((n) => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    return n.trashedAt !== undefined && !(parent && trashed(parent));
  });
  return { live, trash, roots, shelf };
}
