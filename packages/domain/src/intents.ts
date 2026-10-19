/**
 * Structural intents → log events. Numbering and ordering rules live here
 * once, so every DataSource that writes an event log (local folder, Dropbox)
 * plans changes the same way. Pure: they read the current state and return
 * events to append.
 *
 * Codes and visual order are independent (docs/INTERFAZ.md §2.1): reordering
 * never changes a code; a code only changes when edited by hand, or when a
 * node moves into a parent where its number is already taken.
 */

import { codeFor, nextMediaVersion } from "./naming";
import type { LogEventBody, NodePatch } from "./log";
import { byNumber, byPosition, childrenOf, descendantsOf, groupOf, isUnit, levelIndex, LIB_LEVEL, nextNumber, numberBetween, sortValue, splitTrash } from "./tree";
import type { Segment } from "./cuts";
import type { Id, LibKind, Media, Millis, ProdNode, Production, ShotGroup, Take } from "./types";

export interface Plan {
  events: LogEventBody[];
  /** Id of the node the plan creates, if any. */
  nodeId?: Id;
}

const EMPTY: Plan = { events: [] };

/** Visual spacing between neighbours when there is nothing after them. */
const ORDER_STEP = 10;

/** New last child of `parentId` (null = top level), one level below its parent. */
export function planCreateNode(p: Production, nodes: ProdNode[], parentId: Id | null, newId: Id, title = ""): Plan {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  if (parentId && !parent) return EMPTY;
  const level = p.levels[parent ? levelIndex(p, parent) + 1 : 0];
  if (!level) throw new Error("El último nivel no admite hijos");
  const siblings = childrenOf(nodes, parentId);
  const number = nextNumber(siblings, level.step);
  title = title.trim() || defaultTitle(p, level, number);
  const last = siblings.at(-1);
  // Only needs an explicit order when hand-reordered siblings already sort past the new number.
  const order = last && sortValue(last) >= number ? sortValue(last) + ORDER_STEP : undefined;
  return {
    nodeId: newId,
    events: [{ type: "node.created", node: { id: newId, parentId, levelId: level.id, number, title, statusId: firstStatus(p), ...(order === undefined ? {} : { order }) } }],
  };
}

/** New sibling shown right after `nodeId`, with the first free code after it. */
export function planInsertAfter(p: Production, nodes: ProdNode[], nodeId: Id, newId: Id): Plan {
  const after = nodes.find((n) => n.id === nodeId);
  if (!after) return EMPTY;
  const level = p.levels[levelIndex(p, after)];
  if (!level) return EMPTY;
  const siblings = childrenOf(nodes, after.parentId);
  const next = siblings[siblings.indexOf(after) + 1];
  const order = next ? (sortValue(after) + sortValue(next)) / 2 : sortValue(after) + ORDER_STEP;
  const byCode = [...siblings].sort(byNumber);
  const number = numberBetween(after, byCode[byCode.indexOf(after) + 1], level.step) ?? nextNumber(siblings, level.step);
  return {
    nodeId: newId,
    events: [{ type: "node.created", node: { id: newId, parentId: after.parentId, levelId: after.levelId, number, title: defaultTitle(p, level, number), statusId: firstStatus(p), order } }],
  };
}

/**
 * Move `ids` (in the given order) under `parentId`, right before `beforeId`
 * (null = at the end). Nodes keep their codes unless the number is taken in
 * the new parent. Ignores nodes that cannot live there: wrong level, or the
 * target being the node itself or one of its descendants.
 */
