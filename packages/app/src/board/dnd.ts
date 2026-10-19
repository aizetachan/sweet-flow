/**
 * Drag and drop of nodes in the tree and the board (docs/INTERFAZ.md §2.1).
 * Dropping on a sibling places the dragged nodes before/after it; dropping on
 * a node one level up puts them inside, at the end. Codes never change unless
 * they clash in the new parent (handled by the domain planner).
 */

import { useState, type DragEvent } from "react";
import { childrenOf, codeOf, isUnit, levelIndex, sortValue, type Id, type ProdNode, type Production, type RowItem, type ShotGroup } from "@sweetflow/domain";
import { useStore } from "../state/store";
import { hasFiles, runImport } from "../components/ImportDialog";

const NODE_DRAG = "application/x-sweetflow-nodes";

/** Same type as library images (library/LibraryBoard.tsx): the references of Generar take them. */
const MEDIA_DRAG = "application/x-sweetflow-media";

/** The version each shot shows: its chosen take's media, or its latest ready one. */
function shownMedia(ids: Id[]): Id[] {
  const { snap } = useStore.getState();
  if (!snap) return [];
  return ids.flatMap((id) => {
    const n = snap.nodes.find((x) => x.id === id);
    if (!n) return [];
    const take = n.selectedTakeId ? snap.takes.find((t) => t.id === n.selectedTakeId) : undefined;
    if (take) return [take.mediaId];
    const latest = snap.media.filter((m) => m.nodeId === id && m.status === "ready" && !m.archived).sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest ? [latest.id] : [];
  });
}

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
      draggingGroup = null;
      e.dataTransfer.setData(NODE_DRAG, JSON.stringify(dragging));
      // A shot also carries the version it shows (its chosen one), for the references of Generar (§2.0).
      const media = shownMedia(dragging);
      if (media.length) {
        e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(media));
        e.dataTransfer.effectAllowed = "copyMove";
        document.body.classList.add("sf-drag-media");
      } else e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      dragging = [];
      document.body.classList.remove("sf-drag-media");
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
    // A group (from the tree) goes before or after a loose shot of its scene.
    if (draggingGroup) {
      const g = snap.groups.find((x) => x.id === draggingGroup);
      if (!g || !isUnit(p, target) || target.groupId || target.parentId !== g.parentId) return null;
      return t < 0.5 ? "before" : "after";
    }
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

/**
 * A scene's row as the tree and the board show it: loose shots and groups,
 * in order (docs/INTERFAZ.md §2.4).
 */
function rowOrder(nodes: ProdNode[], groups: ShotGroup[], rowId: Id): RowItem[] {
  const kids = childrenOf(nodes, rowId);
  const live = groups.filter((g) => g.parentId === rowId && kids.some((k) => k.groupId === g.id));
  return [
    ...kids.filter((k) => !live.some((g) => g.id === k.groupId)).map((k) => ({ at: sortValue(k), item: { nodeId: k.id } as RowItem })),
    ...live.map((g) => ({ at: g.order, item: { groupId: g.id } as RowItem })),
  ].sort((a, b) => a.at - b.at).map((x) => x.item);
}

const sameItem = (a: RowItem, b: RowItem) => ("nodeId" in a && "nodeId" in b && a.nodeId === b.nodeId) || ("groupId" in a && "groupId" in b && a.groupId === b.groupId);

