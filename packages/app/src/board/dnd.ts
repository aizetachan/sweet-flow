/**
 * Drag and drop of nodes in the tree and the board (docs/INTERFAZ.md §2.1).
 * Dropping on a sibling places the dragged nodes before/after it; dropping on
 * a node one level up puts them inside, at the end. Codes never change unless
 * they clash in the new parent (handled by the domain planner).
 */

import { useState, type DragEvent } from "react";
import { childrenOf, codeOf, isUnit, levelIndex, type Id, type ProdNode, type Production } from "@sweetflow/domain";
import { useStore } from "../state/store";

const NODE_DRAG = "application/x-sweetflow-nodes";

/** Ids being dragged. dataTransfer can't be read during dragover, so keep them here. */
let dragging: Id[] = [];

/** `group`: the middle of a shot card, to put the dragged shots together with it (§2.4). */
export type Zone = "before" | "after" | "into" | "group";

/** Drag the multi-selection when the grabbed node is part of it, else just the node. */
export function nodeDragProps(id: Id) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      const { multi } = useStore.getState();
      dragging = multi.includes(id) ? multi : [id];
      e.dataTransfer.setData(NODE_DRAG, JSON.stringify(dragging));
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      dragging = [];
    },
  };
}

function allowed(p: Production, nodes: ProdNode[], target: ProdNode, zone: Zone): boolean {
  if (!dragging.length || dragging.includes(target.id)) return false;
  const first = nodes.find((n) => n.id === dragging[0]);
  if (!first) return false;
  const lv = levelIndex(p, first);
  return zone === "into" ? levelIndex(p, target) === lv - 1 : levelIndex(p, target) === lv;
}

/**
 * Drop target for a node. `axis` is the direction its siblings are laid out
 * (tree rows: y; board cards: x); `into` lets the middle of the target
 * receive children.
 */
export function useNodeDrop(target: ProdNode, axis: "x" | "y", into = false, group = false) {
  const [zone, setZone] = useState<Zone | null>(null);

  const pickZone = (e: DragEvent): Zone | null => {
    const { snap } = useStore.getState();
    if (!snap) return null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = axis === "y" ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    const p = snap.production;
    if (into && allowed(p, snap.nodes, target, "into") && t > 0.25 && t < 0.75) return "into";
    if (group && t > 0.3 && t < 0.7 && canGroup(p, snap.nodes, target)) return "group";
    const z: Zone = t < 0.5 ? "before" : "after";
    if (allowed(p, snap.nodes, target, z)) return z;
    return into && allowed(p, snap.nodes, target, "into") ? "into" : null;
  };

  return {
    zone,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(NODE_DRAG)) return;
        const z = pickZone(e);
        if (!z) return setZone(null);
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setZone(z);
      },
      onDragLeave: () => setZone(null),
      onDrop: (e: DragEvent) => {
        const z = pickZone(e);
        setZone(null);
        if (!z) return;
        e.preventDefault();
        e.stopPropagation();
        dropOn(target, z);
      },
    },
  };
}

/** Drop target for the end of a container (a lane, the tree root). */
export function useEndDrop(parentId: Id | null) {
  const [over, setOver] = useState(false);
  const ok = () => {
    const { snap } = useStore.getState();
    if (!snap || !dragging.length) return false;
    const first = snap.nodes.find((n) => n.id === dragging[0]);
    const parent = parentId ? snap.nodes.find((n) => n.id === parentId) : undefined;
    if (!first) return false;
    const want = parent ? levelIndex(snap.production, parent) + 1 : 0;
    return levelIndex(snap.production, first) === want && !dragging.includes(parentId ?? "");
  };
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(NODE_DRAG) || !ok()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!ok()) return;
        e.preventDefault();
        move(parentId, null);
      },
    },
  };
}