export function planMoveNodes(p: Production, nodes: ProdNode[], ids: Id[], parentId: Id | null, beforeId: Id | null): Plan {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  if (parentId && !parent) return EMPTY;
  const wantLevel = parent ? levelIndex(p, parent) + 1 : 0;
  const moving = ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ProdNode => !!n && levelIndex(p, n) === wantLevel)
    .filter((n) => !parentId || (n.id !== parentId && !descendantsOf(nodes, n.id).some((d) => d.id === parentId)));
  if (!moving.length) return EMPTY;

  const movingIds = new Set(moving.map((n) => n.id));
  const staying = childrenOf(nodes, parentId).filter((n) => !movingIds.has(n.id));
  const before = beforeId ? staying.find((n) => n.id === beforeId) : undefined;
  const at = before ? staying.indexOf(before) : staying.length;
  const prev = staying[at - 1];
  const next = staying[at];
  const lo = prev ? sortValue(prev) : next ? sortValue(next) - ORDER_STEP * (moving.length + 1) : 0;
  const hi = next ? sortValue(next) : lo + ORDER_STEP * (moving.length + 1);

  const step = p.levels[wantLevel]!.step;
  const taken = new Set(staying.map((n) => n.number));
  const events: LogEventBody[] = moving.map((n, i) => {
    const order = lo + ((hi - lo) * (i + 1)) / (moving.length + 1);
    let number: number | undefined;
    if (n.parentId !== parentId && taken.has(n.number)) {
      number = Math.floor(Math.max(...taken) / step) * step + step;
    }
    taken.add(number ?? n.number);
    return { type: "node.moved", id: n.id, parentId, order, ...(number === undefined ? {} : { number }) };
  });
  // A group belongs to its scene: a shot moved to another scene leaves it.
  for (const n of moving) if (n.groupId && n.parentId !== parentId) events.push({ type: "node.updated", id: n.id, patch: { groupId: null } });
  return { events };
}

/** Swap places with the previous (-1) or next (1) sibling; codes do not change. */
export function planMoveNode(p: Production, nodes: ProdNode[], nodeId: Id, dir: -1 | 1): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  const siblings = childrenOf(nodes, n.parentId);
  const i = siblings.indexOf(n);
  if (!siblings[i + dir]) return EMPTY;
  const before = dir === -1 ? siblings[i - 1]! : siblings[i + 2];
  return planMoveNodes(p, nodes, [nodeId], n.parentId, before?.id ?? null);
}

/**
 * Change the number of a node's code by hand (the level prefix stays).
 * Throws with a message for the UI when the number is not valid or taken.
 */
export function planSetNumber(p: Production, nodes: ProdNode[], nodeId: Id, number: number): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  if (number === n.number) return EMPTY;
  const level = p.levels[levelIndex(p, n)];
  if (!level) return EMPTY;
  if (!Number.isInteger(number) || number < 1 || String(number).length > level.pad) {
    throw new Error(`El número debe ser un entero entre 1 y ${"9".repeat(level.pad)}.`);
  }
  const clash = childrenOf(nodes, n.parentId).find((s) => s.id !== n.id && s.number === number);
  if (clash) throw new Error(`${codeFor(level, number)} ya existe aquí.`);
  // Keep its place on screen even if it was ordered by number until now.
  return { events: [{ type: "node.moved", id: n.id, parentId: n.parentId, order: sortValue(n), number }] };
}

export function planDeleteNode(nodes: ProdNode[], nodeId: Id): Plan {
  return nodes.some((n) => n.id === nodeId) ? { events: [{ type: "node.deleted", id: nodeId }] } : EMPTY;
}

/** Move a node (and what it contains) to the production's trash. `nodes`: all of them, trash included. */
export function planTrashNode(nodes: ProdNode[], nodeId: Id): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  return n && n.trashedAt === undefined ? { events: [{ type: "node.trashed", id: nodeId }] } : EMPTY;
}

/**
 * Bring a node back from the trash to where it was. If its code was taken
 * meanwhile, it gets the next free number (like a move, docs/INTERFAZ.md §2.1).
 * `nodes`: all of them, trash included. Returns the new number in `renumbered`.
 */
export function planRestoreNode(p: Production, nodes: ProdNode[], nodeId: Id): Plan & { renumbered?: number } {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n || n.trashedAt === undefined) return EMPTY;
  // A library group has no code to keep free.
  if (n.lib) return { events: [{ type: "node.restored", id: nodeId }] };
  const number = freeOnBoard(p, nodes, n);
  return { events: [{ type: "node.restored", id: nodeId, ...(number === undefined ? {} : { number }) }], renumbered: number };
}

/** Back to the board from «Vídeos editados», like a restore: a new number if its code was taken. */
export function planUnshelveNode(p: Production, nodes: ProdNode[], nodeId: Id): Plan & { renumbered?: number } {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n || n.shelvedAt === undefined || n.trashedAt !== undefined) return EMPTY;
  const number = freeOnBoard(p, nodes, n);
  return { events: [{ type: "node.unshelved", id: nodeId, ...(number === undefined ? {} : { number }) }], renumbered: number };
}