/** Move the dragged group before or after an item of its row. */
function placeGroup(rowId: Id, target: RowItem, zone: "before" | "after"): void {
  const { source, snap, notify } = useStore.getState();
  const moving = draggingGroup;
  draggingGroup = null;
  if (!snap || !moving) return;
  const order = rowOrder(snap.nodes, snap.groups, rowId).filter((i) => !("groupId" in i && i.groupId === moving));
  const at = order.findIndex((i) => sameItem(i, target));
  const before = zone === "before" ? target : order[at + 1] ?? null;
  try {
    source.placeInRow([{ groupId: moving }], rowId, before, null);
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Drop target for a group row in the tree: shots dropped in its middle go
 * inside; another group of the same scene goes before or after it.
 */
export function useTreeGroupDrop(g: ShotGroup) {
  const [zone, setZone] = useState<"into" | "before" | "after" | null>(null);
  const pickZone = (e: DragEvent): "into" | "before" | "after" | null => {
    const { snap } = useStore.getState();
    if (!snap) return null;
    if (draggingGroup) {
      const other = snap.groups.find((x) => x.id === draggingGroup);
      if (!other || other.id === g.id || other.parentId !== g.parentId) return null;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return (e.clientY - r.top) / r.height < 0.5 ? "before" : "after";
    }
    const ok = dragging.length > 0 && dragging.every((id) => {
      const n = snap.nodes.find((x) => x.id === id);
      return !!n && isUnit(snap.production, n) && n.groupId !== g.id;
    });
    return ok ? "into" : null;
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
        if (z === "into") group(dragging, { groupId: g.id });
        else placeGroup(g.parentId, { groupId: g.id }, z);
      },
    },
  };
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
  if (draggingGroup && target.parentId && (zone === "before" || zone === "after")) return placeGroup(target.parentId, { nodeId: target.id }, zone);
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
  if (renamed.length && useStore.getState().showCodes) notify(`${renamed.join(", ")}: ese código ya existía en el destino.`);
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

// ---------- rows of the board (docs/INTERFAZ.md §2.1, §2.4) ----------

/** Group card being dragged, if any (shots go in `dragging`). */
let draggingGroup: Id | null = null;

export function groupDragProps(groupId: Id) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      draggingGroup = groupId;
      dragging = [];
      e.dataTransfer.setData(NODE_DRAG, JSON.stringify({ group: groupId }));
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      draggingGroup = null;
    },
  };
}

/** Where a drop in a row lands: next to an item, onto a shot (new group) or into a group. */
export type RowHint = { key: string; zone: "before" | "after" | "group" | "into" };

/**
 * Drop target for a whole row of cards. Every card carries
 * `data-row-item` ("n:<id>", "g:<id>", or "end" for the "+"); the pointer
 * decides: the middle of a shot's cover makes a group, the middle of a group
 * card puts the shots inside, anything else — edges and the gaps between
 * cards — places them before or after.
 */