/** Only shots group, and never a shot with itself. */
function canGroup(p: Production, nodes: ProdNode[], target: ProdNode): boolean {
  if (!dragging.length || dragging.includes(target.id) || !isUnit(p, target)) return false;
  return dragging.every((id) => {
    const n = nodes.find((x) => x.id === id);
    return !!n && isUnit(p, n);
  });
}

/** Drop target for a group card: the dragged shots go into the group. */
export function useGroupDrop(groupId: Id) {
  return useSimpleDrop(() => {
    const { snap } = useStore.getState();
    return !!snap && dragging.length > 0 && dragging.every((id) => {
      const n = snap.nodes.find((x) => x.id === id);
      return !!n && isUnit(snap.production, n) && n.groupId !== groupId;
    });
  }, () => group(dragging, { groupId }));
}

/** Drop target to take the dragged shots out of their group (the open group's back button). */
export function useUngroupDrop(groupId: Id) {
  return useSimpleDrop(() => {
    const { snap } = useStore.getState();
    return !!snap && dragging.length > 0 && dragging.every((id) => snap.nodes.find((x) => x.id === id)?.groupId === groupId);
  }, () => {
    const { source, set } = useStore.getState();
    source.ungroupShots(dragging);
    dragging = [];
    set({ multi: [] });
  });
}

function useSimpleDrop(ok: () => boolean, run: () => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(NODE_DRAG) || !ok()) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!ok()) return;
        e.preventDefault();
        e.stopPropagation();
        run();
      },
    },
  };
}

function group(ids: Id[], target: { shotId: Id } | { groupId: Id }): void {
  const { source, set, notify } = useStore.getState();
  try {
    source.groupShots(ids, target);
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err));
  }
  dragging = [];
  set({ multi: [] });
}

function dropOn(target: ProdNode, zone: Zone): void {
  const { snap } = useStore.getState();
  if (!snap) return;
  if (zone === "group") return group(dragging, { shotId: target.id });
  if (zone === "into") return move(target.id, null);
  if (zone === "before") return move(target.parentId, target.id);
  const siblings = childrenOf(snap.nodes, target.parentId).filter((n) => !dragging.includes(n.id));
  move(target.parentId, siblings[siblings.indexOf(target) + 1]?.id ?? null);
}

function move(parentId: Id | null, beforeId: Id | null): void {
  const { source, set, snap, notify } = useStore.getState();
  if (!snap) return;
  // Keep the dragged order as it appears on screen.
  const ids = orderOnScreen(snap.production, snap.nodes, dragging);
  const codeBefore = new Map(ids.map((id) => [id, codeOf(snap.production, snap.nodes.find((n) => n.id === id)!)]));
  try {
    source.moveNodes(ids, parentId, beforeId);
  } catch (err) {
    console.warn("[dnd]", err);
  }
  dragging = [];
  set({ multi: [] });

  // A node keeps its code unless it was taken in the new parent: say so.
  const after = useStore.getState().snap;
  if (!after) return;
  const renamed = ids.flatMap((id) => {
    const n = after.nodes.find((x) => x.id === id);
    const now = n ? codeOf(after.production, n) : undefined;
    return now && now !== codeBefore.get(id) ? [`${codeBefore.get(id)} → ${now}`] : [];
  });
  if (renamed.length) notify(`${renamed.join(", ")}: ese código ya existía en el destino.`);
}

function orderOnScreen(p: Production, nodes: ProdNode[], ids: Id[]): Id[] {
  const rank = new Map<Id, string>();
  const walk = (parentId: Id | null, prefix: string) =>
    childrenOf(nodes, parentId).forEach((n, i) => {
      const key = `${prefix}${String(i).padStart(5, "0")}/`;
      rank.set(n.id, key);
      if (levelIndex(p, n) < p.levels.length - 1) walk(n.id, key);
    });
  walk(null, "");
  return [...ids].sort((a, b) => (rank.get(a) ?? "").localeCompare(rank.get(b) ?? ""));
}