/** A number for `n` coming back to the board: undefined if its own is free, else the next one. */
function freeOnBoard(p: Production, nodes: ProdNode[], n: ProdNode): number | undefined {
  const siblings = childrenOf(splitTrash(nodes).live, n.parentId).filter((s) => s.id !== n.id);
  if (!siblings.some((s) => s.number === n.number)) return undefined;
  const level = p.levels.find((l) => l.id === n.levelId);
  return nextNumber(siblings, level?.step ?? 10);
}

/**
 * Cut a shot's video into new shots (docs/INTERFAZ.md §2.3): each kept
 * segment becomes a shot in its place, with that stretch as its take, and
 * the original goes to its scene's «Vídeos editados». The first new shot
 * takes the original's code; the rest take the codes in the gap after it
 * (010 → 010, 013, 016 before 020), or the next free ones at the end.
 * `nodes`: all of them, trash and shelf included.
 */
export function planSplitShot(
  p: Production,
  nodes: ProdNode[],
  media: Pick<Media, "id" | "nodeId">,
  segments: Segment[],
  newId: (prefix: string) => Id,
  by: Id,
  now: Millis,
): Plan & { nodeIds: Id[] } {
  const original = nodes.find((n) => n.id === media.nodeId);
  if (!original || original.trashedAt !== undefined || original.shelvedAt !== undefined || !segments.length) return { events: [], nodeIds: [] };
  const level = p.levels[levelIndex(p, original)];
  if (!level) return { events: [], nodeIds: [] };
  const siblings = childrenOf(splitTrash(nodes).live, original.parentId).filter((n) => n.id !== original.id);
  const k = segments.length;

  // Codes: the original's, then the gap up to the next code.
  const nextCode = siblings.filter((s) => s.number > original.number).sort(byNumber)[0]?.number;
  const gap = nextCode === undefined ? level.step * k : nextCode - original.number;
  let numbers: number[];
  if (gap >= k) numbers = segments.map((_, i) => original.number + Math.floor((gap * i) / k));
  else {
    let last = nextNumber(siblings, level.step) - level.step;
    numbers = [original.number, ...segments.slice(1).map(() => (last += level.step))];
  }

  // Places: where the original was, spread up to the next card.
  const visual = childrenOf(splitTrash(nodes).live, original.parentId);
  const nextCard = visual[visual.indexOf(original) + 1];
  const lo = sortValue(original);
  const hi = nextCard ? sortValue(nextCard) : lo + ORDER_STEP * k;

  const events: LogEventBody[] = [];
  const nodeIds: Id[] = [];
  segments.forEach((seg, i) => {
    const id = newId("n");
    const takeId = newId("tk");
    nodeIds.push(id);
    events.push(
      { type: "node.created", node: { id, parentId: original.parentId, levelId: original.levelId, number: numbers[i]!, title: original.title, statusId: firstStatus(p), order: lo + ((hi - lo) * i) / k } },
      { type: "take.added", take: { id: takeId, nodeId: id, mediaId: media.id, inSec: seg.inSec, outSec: seg.outSec, createdBy: by, createdAt: now } },
      { type: "node.updated", id, patch: { selectedTakeId: takeId, ...(original.groupId ? { groupId: original.groupId } : {}) } },
    );
  });
  events.push({ type: "node.shelved", id: original.id });
  return { events, nodeIds, nodeId: nodeIds[0] };
}

/** Only the fields that actually change, so concurrent edits of other fields survive. */
export function planUpdateNode(nodes: ProdNode[], nodeId: Id, patch: NodePatch): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  const changed = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => JSON.stringify(n[k as keyof NodePatch]) !== JSON.stringify(v)),
  ) as NodePatch;
  return Object.keys(changed).length ? { events: [{ type: "node.updated", id: nodeId, patch: changed }] } : EMPTY;
}

/**
 * Title a new node starts with: "Escena 1", "Secuencia 3"… from its level
 * name and code (SC010 → 1, SC015 → 1,5), so rows are easy to tell apart at a glance.
 * Shots start untitled: their title is written per shot.
 */