export function useRowDrop(rowId: Id, openGroupId: Id | null) {
  const [hint, setHint] = useState<RowHint | null>(null);

  const ok = (): boolean => {
    const { snap } = useStore.getState();
    if (!snap) return false;
    if (draggingGroup) return !openGroupId && snap.groups.some((g) => g.id === draggingGroup && g.parentId === rowId);
    return dragging.length > 0 && dragging.every((id) => {
      const n = snap.nodes.find((x) => x.id === id);
      return !!n && isUnit(snap.production, n);
    });
  };

  const pick = (e: DragEvent, files = false): RowHint | null => {
    const box = e.currentTarget as HTMLElement;
    const items = [...box.querySelectorAll<HTMLElement>("[data-row-item]")];
    if (!items.length) return null;
    const over = (e.target as HTMLElement).closest<HTMLElement>("[data-row-item]");
    if (over && box.contains(over)) {
      const key = over.dataset.rowItem!;
      if (key === "end") return { key, zone: "before" };
      const r = over.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      if (!files && !draggingGroup && key.startsWith("g:") && fx > 0.25 && fx < 0.75) return { key, zone: "into" };
      if (!files && !draggingGroup && key.startsWith("n:") && !dragging.includes(key.slice(2)) && fx > 0.3 && fx < 0.7) {
        const cover = over.querySelector(".thumb")?.getBoundingClientRect();
        if (cover && e.clientY >= cover.top && e.clientY <= cover.bottom) return { key, zone: "group" };
      }
      return { key, zone: fx < 0.5 ? "before" : "after" };
    }
    // In a gap: before the first card to the right on this line, or the next line's first.
    const line = items.filter((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
    });
    const right = line.find((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 > e.clientX;
    });
    if (right) return { key: right.dataset.rowItem!, zone: "before" };
    const last = line.at(-1);
    return last ? { key: last.dataset.rowItem!, zone: "after" } : { key: "end", zone: "before" };
  };

  /** Where a drop lands in the row, as the item it goes before (null: the end). */
  const beforeOf = (h: RowHint, box: HTMLElement): RowItem | null => {
    const toItem = (key: string): RowItem | null => (key === "end" ? null : key.startsWith("g:") ? { groupId: key.slice(2) } : { nodeId: key.slice(2) });
    if (h.zone !== "after") return toItem(h.key);
    const keys = [...box.querySelectorAll<HTMLElement>("[data-row-item]")].map((el) => el.dataset.rowItem!);
    return toItem(keys[keys.indexOf(h.key) + 1] ?? "end");
  };

  const drop = (h: RowHint, box: HTMLElement) => {
    const { source, set, snap, notify } = useStore.getState();
    if (!snap) return;
    const toItem = (key: string): RowItem | null => (key === "end" ? null : key.startsWith("g:") ? { groupId: key.slice(2) } : { nodeId: key.slice(2) });
    const ids = orderOnScreen(snap.production, snap.nodes, dragging);
    const moving: RowItem[] = draggingGroup ? [{ groupId: draggingGroup }] : ids.map((nodeId) => ({ nodeId }));
    const codeBefore = new Map(ids.map((id) => [id, codeOf(snap.production, snap.nodes.find((n) => n.id === id)!)]));
    try {
      if (h.zone === "group") source.groupShots(ids, { shotId: h.key.slice(2) });
      else if (h.zone === "into") source.groupShots(ids, { groupId: h.key.slice(2) });
      else {
        let before = toItem(h.key);
        if (h.zone === "after") {
          const keys = [...box.querySelectorAll<HTMLElement>("[data-row-item]")].map((el) => el.dataset.rowItem!);
          before = toItem(keys[keys.indexOf(h.key) + 1] ?? "end");
        }
        source.placeInRow(moving, rowId, before, openGroupId);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
    dragging = [];
    draggingGroup = null;
    set({ multi: [] });
    // A shot keeps its code unless it was taken in the new scene: say so.
    const after = useStore.getState().snap;
    const renamed = ids.flatMap((id) => {
      const n = after?.nodes.find((x) => x.id === id);
      const now = n && after ? codeOf(after.production, n) : undefined;
      return now && now !== codeBefore.get(id) ? [`${codeBefore.get(id)} → ${now}`] : [];
    });
    if (renamed.length && useStore.getState().showCodes) notify(`${renamed.join(", ")}: ese código ya existía en el destino.`);
  };

  return {
    hint,
    props: {
      onDragOver: (e: DragEvent) => {
        // Files from the computer: each one a new shot where it is dropped (docs/INTERFAZ.md §2.0).
        if (hasFiles(e.dataTransfer)) {
          const h = pick(e, true);
          if (!h) return setHint(null);
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setHint((old) => (old && old.key === h.key && old.zone === h.zone ? old : h));
          return;
        }
        if (!e.dataTransfer.types.includes(NODE_DRAG) || !ok()) return;
        const h = pick(e);
        if (!h) return setHint(null);
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setHint((old) => (old && old.key === h.key && old.zone === h.zone ? old : h));
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setHint(null);
      },
      onDrop: (e: DragEvent) => {
        setHint(null);
        if (hasFiles(e.dataTransfer)) {
          const h = pick(e, true);
          if (!h) return;
          e.preventDefault();
          e.stopPropagation();
          runImport({ rowId, before: beforeOf(h, e.currentTarget as HTMLElement), groupId: openGroupId }, [...e.dataTransfer.files].map((file) => ({ file })));
          return;
        }
        if (!ok()) return;
        const h = pick(e);
        if (!h) return;
        e.preventDefault();
        e.stopPropagation();
        drop(h, e.currentTarget as HTMLElement);
      },
    },
  };
}
