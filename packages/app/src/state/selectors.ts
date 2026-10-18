/** Derived data for views. Pure functions over a Snapshot. */

import {
  ancestorsOf,
  childrenOf,
  descendantsOf,
  isUnit,
  takeDuration,
  type Id,
  type Media,
  type ProdNode,
  type StatusDef,
  type Take,
} from "@sweetflow/domain";
import type { Snapshot } from "../data/source";
import type { Filters } from "./store";

export const statusOf = (s: Snapshot, n: ProdNode): StatusDef =>
  s.production.statuses.find((x) => x.id === n.statusId) ?? s.production.statuses[0]!;

/**
 * Colour slot (seg-c0…5) of a node: its rank by code among its siblings, so
 * siblings get different colours and a card keeps its colour when reordered
 * (reordering never changes codes). A card and its segments in the scene's
 * cut strip share it.
 */
export function colorSlot(s: Snapshot, nodeId: Id): number {
  const n = s.nodes.find((x) => x.id === nodeId);
  if (!n) return 0;
  const byCode = s.nodes.filter((x) => x.parentId === n.parentId).sort((a, b) => a.number - b.number);
  return Math.max(0, byCode.findIndex((x) => x.id === nodeId)) % 6;
}

export const memberName = (s: Snapshot, uid: Id) => s.members.find((m) => m.uid === uid)?.displayName ?? "—";

/** Cover for a card: the selected take's media (at its in-point), else the latest ready own media. */
export function coverOf(s: Snapshot, n: ProdNode): { media?: Media; take?: Take; pending?: Media } {
  const take = n.selectedTakeId ? s.takes.find((t) => t.id === n.selectedTakeId) : undefined;
  const tm = take ? s.media.find((m) => m.id === take.mediaId) : undefined;
  const own = s.media.filter((m) => m.nodeId === n.id && !m.archived).sort((a, b) => a.createdAt - b.createdAt);
  const pending = own.find((m) => m.status === "queued" || m.status === "rendering");
  if (tm) return { media: tm, take, pending };
  const ready = own.filter((m) => m.status === "ready");
  return { media: ready[ready.length - 1], pending };
}

/**
 * Length on screen: a shot's chosen take, or its own video (the cover); a
 * scene or sequence adds up its shots. Images count 0.
 */
export function durationOf(s: Snapshot, n: ProdNode): number {
  const take = n.selectedTakeId ? s.takes.find((t) => t.id === n.selectedTakeId) : undefined;
  if (take) return takeDuration(take);
  if (isUnit(s.production, n)) {
    const { media } = coverOf(s, n);
    return media?.kind === "video" ? media.durationSec ?? 0 : 0;
  }
  return Math.round(childrenOf(s.nodes, n.id).reduce((acc, c) => acc + durationOf(s, c), 0) * 10) / 10;
}

/** Length of what is approved: its approved shots added up (a shot counts only if approved). */
export function approvedDurationOf(s: Snapshot, n: ProdNode): number {
  if (isUnit(s.production, n)) return statusOf(s, n).category === "done" ? durationOf(s, n) : 0;
  return Math.round(childrenOf(s.nodes, n.id).reduce((acc, c) => acc + approvedDurationOf(s, c), 0) * 10) / 10;
}

export function progressOf(s: Snapshot, n: ProdNode): { done: number; total: number } {
  const units = isUnit(s.production, n) ? [n] : descendantsOf(s.nodes, n.id).filter((d) => isUnit(s.production, d));
  return { done: units.filter((u) => statusOf(s, u).category === "done").length, total: units.length };
}

export function countsOf(s: Snapshot, n: ProdNode) {
  return {
    media: s.media.filter((m) => m.nodeId === n.id && !m.archived).length,
    takes: s.takes.filter((t) => t.nodeId === n.id).length,
    comments: s.comments.filter((c) => c.nodeId === n.id && !c.resolved).length,
  };
}

export function matches(s: Snapshot, n: ProdNode, f: Filters): boolean {
  if (f.statusIds.length && !f.statusIds.includes(n.statusId)) return false;
  if (f.assigneeId && !n.assigneeIds.includes(f.assigneeId)) return false;
  if (f.assetId && !n.assetIds.includes(f.assetId) && !ancestorsOf(s.nodes, n).some((a) => a.assetIds.includes(f.assetId!))) return false;
  if (f.query) {
    const q = f.query.toLowerCase();
    const hay = `${n.title} ${n.notes}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export const filtersActive = (f: Filters) => !!(f.query || f.statusIds.length || f.assigneeId || f.assetId);

export const presenceAt = (s: Snapshot, nodeId: Id) =>
  s.presence.filter((p) => p.nodeId === nodeId && p.uid !== s.me.uid).map((p) => memberName(s, p.uid));