export function defaultTitle(p: Production, level: { id: Id; name: string; step: number }, number: number): string {
  if (p.levels.at(-1)?.id === level.id) return "";
  // Inserted between two (015): "Escena 1,5", so it never repeats a neighbour's.
  const n = Math.round((number / level.step) * 100) / 100;
  return `${level.name} ${String(Math.max(n, 0)).replace(".", ",")}`;
}

function firstStatus(p: Production): Id {
  const s = [...p.statuses].filter((x) => !x.archived).sort((a, b) => a.order - b.order)[0];
  if (!s) throw new Error("La producción no tiene estados");
  return s.id;
}

// ---------- groups of shots (docs/INTERFAZ.md §2.4) ----------

/**
 * Put shots `ids` together with `target`: a shot (a new group with both, in
 * the target's place; or the target's group if it is already in one) or an
 * existing group. Shots from another scene move into it first.
 * `nodes`: the board's. Returns the group id in `groupId`.
 */
export function planGroupShots(
  p: Production,
  nodes: ProdNode[],
  groups: ShotGroup[],
  ids: Id[],
  target: { shotId: Id } | { groupId: Id },
  newGroupId: Id,
  now: Millis,
): Plan & { groupId?: Id } {
  let group: ShotGroup | undefined;
  let shot: ProdNode | undefined;
  if ("groupId" in target) group = groups.find((g) => g.id === target.groupId);
  else {
    shot = nodes.find((n) => n.id === target.shotId);
    if (shot) group = groupOf(groups, shot);
  }
  const parentId = group?.parentId ?? shot?.parentId;
  if (!parentId) return EMPTY;
  const moving = ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ProdNode => !!n && n.id !== shot?.id && isUnit(p, n) && (!group || n.groupId !== group.id));
  if (!moving.length) return EMPTY;

  const events: LogEventBody[] = [];
  // From other scenes: into this one first (codes as in any move).
  const outside = moving.filter((n) => n.parentId !== parentId).map((n) => n.id);
  if (outside.length) events.push(...planMoveNodes(p, nodes, outside, parentId, null).events.filter((e) => e.type === "node.moved"));

  let groupId = group?.id;
  const join: ProdNode[] = [...moving];
  if (!groupId) {
    groupId = newGroupId;
    const taken = new Set(groups.filter((g) => g.parentId === parentId).map((g) => g.name.toLowerCase()));
    let k = 1;
    while (taken.has(`grupo ${k}`)) k++;
    events.push({ type: "group.created", group: { id: groupId, parentId, name: `Grupo ${k}`, order: sortValue(shot!), createdAt: now } });
    join.unshift(shot!);
  }
  for (const n of join) events.push({ type: "node.updated", id: n.id, patch: { groupId } });
  return { events, groupId };
}

/** Take shots out of their group, right after it in the row; an emptied group goes. */
export function planUngroupShots(nodes: ProdNode[], groups: ShotGroup[], ids: Id[]): Plan {
  const events: LogEventBody[] = [];
  const leaving = new Map<Id, number>();
  for (const id of ids) {
    const n = nodes.find((x) => x.id === id);
    const g = n ? groupOf(groups, n) : undefined;
    if (!n || !g) continue;
    const i = leaving.get(g.id) ?? 0;
    leaving.set(g.id, i + 1);
    events.push({ type: "node.updated", id, patch: { groupId: null } }, { type: "node.moved", id, parentId: n.parentId, order: g.order + (i + 1) / 1000 });
  }
  for (const [gid, count] of leaving) {
    const left = nodes.filter((n) => n.groupId === gid).length - count;
    if (left <= 0) events.push({ type: "group.deleted", id: gid });
  }
  return { events };
}

/** Undo a group: its shots back on the row where the group was. */
export function planDissolveGroup(nodes: ProdNode[], groups: ShotGroup[], groupId: Id): Plan {
  const g = groups.find((x) => x.id === groupId);
  if (!g) return EMPTY;
  const members = nodes.filter((n) => n.groupId === groupId).sort(byPosition);
  const plan = planUngroupShots(nodes, groups, members.map((n) => n.id));
  return { events: plan.events.some((e) => e.type === "group.deleted") ? plan.events : [...plan.events, { type: "group.deleted", id: groupId }] };
}

export function planRenameGroup(groups: ShotGroup[], groupId: Id, name: string): Plan {
  const g = groups.find((x) => x.id === groupId);
  const clean = name.trim();
  return g && clean && clean !== g.name ? { events: [{ type: "group.updated", id: groupId, patch: { name: clean } }] } : EMPTY;
}

/** Something in a row of the board: a shot, or a group of shots. */
export type RowItem = { nodeId: Id } | { groupId: Id };

/**
 * Drag and drop in a row of the board, with its groups (docs/INTERFAZ.md
 * §2.1, §2.4): put `moving` (shots and/or groups) in row `rowId` right
 * before `before` (null: at the end), in the row itself (`groupId` null) or
 * inside an open group. Positions count what the row shows: its loose shots
 * and its groups. Shots join or leave groups to match where they land, and
 * keep their codes unless the number is taken in a new scene.
 */
export function planPlaceInRow(
  p: Production,
  nodes: ProdNode[],
  groups: ShotGroup[],
  moving: RowItem[],
  rowId: Id,
  before: RowItem | null,
  groupId: Id | null,
): Plan {
  const row = nodes.find((n) => n.id === rowId);
  if (!row) return EMPTY;
  const unitLevel = p.levels[levelIndex(p, row) + 1];
  if (!unitLevel || p.levels.at(-1)?.id !== unitLevel.id) return EMPTY;
  const key = (i: RowItem) => ("nodeId" in i ? `n:${i.nodeId}` : `g:${i.groupId}`);
  const kids = childrenOf(nodes, rowId);
  const rowGroups = groups.filter((g) => g.parentId === rowId && kids.some((k) => k.groupId === g.id));
  const inRowGroup = (n: ProdNode) => !!n.groupId && rowGroups.some((g) => g.id === n.groupId);
  // What the row (or the open group) shows, in order.
  const shown: Array<{ item: RowItem; at: number }> = groupId
    ? kids.filter((k) => k.groupId === groupId).map((k) => ({ item: { nodeId: k.id }, at: sortValue(k) }))
    : [
        ...kids.filter((k) => !inRowGroup(k)).map((k) => ({ item: { nodeId: k.id } as RowItem, at: sortValue(k) })),
        ...rowGroups.map((g) => ({ item: { groupId: g.id } as RowItem, at: g.order })),
      ].sort((a, b) => a.at - b.at);

  // Only what can go there: shots of the unit level; a group only within its own row.
  const valid = moving.filter((m) => {
    if ("groupId" in m) return !groupId && rowGroups.some((g) => g.id === m.groupId);
    const n = nodes.find((x) => x.id === m.nodeId);
    return !!n && n.levelId === unitLevel.id;
  });
  if (!valid.length) return EMPTY;
  const moved = new Set(valid.map(key));
  const staying = shown.filter((s) => !moved.has(key(s.item)));
  const at = before ? staying.findIndex((s) => key(s.item) === key(before)) : -1;
  const index = at < 0 ? staying.length : at;
  const prev = staying[index - 1];
  const next = staying[index];
  const k = valid.length;
  const lo = prev ? prev.at : next ? next.at - ORDER_STEP * (k + 1) : 0;
  const hi = next ? next.at : lo + ORDER_STEP * (k + 1);

  const taken = new Set(kids.map((n) => n.number));
  const events: LogEventBody[] = [];
  valid.forEach((m, i) => {
    const order = lo + ((hi - lo) * (i + 1)) / (k + 1);
    if ("groupId" in m) {
      events.push({ type: "group.updated", id: m.groupId, patch: { order } });
      return;
    }
    const n = nodes.find((x) => x.id === m.nodeId)!;
    let number: number | undefined;
    if (n.parentId !== rowId && taken.has(n.number)) number = Math.floor(Math.max(...taken) / unitLevel.step) * unitLevel.step + unitLevel.step;
    if (n.parentId !== rowId) taken.add(number ?? n.number);
    events.push({ type: "node.moved", id: n.id, parentId: rowId, order, ...(number === undefined ? {} : { number }) });
    // Lands in the open group, or loose in the row.
    const want = groupId ?? null;
    if ((n.groupId ?? null) !== want) events.push({ type: "node.updated", id: n.id, patch: { groupId: want } });
  });
  // Groups emptied by shots leaving them go.
  for (const g of rowGroups) {
    const left = kids.filter((n) => n.groupId === g.id && !events.some((e) => e.type === "node.updated" && e.id === n.id && e.patch.groupId !== g.id)).length;
    if (!left) events.push({ type: "group.deleted", id: g.id });
  }
  return { events };
}

/**
 * Take a version out to the row (docs/INTERFAZ.md §2.0.1): a new shot right
 * after `nodeId`, with the same title, whose chosen take is that version
 * (whole). The file stays where it is; the version stays in its shot too.
 */
export function planExtractVersion(
  p: Production,
  nodes: ProdNode[],
  nodeId: Id,
  media: Pick<Media, "id" | "durationSec">,
  newId: (prefix: string) => Id,
  by: Id,
  now: Millis,
  /** Only a stretch of it (a shot cut from a video); the whole of it by default. */
  segment?: Segment,
): Plan {
  const base = planInsertAfter(p, nodes, nodeId, newId("n"));
  const created = base.events[0];
  const from = nodes.find((n) => n.id === nodeId);
  if (!base.nodeId || !created || created.type !== "node.created" || !from) return EMPTY;
  const takeId = newId("tk");
  return {
    nodeId: base.nodeId,
    events: [
      { ...created, node: { ...created.node, title: from.title } },
      { type: "take.added", take: { id: takeId, nodeId: base.nodeId, mediaId: media.id, inSec: segment?.inSec ?? 0, outSec: segment?.outSec ?? media.durationSec ?? 0, createdBy: by, createdAt: now } },
      { type: "node.updated", id: base.nodeId, patch: { selectedTakeId: takeId, ...(from.groupId ? { groupId: from.groupId } : {}) } },
    ],
  };
}

/**
 * Cut again a shot made of a stretch of another video (docs/INTERFAZ.md §2.3):
 * it keeps the first kept segment as its take, and the others become shots
 * right after it (codes in the gap). The original video stays where it is
 * (in «Vídeos editados»). `segments` are in the video's own time.
 */
export function planSplitTakeShot(
  p: Production,
  nodes: ProdNode[],
  nodeId: Id,
  take: Pick<Take, "id" | "mediaId">,
  segments: Segment[],
  newId: (prefix: string) => Id,
  by: Id,
  now: Millis,
): Plan & { nodeIds: Id[] } {
  const node = nodes.find((n) => n.id === nodeId);
  const level = node ? p.levels[levelIndex(p, node)] : undefined;
  if (!node || !level || !segments.length) return { events: [], nodeIds: [] };
  const siblings = childrenOf(nodes, node.parentId).filter((n) => n.id !== node.id);
  const k = segments.length;
  const nextCode = siblings.filter((s) => s.number > node.number).sort(byNumber)[0]?.number;
  const gap = nextCode === undefined ? level.step * k : nextCode - node.number;
  let numbers: number[];
  if (gap >= k) numbers = segments.map((_, i) => node.number + Math.floor((gap * i) / k));
  else {
    let last = nextNumber(siblings, level.step) - level.step;
    numbers = [node.number, ...segments.slice(1).map(() => (last += level.step))];
  }
  const visual = childrenOf(nodes, node.parentId);
  const nextCard = visual[visual.indexOf(node) + 1];
  const lo = sortValue(node);
  const hi = nextCard ? sortValue(nextCard) : lo + ORDER_STEP * k;

  const first = segments[0]!;
  const keptId = newId("tk");
  const events: LogEventBody[] = [
    // This shot keeps the first stretch.
    { type: "take.removed", id: take.id },
    { type: "take.added", take: { id: keptId, nodeId: node.id, mediaId: take.mediaId, inSec: first.inSec, outSec: first.outSec, createdBy: by, createdAt: now } },
    { type: "node.updated", id: node.id, patch: { selectedTakeId: keptId } },
  ];
  const nodeIds: Id[] = [node.id];
  segments.slice(1).forEach((seg, j) => {
    const i = j + 1;
    const id = newId("n");
    const takeId = newId("tk");
    nodeIds.push(id);
    events.push(
      { type: "node.created", node: { id, parentId: node.parentId, levelId: node.levelId, number: numbers[i]!, title: node.title, statusId: firstStatus(p), order: lo + ((hi - lo) * i) / k } },
      { type: "take.added", take: { id: takeId, nodeId: id, mediaId: take.mediaId, inSec: seg.inSec, outSec: seg.outSec, createdBy: by, createdAt: now } },
      { type: "node.updated", id, patch: { selectedTakeId: takeId, ...(node.groupId ? { groupId: node.groupId } : {}) } },
    );
  });
  return { events, nodeIds, nodeId: node.id };
}

/**
 * A new shot dropped at a place in a row (importing, docs/INTERFAZ.md §2.0):
 * created right before `before` (the end when null), inside `groupId` if
 * given, with the code in the gap before the one it lands in front of
 * (020 → 015), or the next free one.
 */
export function planCreateInRow(p: Production, nodes: ProdNode[], groups: ShotGroup[], rowId: Id, before: RowItem | null, groupId: Id | null, newId: Id): Plan {
  const created = planCreateNode(p, nodes, rowId, newId);
  const ev = created.events[0];
  if (!ev || ev.type !== "node.created" || (!before && !groupId)) return created;
  const level = p.levels.find((l) => l.id === ev.node.levelId)!;
  const siblings = childrenOf(nodes, rowId);
  const next = !before ? undefined
    : "nodeId" in before ? siblings.find((n) => n.id === before.nodeId)
    : [...siblings].filter((n) => n.groupId === before.groupId).sort(byNumber)[0];
  if (next) {
    const prev = [...siblings].sort(byNumber).filter((n) => n.number < next.number).at(-1);
    const number = prev ? numberBetween(prev, next, level.step) : next.number >= 2 ? Math.floor(next.number / 2) : null;
    if (number !== null && !siblings.some((n) => n.number === number)) ev.node = { ...ev.node, number, title: defaultTitle(p, level, number) };
  }
  const node = ev.node as ProdNode;
  const placed = planPlaceInRow(p, [...nodes, node], groups, [{ nodeId: newId }], rowId, before, groupId);
  return { nodeId: newId, events: [ev, ...placed.events] };
}

/**
 * Edit a video kept in «Vídeos editados» (docs/INTERFAZ.md §2.3): each
 * segment becomes a new shot of its scene, with that stretch as its take,
 * right after `afterId` (the last shot already made from it) or at the end
 * of the row. The original stays where it is. `segments` are in the video's
 * own time.
 */
export function planShotsFromEdited(
  p: Production,
  nodes: ProdNode[],
  original: ProdNode,
  afterId: Id | null,
  media: Pick<Media, "id">,
  segments: Segment[],
  newId: (prefix: string) => Id,
  by: Id,
  now: Millis,
): Plan & { nodeIds: Id[] } {
  const live = nodes.filter((n) => n.shelvedAt === undefined && n.id !== original.id);
  const events: LogEventBody[] = [];
  const nodeIds: Id[] = [];
  let after = afterId && live.some((n) => n.id === afterId) ? afterId : null;
  for (const seg of segments) {
    const base = after ? planInsertAfter(p, live, after, newId("n")) : planCreateNode(p, live, original.parentId, newId("n"));
    const created = base.events[0];
    if (!base.nodeId || !created || created.type !== "node.created") continue;
    const node = { ...created.node, title: original.title } as ProdNode;
    const takeId = newId("tk");
    events.push(
      { ...created, node },
      { type: "take.added", take: { id: takeId, nodeId: node.id, mediaId: media.id, inSec: seg.inSec, outSec: seg.outSec, createdBy: by, createdAt: now } },
      { type: "node.updated", id: node.id, patch: { selectedTakeId: takeId } },
    );
    live.push(node);
    nodeIds.push(node.id);
    after = node.id;
  }
  return { events, nodeIds };
}

/** The last shot of the row (by position) whose chosen take is a stretch of `mediaId`: where shots edited from it go after. */
export function lastMadeFrom(nodes: ProdNode[], takes: Take[], original: ProdNode, mediaId: Id): Id | null {
  const mine = new Set(takes.filter((t) => t.mediaId === mediaId).map((t) => t.id));
  const row = childrenOf(nodes.filter((n) => n.shelvedAt === undefined && n.trashedAt === undefined), original.parentId);
  return row.filter((n) => n.selectedTakeId && mine.has(n.selectedTakeId)).at(-1)?.id ?? null;
}

// ---------- library (docs/INTERFAZ.md §2.8) ----------

/** The desk of the library, or a new card of a kind. Lives apart from the board. */
export function planCreateLibNode(p: Production, lib: LibKind, title: string, newId: Id, nodes: ProdNode[] = []): Plan {
  const statusId = p.statuses.slice().sort((a, b) => a.order - b.order)[0]?.id ?? "";
  const groups = nodes.filter((n) => n.lib?.kind === "card");
  // «Nuevo grupo» until the team names it.
  const name = lib.kind === "desk" ? "Mesa de trabajo" : title.trim() || NEW_GROUP;
  // `number`: creation order among the library's groups (who keeps a folder name first).
  const number = Math.max(0, ...groups.map((g) => g.number)) + 1;
  return { nodeId: newId, events: [{ type: "node.created", node: { id: newId, parentId: null, levelId: LIB_LEVEL, number, title: name, statusId, lib } }] };
}

/** Name of a new library group, until the team gives it its own. */
export const NEW_GROUP = "Nuevo grupo";

/** Where an image sorts in its library group. */
export const libOrder = (m: Pick<Media, "order" | "createdAt">) => m.order ?? m.createdAt;

/**
 * Images placed in a library group before another image (null: at the end),
 * in the order given: they take positions between their new neighbours, and
 * a new version number when they come from another group.
 */
export function planPlaceLibMedia(media: Array<Pick<Media, "id" | "nodeId" | "kind" | "version" | "order" | "createdAt" | "archived">>, nodes: ProdNode[], ids: Id[], toNodeId: Id, beforeId: Id | null): Plan {
  if (!nodes.some((n) => n.id === toNodeId && n.lib)) return EMPTY;
  const moving = ids.map((id) => media.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  if (!moving.length) return EMPTY;
  const rest = media.filter((m) => m.nodeId === toNodeId && !m.archived && !ids.includes(m.id)).sort((a, b) => libOrder(a) - libOrder(b));
  const at = beforeId ? rest.findIndex((m) => m.id === beforeId) : -1;
  const next = at >= 0 ? rest[at] : undefined;
  const prev = at >= 0 ? rest[at - 1] : rest.at(-1);
  const lo = prev ? libOrder(prev) : next ? libOrder(next) - (moving.length + 1) * 1000 : 0;
  const hi = next ? libOrder(next) : lo + (moving.length + 1) * 1000;
  const step = (hi - lo) / (moving.length + 1);
  const known = [...media];
  const events: LogEventBody[] = moving.map((m, i) => {
    const order = lo + step * (i + 1);
    if (m.nodeId === toNodeId) return { type: "media.updated", id: m.id, patch: { order } };
    const version = nextMediaVersion(known, toNodeId, m.kind);
    known.push({ ...m, nodeId: toNodeId, version });
    return { type: "media.updated", id: m.id, patch: { nodeId: toNodeId, version, order } };
  });
  return { events };
}

/**
 * Images into a library node (the desk or a card): each takes the next
 * version there. `chosen`: whether they go in as the card's references (true
 * when a card is made from them) or into its exploration.
 */
export function planMoveToLib(media: Array<Pick<Media, "id" | "nodeId" | "kind" | "version" | "chosen">>, nodes: ProdNode[], mediaIds: Id[], toNodeId: Id, chosen?: boolean): Plan {
  const to = nodes.find((n) => n.id === toNodeId && n.lib);
  if (!to) return EMPTY;
  const known = [...media];
  const events: LogEventBody[] = [];
  for (const id of mediaIds) {
    const m = known.find((x) => x.id === id);
    if (!m) continue;
    if (m.nodeId === toNodeId) {
      if (chosen !== undefined && !!m.chosen !== chosen) events.push({ type: "media.updated", id, patch: { chosen } });
      continue;
    }
    const version = nextMediaVersion(known, toNodeId, m.kind);
    known.push({ ...m, nodeId: toNodeId, version });
    events.push({ type: "media.updated", id, patch: { nodeId: toNodeId, version, chosen: !!chosen && to.lib?.kind === "card" } });
  }
  return { events };
}
